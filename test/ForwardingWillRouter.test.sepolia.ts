import { InterfaceAbi, Wallet } from "ethers";
import { ForwardingWill, ForwardingWillRouter, SafeGuard, Token } from "../typechain-types";
import * as ForwardingWillRouterMetadata from "../artifacts/contracts/forwarding/ForwardingWillRouter.sol/ForwardingWillRouter.json";
import { expect } from "chai";
import { ethers } from "hardhat";
import Safe from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import {
  MetaTransactionData,
  OperationType,
  SafeMultisigTransactionResponse,
  SafeSignature,
  SafeTransaction,
  TransactionResult,
} from "@safe-global/safe-core-sdk-types";

import * as dotenv from "dotenv";
import { ForwardingWillStruct } from "../typechain-types/contracts/forwarding/ForwardingEOAWill";
dotenv.config();

describe("Forwarding Router", function () {
  /* config */
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const CHAIN_ID = process.env.SEPOLIA_CHAIN_ID;
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

  const FORWARDING_WILL_ROUTER = process.env.FORWARDING_WILL_ROUTER as string;
  const SAFE_WALLET = process.env.SAFE_WALLET_SUCCESSFULLY as string;
  const SAFE_WALLET_INVALID_PARAM = process.env.SAFE_WALLET_LENGTH_TWO_ARRAY as string;
  const SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID = process.env.SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID as string;
  const SAFE_WALLET_SIGNER_NOT_OWNER = process.env.SAFE_WALLET_SIGNER_NOT_OWNER as string;

  const SIGNER1_PRIVATE_KEY = process.env.SIGNER1_PRIVATE_KEY as string;
  const SIGNER2_PRIVATE_KEY = process.env.SIGNER2_PRIVATE_KEY as string;

  const BENEFICIARY1 = process.env.BENEFICIARY1 as string;
  const BENEFICIARY2 = process.env.BENEFICIARY2 as string;

  const USDC = process.env.USDC as string;
  const USDT = process.env.USDT as string;

  /* Api Kit, allow propose and share transactions with the other signers of safe wallet*/
  const apiKit = new SafeApiKit({
    chainId: BigInt(CHAIN_ID as string),
  });

  /* Protocol kit, allow signer interact with safe smart account  */
  async function getProtocolKit(safeAddress: string, privateKeySigner: string): Promise<Safe> {
    const protocolKit: Safe = await Safe.init({
      provider: SEPOLIA_RPC_URL as string,
      signer: privateKeySigner,
      safeAddress: safeAddress,
    });
    return protocolKit;
  }

  /* Create transaction data */
  async function getMetaTransactionData(target: string, data: string): Promise<MetaTransactionData> {
    const transactionData: MetaTransactionData = {
      to: target,
      value: "0",
      data: data,
      operation: OperationType.Call,
    };
    return transactionData;
  }

  async function getMetaTransactionDataDelegateCall(target: string, data: string): Promise<MetaTransactionData> {
    const transactionData: MetaTransactionData = {
      to: target,
      value: "0",
      data: data,
      operation: OperationType.DelegateCall,
    };
    return transactionData;
  }

  /* Create transaction hash */
  async function createTransaction(protocolKit: Safe, signer: string, metaTransactionDatas: MetaTransactionData[]): Promise<string> {
    const safeTransaction: SafeTransaction = await protocolKit.createTransaction({
      transactions: metaTransactionDatas,
    });

    const safeTransactionHash: string = await protocolKit.getTransactionHash(safeTransaction);
    const signature: SafeSignature = await protocolKit.signHash(safeTransactionHash);
    const safeAddress: string = await protocolKit.getAddress();

    await apiKit.proposeTransaction({
      safeAddress: safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash: safeTransactionHash,
      senderAddress: signer,
      senderSignature: signature.data,
    });

    return safeTransactionHash;
  }

  /* Sign transaction */
  async function signTransaction(protocolKit: Safe, safeTransactionHash: string) {
    const signature: SafeSignature = await protocolKit.signHash(safeTransactionHash);
    await apiKit.confirmTransaction(safeTransactionHash, signature.data);
  }

  /* Execute transaction safe wallet */
  async function executeTransaction(protocolKit: Safe, safeTransactionHash: string): Promise<TransactionResult> {
    const transaction: SafeMultisigTransactionResponse = await apiKit.getTransaction(safeTransactionHash);
    const response = await protocolKit.executeTransaction(transaction);
    return response;
  }

  /* Struct */
  type MainConfig = ForwardingWillRouter.WillMainConfigStruct;
  type ExtraConfig = ForwardingWillStruct.WillExtraConfigStruct;
  type Distribution = ForwardingWillStruct.DistributionStruct;

  /* Get contract */
  async function getContract(tag: string, address: string) {
    const factory = await ethers.getContractFactory(tag);
    const contract = factory.attach(address);
    return contract;
  }

  /* Functions */
  async function checkActiveWill(willId: bigint): Promise<boolean> {
    const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
    const tx = await forwardingWillRouter.checkActiveWill(willId);
    return tx;
  }

  async function createWill(safeWallet: string, mainConfig: MainConfig, extraConfig: ExtraConfig, signer: Wallet) {
    const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
    const tx = await forwardingWillRouter.connect(signer).createWill(safeWallet, mainConfig, extraConfig);
    return tx;
  }

  async function setWillConfig(protocolKit: Safe, signer: string, willId: bigint, mainConfig: MainConfig, extraConfig: ExtraConfig): Promise<string> {
    const data = getEncodeFunctionData(ForwardingWillRouterMetadata.abi, "setWillConfig", [willId, mainConfig, extraConfig]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(FORWARDING_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }

  async function setWillDistributions(
    protocolKit: Safe,
    signer: string,
    willId: bigint,
    nicknames: string[],
    distributions: Distribution[]
  ): Promise<string> {
    distributions;
    const data = getEncodeFunctionData(ForwardingWillRouterMetadata.abi, "setWillDistributions", [willId, nicknames, distributions]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(FORWARDING_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }
  async function setActivationTrigger(protocolKit: Safe, signer: string, willId: bigint, lackOfOutgoingTxRange: bigint): Promise<string> {
    const data = getEncodeFunctionData(ForwardingWillRouterMetadata.abi, "setActivationTrigger", [willId, lackOfOutgoingTxRange]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(FORWARDING_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }
  async function setNameNote(protocolKit: Safe, signer: string, willId: bigint, name: string, note: string) {
    const data = getEncodeFunctionData(ForwardingWillRouterMetadata.abi, "setNameNote", [willId, name, note]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(FORWARDING_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }

  async function activeWill(willId: bigint, assets: string[], isETH: boolean, signer: Wallet) {
    const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
    const tx = await forwardingWillRouter.connect(signer).activeWill(willId, assets, isETH);
    return tx;
  }

  /* Utils functions */

  function getEncodeFunctionData(abi: InterfaceAbi, functionName: string, args: any[]): string {
    const iface = new ethers.Interface(abi);
    const data = iface.encodeFunctionData(functionName, args);
    return data;
  }

  /* Create Will */
  describe("createWill", function () {
    it("Should create will successfully", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //State Expect
      const willIdExpect: bigint = (await forwardingWillRouter._willId()) + BigInt(1);

      const nonceByUserExpect: bigint = (await forwardingWillRouter.nonceByUsers(signer.address)) + BigInt(1);
      const isActiveExpect: bigint = BigInt(1);

      //Execute
      const tx = await createWill(SAFE_WALLET, mainConfig, extraConfig, signer);

      //State After Execute
      const willId_: bigint = await forwardingWillRouter._willId();
      const nonceByUser_ = await forwardingWillRouter.nonceByUsers(signer.address);
      const willAddress_: string = await forwardingWillRouter.willAddresses(willId_);

      const will_: ForwardingWill = (await getContract("ForwardingWill", willAddress_)) as ForwardingWill;
      const willInfo_: [bigint, string, bigint] = await will_.getWillInfo();
      const activationTrigger_: bigint = await will_.getActivationTrigger();

      //Expect
      expect(willId_).to.equal(willIdExpect);
      expect(nonceByUser_).to.equal(nonceByUserExpect);
      expect(willInfo_[0]).to.equal(willIdExpect);
      expect(willInfo_[1]).to.equal(SAFE_WALLET);
      expect(willInfo_[2]).to.equal(isActiveExpect);
      expect(activationTrigger_).to.equal(extraConfig.lackOfOutgoingTxRange);
    });

    it("Should revert if length of beneficiaries list difference length of nicknames list ", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname2"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "DistributionsInvalid");
    });

    it("Should revert if not existed beneficiaries", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: [],
        distributions: [],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "DistributionsInvalid");
    });

    it("Should revert if safe wallet existed guard ", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input

      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ExistedGuardInSafeWallet").withArgs(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID);
    });

    it("Should revert if signer is not owner of safe wallet ", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input

      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_SIGNER_NOT_OWNER, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "SignerIsNotOwnerOfSafeWallet");
    });

    // it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
    //   const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

    //   //Input
    //   const mainConfig: MainConfig = {
    //     name: "CW name",
    //     note: "CW note",
    //     nickNames: ["CW nickname1", "CW nickname2", "CW nickname3"],
    //     distributions: [{user: BENEFICIARY1, percent: 30}, {user: BENEFICIARY2, percent: 30}, {user: BENEFICIARY3, percent: 40}],
    //   };

    //   const extraConfig: ExtraConfig = {
    //     lackOfOutgoingTxRange: 60,
    //   };
    //   const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    //   const numBeneficiariesLimit: number = mainConfig.beneficiaries.length - 1;

    //   //Execute
    //   await setBeneficiariesLimit(BigInt(numBeneficiariesLimit));
    //   const tx = await createWill(SAFE_WALLET, mainConfig, extraConfig, signer);

    //   //Expect
    //   expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "BeneficiaryLimitExceeded");
    // });

    it("Should revert if activation trigger = 0 ", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input

      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 0,
      };
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ActivationTriggerInvalid");
    });

    it("Should revert if distribution percent = 0", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 0 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionPercentInvalid");
    });

    it("Should revert if distribution percent > 100", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input

      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 101 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionPercentInvalid");
    });

    it("Should revert if distribution user = zeroAddress", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input

      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: ethers.ZeroAddress, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution user is owner of safe wallet", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: SAFE_WALLET_INVALID_PARAM, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution user is a contract", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: FORWARDING_WILL_ROUTER, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution total percent invalid", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname 2"],
        distributions: [
          { user: BENEFICIARY1, percent: 50 },
          { user: BENEFICIARY1, percent: 51 },
        ],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "TotalPercentInvalid");
    });
  });

  /* Set Will Config */
  describe("setWillConfig", function () {
    it("Should update will config successfully", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        distributions: [
          { user: BENEFICIARY1, percent: 40 },
          { user: BENEFICIARY2, percent: 60 },
        ],
      };
      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 120,
      };

      const willAddress: string = await forwardingWillRouter.willAddresses(willId);
      const guardAddress_: string = await forwardingWillRouter.guardAddresses(willId);
      const will: ForwardingWill = (await getContract("ForwardingWill", willAddress)) as ForwardingWill;
      const guard: SafeGuard = (await getContract("SafeGuard", guardAddress_)) as SafeGuard;
      const lastTimestampBefore = await guard.getLastTimestampTxs();

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //State After Execute
      const beneficiaries: string[] = await will.getBeneficiaries();
      const activationTrigger: bigint = await will.getActivationTrigger();
      const lastTimestampAfter = await guard.getLastTimestampTxs();

      //Expect
      expect(activationTrigger).to.equal(extraConfig.lackOfOutgoingTxRange);
      expect(lastTimestampAfter - lastTimestampBefore).to.greaterThan(0);
      expect(beneficiaries[0]).to.equal(mainConfig.distributions[0].user);
      expect(beneficiaries[1]).to.equal(mainConfig.distributions[1].user);
      expect(await will._distributions(beneficiaries[0])).to.equals(mainConfig.distributions[0].percent);
      expect(await will._distributions(beneficiaries[1])).to.equals(mainConfig.distributions[1].percent);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        distributions: [
          { user: BENEFICIARY1, percent: 40 },
          { user: BENEFICIARY2, percent: 60 },
        ],
      };
      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 120,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safe wallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        distributions: [
          { user: BENEFICIARY1, percent: 40 },
          { user: BENEFICIARY2, percent: 60 },
        ],
      };
      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 120,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ModuleSafeWalletInvalid");
    });

    it("Should revert if length of distributions difference length of nicknames", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };
      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 120,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "DistributionsInvalid");
    });

    it("Should revert if not exist distributions", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: [],
        distributions: [],
      };
      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 120,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "DistributionsInvalid");
    });

    //   it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
    //     const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

    //     //Input

    //     const willId: bigint = BigInt(1);
    //     const mainConfig: MainConfig = {
    //       name: "SWC name",
    //       note: "SWC note",
    //       nickNames: ["SWC nickname1", "SWC nickname2", "SWC nickname3"],
    //     };
    //     const extraConfig: ExtraConfig = {
    //       lackOfOutgoingTxRange: 120,
    //     };
    //     const numBeneficiariesLimit: number = mainConfig.beneficiaries.length - 1;

    //     const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
    //     const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    //     const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

    //     const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
    //     signTransaction(protocolKit2, safeTransactionHash);

    //     //Execute
    //     await setBeneficiariesLimit(BigInt(numBeneficiariesLimit));
    //     const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

    //     //Expect
    //     expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "BeneficiaryLimitExceeded");
    //   });
    it("Should revert if activation trigger = 0 ", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 0,
      };

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ActivationTriggerInvalid");
    });

    it("Should revert if distribution percent = 0", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 0 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionPercentInvalid");
    });

    it("Should revert if distribution percent > 100", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: BENEFICIARY1, percent: 101 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionPercentInvalid");
    });

    it("Should revert if distribution user = zeroAddress", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: ethers.ZeroAddress, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution user is owner of safe wallet", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: SAFE_WALLET_INVALID_PARAM, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution user is a contract", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        distributions: [{ user: FORWARDING_WILL_ROUTER, percent: 100 }],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution total percent invalid", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname 2"],
        distributions: [
          { user: BENEFICIARY1, percent: 50 },
          { user: BENEFICIARY1, percent: 51 },
        ],
      };

      const extraConfig: ExtraConfig = {
        lackOfOutgoingTxRange: 60,
      };
      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "TotalPercentInvalid");
    });
  });

  describe("setWillBeneficiaries", function () {
    it("Should update will beneficiaries successfully", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2"];
      const distributions: Distribution[] = [
        { user: BENEFICIARY1, percent: 50 },
        { user: BENEFICIARY2, percent: 50 },
      ];
      const willAddress: string = await forwardingWillRouter.willAddresses(willId);
      const guardAddress: string = await forwardingWillRouter.guardAddresses(willId);
      const will: ForwardingWill = (await getContract("ForwardingWill", willAddress)) as ForwardingWill;
      const guard: SafeGuard = (await getContract("SafeGuard", guardAddress)) as SafeGuard;
      const lastTimestampBefore = await guard.getLastTimestampTxs();

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //State After Execute
      const beneficiaries: string[] = await will.getBeneficiaries();
      const lastTimestampAfter = await guard.getLastTimestampTxs();

      //Expect
      expect(lastTimestampAfter - lastTimestampBefore).to.greaterThan(0);
      expect(beneficiaries[0]).to.equal(distributions[0].user);
      expect(beneficiaries[1]).to.equal(distributions[1].user);
      expect(await will._distributions(beneficiaries[0])).to.equals(distributions[0].percent);
      expect(await will._distributions(beneficiaries[1])).to.equals(distributions[1].percent);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2"];
      const distributions: Distribution[] = [
        { user: BENEFICIARY1, percent: 50 },
        { user: BENEFICIARY2, percent: 50 },
      ];

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safe wallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1", "SB nickname2"];
      const distributions: Distribution[] = [
        { user: BENEFICIARY1, percent: 50 },
        { user: BENEFICIARY2, percent: 50 },
      ];

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ModuleSafeWalletInvalid");
    });

    it("Should revert if length of beneficiaries list difference length of nicknames list", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2"];
      const distributions: Distribution[] = [{ user: BENEFICIARY1, percent: 100 }];

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "DistributionsInvalid");
    });

    it("Should revert if not existed beneficiaries", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = [];
      const distributions: Distribution[] = [];

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "DistributionsInvalid");
    });
    //   it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
    //     const forwardingWillRouter: ForwardingWillRouter =  (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

    //     //Input
    //     const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
    //     const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
    //     const beneficiaries3 = new ethers.Wallet(BENEFICIARIES3_PRIVATE_KEY, provider);
    //     const willId: bigint = BigInt(1);
    //     const nicknames: string[] = ["SB nickname1", "SB nickname2", "SB nickname3"];
    //     const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address, beneficiaries3.address];
    //     const minRequiredSignatures: bigint = BigInt(3);
    //     const numBeneficiariesLimit: number = beneficiaries.length - 1;

    //     const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
    //     const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    //     const safeTransactionHash: string = await setWillBeneficiaries(
    //       protocolKit1,
    //       signer1.address,
    //       willId,
    //       nicknames,
    //       beneficiaries,
    //       minRequiredSignatures
    //     );
    //     const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
    //     signTransaction(protocolKit2, safeTransactionHash);

    //     //Execute
    //     await setBeneficiariesLimit(BigInt(numBeneficiariesLimit));
    //     const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

    //     expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "BeneficiaryLimitExceeded");
    //   });
    // });

    it("Should revert if distribution percent = 0", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);

      const nicknames: string[] = ["SB nickname1"];
      const distributions: Distribution[] = [{ user: BENEFICIARY1, percent: 0 }];

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionPercentInvalid");
    });

    it("Should revert if distribution percent > 100", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input

      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const distributions: Distribution[] = [{ user: BENEFICIARY1, percent: 101 }];

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionPercentInvalid");
    });

    it("Should revert if distribution user = zeroAddress", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const distributions: Distribution[] = [{ user: ethers.ZeroAddress, percent: 100 }];

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution user is owner of safe wallet", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const distributions: Distribution[] = [{ user: SAFE_WALLET_INVALID_PARAM, percent: 100 }];

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution user is a contract", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const distributions: Distribution[] = [{ user: FORWARDING_WILL_ROUTER, percent: 100 }];

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "DistributionUserInvalid");
    });

    it("Should revert if distribution total percent invalid", async function () {
      const ForwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["CW nickname 1", "CW nickname 2"];
      const distributions: Distribution[] = [
        { user: BENEFICIARY1, percent: 50 },
        { user: BENEFICIARY1, percent: 51 },
      ];

      //Execute
      const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillDistributions(protocolKit1, signer1.address, willId, nicknames, distributions);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(ForwardingWillRouter, "TotalPercentInvalid");
    });
  });

  describe("setActivationTrigger", function () {
    it("Should update will activation trigger", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);
      const willAddress: string = await forwardingWillRouter.willAddresses(willId);
      const will: ForwardingWill = (await getContract("ForwardingWill", willAddress)) as ForwardingWill;

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //State After Execute

      const activationTrigger_: bigint = await will.getActivationTrigger();

      //Expect
      expect(activationTrigger_).to.equal(lackOfOutgoingTxRange);
      // expect(tx).to.emit(forwardingWillRouter, "InheritanceWillCreated").withArgs(willId, lackOfOutgoingTxRange, timestampExpect);
    });

    it("Should revert if guard of safewallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safewallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ModuleSafeWalletInvalid");
    });
  });

  describe("setNameNote", function () {
    it("Should update will name note", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      // await expect(tx).to.emit(forwardingWillRouter, "ForwardingWillNameNoteUpdated").withArgs(willId, name, note, timestamp);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      await expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safewallet is invalid", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      await expect(tx).to.be.revertedWithCustomError(forwardingWillRouter, "ModuleSafeWalletInvalid");
    });
  });

  describe("safe guard", function () {
    it("should update by delegate call", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;

      //Input
      const nicknames: string[] = ["SG nickname 1", "SG nickname 2"];
      const distributions: Distribution[] = [
        { user: BENEFICIARY1, percent: 40 },
        { user: BENEFICIARY2, percent: 60 },
      ];
      const willId: bigint = BigInt(1);
      const guardAddress: string = await forwardingWillRouter.guardAddresses(willId);
      const guard: SafeGuard = (await getContract("SafeGuard", guardAddress)) as SafeGuard;
      const lastTimestampBefore = await guard.getLastTimestampTxs();

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const data = getEncodeFunctionData(ForwardingWillRouterMetadata.abi, "setWillDistributions", [willId, nicknames, distributions]);
      const metaTransactionData: MetaTransactionData = await getMetaTransactionDataDelegateCall(FORWARDING_WILL_ROUTER, data);
      const safeTransactionHash: string = await createTransaction(protocolKit1, signer1.address, [metaTransactionData]);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);

      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);
      const lastTimestampAfter = await guard.getLastTimestampTxs();

      //Expect
      expect(lastTimestampAfter - lastTimestampBefore).to.greaterThan(0);
    });
  });

  describe("activeWill", async function () {
    const signer1: Wallet = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    const usdc: Token = (await getContract("Token", USDC)) as Token;
    const usdt: Token = (await getContract("Token", USDT)) as Token;
    usdc.connect(signer1).mint(SAFE_WALLET, ethers.parseEther("1000"));
    usdt.connect(signer1).mint(SAFE_WALLET, ethers.parseEther("1000"));

    it("Should active will successfully", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const willId: bigint = BigInt(1);
      const willAddress: string = await forwardingWillRouter.willAddresses(willId);
      const guardAddress: string = await forwardingWillRouter.guardAddresses(willId);
      const guard: SafeGuard = (await getContract("SafeGuard", guardAddress)) as SafeGuard;
      const will: ForwardingWill = (await getContract("ForwardingWill", willAddress)) as ForwardingWill;
      const beneficiaries: string[] = await will.getBeneficiaries();
      const lastTimestampBefore: bigint = await guard.getLastTimestampTxs();

      const balanceOwnerUSDC: number = Number(await usdc.balanceOf(will.getWillOwner()));
      const balanceOwnerUSDT: number = Number(await usdt.balanceOf(will.getWillOwner()));

      // Input active will
      const assets: string[] = [USDT, USDC];
      const isETH: boolean = false;

      //State Expect
      const isActiveExpect: bigint = BigInt(2);

      //Execute
      const tx = await activeWill(willId, assets, isETH, signer);

      //State After Execute
      const willInfo_: [bigint, string, bigint] = await will.getWillInfo();
      const lastTimestampAfter: bigint = await guard.getLastTimestampTxs();

      //Expect
      expect(willInfo_[2]).to.equal(isActiveExpect);
      expect(lastTimestampAfter - lastTimestampBefore).to.greaterThan(0);
      for (let i = 0; i < beneficiaries.length - 1; i++) {
        let percent = Number(await will._distributions(beneficiaries[i]));
        let balanceUSDCBeneficiary = Number(await usdc.balanceOf(beneficiaries[i]));
        let balanceUSDTBeneficiary = Number(await usdc.balanceOf(beneficiaries[i]));
        let amountUSDCExpect = (balanceOwnerUSDC * percent) / 100;
        let amountUSDTExpect = (balanceOwnerUSDT * percent) / 100;
        expect(balanceUSDCBeneficiary).to.equals(amountUSDCExpect);
        expect(balanceUSDTBeneficiary).to.equals(amountUSDTExpect);
      }
    });

    it("Should revert if not time active will", async function () {
      const forwardingWillRouter: ForwardingWillRouter = (await getContract("ForwardingWillRouter", FORWARDING_WILL_ROUTER)) as ForwardingWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(10 ** 9);

      const willAddress: string = await forwardingWillRouter.willAddresses(willId);
      const will = (await getContract("ForwardingWill", willAddress)) as ForwardingWill;

      const assets: string[] = [USDC, USDT];
      const isETH: boolean = true;
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      await executeTransaction(protocolKit2, safeTransactionHash);
      const tx = await activeWill(willId, assets, isETH, signer1);

      //Expect
      expect(tx).to.be.revertedWithCustomError(will, "NotEnoughConditionalActive");
    });
  });
});
