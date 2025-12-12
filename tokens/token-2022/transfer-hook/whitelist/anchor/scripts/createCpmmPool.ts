import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  printSimulate,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { initSdk, txVersion } from "./config.ts";

export const createPool = async () => {
  const raydium = await initSdk({ loadToken: true });

  // check token list here: https://api-v3.raydium.io/mint/list
  // WSOL
  const mintWSOL = {
    chainId: 101,
    address: "So11111111111111111111111111111111111111112",
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    logoURI:
      "https://img-v1.raydium.io/icon/So11111111111111111111111111111111111111112.png",
    symbol: "WSOL",
    name: "Wrapped SOL",
    decimals: 9,
    tags: [],
    extensions: {},
    type: "raydium",
    priority: 2,
  };
  // Token-2022
  const mintToken = {
    address: "3tYWQJZRShMRVxCsaNBsRBQ6ZgEhKP9UNQsZa1eoZZTk",
    programId: "AUubRa8gyR4kd6P4Nnss9a5HdDbSQdjNh8JGCFG3Y638",
    decimals: 9,
  };

  /**
   * you also can provide mint info directly like below, then don't have to call token info api
   *  {
      address: 'So11111111111111111111111111111111111111112',
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      decimals: 9,
    } 
   */

  const feeConfigs = await raydium.api.getCpmmConfigs();

  if (raydium.cluster === "devnet") {
    feeConfigs.forEach((config) => {
      // config.id = getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, config.index).publicKey.toBase58()
      config.id = getCpmmPdaAmmConfigId(
        DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        config.index
      ).publicKey.toBase58();
    });
  }

  const { execute, extInfo, transaction } = await raydium.cpmm.createPool({
    // poolId: // your custom publicKey, default sdk will automatically calculate pda pool id
    // programId: CREATE_CPMM_POOL_PROGRAM, // devnet: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM
    // poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC, // devnet:  DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
    mintA: mintToken,
    mintB: mintWSOL,
    mintAAmount: new BN(0),
    mintBAmount: new BN(0),
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion,
    // optional: set up priority fee here
    // computeBudgetConfig: {
    //   units: 600000,
    //   microLamports: 46591500,
    // },
  });

  printSimulate([transaction]);

  // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
  try {
    const { txId } = await execute({ sendAndConfirm: true });
    console.log("pool created", {
      txId,
      poolKeys: Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]:
            extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      ),
    });
  } catch (e) {
    console.error("create pool failed", e);
  }

  process.exit(); // if you don't want to end up node execution, comment this line
};

/** uncomment code below to execute */
createPool();
