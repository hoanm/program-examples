import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';

describe('transfer-hook', () => {
  const PROGRAM_ID = 'GBCFPjb4wakaXSKvVU2jcXsTzG1nPra1J6ADXyVo4YmG';
  const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);

  // Inline IDL to avoid relying on on-chain or generated artifacts
  const IDL: anchor.Idl = {
    address: PROGRAM_ID,
    version: '0.1.0',
    name: 'transfer_hook',
    instructions: [
      {
        name: 'initialize_extra_account_meta_list',
        discriminator: [92, 197, 174, 197, 41, 124, 19, 3],
        accounts: [
          { name: 'payer', isMut: true, isSigner: true },
          { name: 'extra_account_meta_list', isMut: true, isSigner: false },
          { name: 'mint', isMut: false, isSigner: false },
          { name: 'system_program', isMut: false, isSigner: false },
          { name: 'white_list', isMut: true, isSigner: false },
        ],
        args: [],
      },
      {
        name: 'transfer_hook',
        discriminator: [220, 57, 220, 152, 126, 125, 97, 168],
        accounts: [
          { name: 'source_token', isMut: true, isSigner: false },
          { name: 'mint', isMut: false, isSigner: false },
          { name: 'destination_token', isMut: true, isSigner: false },
          { name: 'owner', isMut: false, isSigner: false },
          { name: 'extra_account_meta_list', isMut: false, isSigner: false },
          { name: 'white_list', isMut: false, isSigner: false },
        ],
        args: [{ name: 'amount', type: 'u64' }],
      },
      {
        name: 'add_to_whitelist',
        discriminator: [157, 211, 52, 54, 144, 81, 5, 55],
        accounts: [
          { name: 'new_account', isMut: false, isSigner: false },
          { name: 'white_list', isMut: true, isSigner: false },
          { name: 'signer', isMut: true, isSigner: true },
        ],
        args: [],
      },
    ],
    accounts: [],
    types: [
      {
        name: 'WhiteList',
        type: {
          kind: 'struct',
          fields: [
            { name: 'authority', type: 'pubkey' },
            { name: 'white_list', type: { vec: 'pubkey' } },
          ],
        },
      },
    ],
  };

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log('Using program id', PROGRAM_ID);

  const program = new anchor.Program(IDL, provider);
  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  // Generate keypair to use as address for the transfer-hook enabled mint
  const mint = new Keypair();
  const decimals = 9;
  const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('extra-account-metas'), mint.publicKey.toBuffer()],
    PROGRAM_PUBKEY,
  );
  const [whiteListPda] = PublicKey.findProgramAddressSync([Buffer.from('white_list')], PROGRAM_PUBKEY);

  const sendTxWithLogs = async (transaction: Transaction, signers: Keypair[] = []) => {
    // Always capture signature and logs for debugging
    transaction.feePayer = wallet.publicKey;
    const sig = await connection.sendTransaction(transaction, [wallet.payer, ...signers], {
      skipPreflight: true,
    });
    const tx = await connection.getTransaction(sig, { commitment: 'confirmed' });
    if (tx?.meta?.err) {
      console.error('Tx failed', sig, tx.meta.err, tx.meta.logMessages);
      throw new Error(JSON.stringify(tx.meta.err));
    }
    return sig;
  };

  // Sender token account address
  const sourceTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Recipient token account address
  const recipient = Keypair.generate();
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  it('Create Mint Account with Transfer Hook Extension', async () => {
    const extensions = [ExtensionType.TransferHook];
    const mintLen = getMintLen(extensions);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(
        mint.publicKey,
        wallet.publicKey,
        program.programId, // Transfer Hook Program ID
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(mint.publicKey, decimals, wallet.publicKey, null, TOKEN_2022_PROGRAM_ID),
    );

    const txSig = await sendTxWithLogs(transaction, [mint]);
    console.log(`Transaction Signature: ${txSig}`);
  });

  // Create the two token accounts for the transfer-hook enabled mint
  // Fund the sender token account with 100 tokens
  it('Create Token Accounts and Mint Tokens', async () => {
    // 100 tokens
    const amount = 100 * 10 ** decimals;

    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        sourceTokenAccount,
        wallet.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        destinationTokenAccount,
        recipient.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(mint.publicKey, sourceTokenAccount, wallet.publicKey, amount, [], TOKEN_2022_PROGRAM_ID),
    );

    const txSig = await sendTxWithLogs(transaction);

    console.log(`Transaction Signature: ${txSig}`);
  });

  // Account to store extra accounts required by the transfer hook instruction
  it('Create ExtraAccountMetaList Account', async () => {
    const initializeExtraAccountMetaListInstruction = await program.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: wallet.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        mint: mint.publicKey,
        systemProgram: SystemProgram.programId,
        whiteList: whiteListPda,
      })
      .instruction();

    const transaction = new Transaction().add(initializeExtraAccountMetaListInstruction);

    const txSig = await sendTxWithLogs(transaction);

    console.log('Transaction Signature:', txSig);
  });

  it('Add account to white list', async () => {
    const addAccountToWhiteListInstruction = await program.methods
      .addToWhitelist()
      .accounts({
        newAccount: destinationTokenAccount,
        whiteList: whiteListPda,
        signer: wallet.publicKey,
      })
      .instruction();

    const transaction = new Transaction().add(addAccountToWhiteListInstruction);

    const txSig = await sendTxWithLogs(transaction);
    console.log('White Listed:', txSig);
  });

  it('Transfer Hook with Extra Account Meta', async () => {
    // 1 tokens
    const amount = 1 * 10 ** decimals;
    const bigIntAmount = BigInt(amount);

    // Standard token transfer instruction
    const transferInstruction = await createTransferCheckedWithTransferHookInstruction(
      connection,
      sourceTokenAccount,
      mint.publicKey,
      destinationTokenAccount,
      wallet.publicKey,
      bigIntAmount,
      decimals,
      [],
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(transferInstruction);

    const txSig = await sendTxWithLogs(transaction);
    console.log('Transfer Checked:', txSig);
  });
});
