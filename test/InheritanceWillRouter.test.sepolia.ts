import { expect } from "chai";
import { InheritanceWill, InheritanceWillRouter } from "../typechain-types";
import { InheritanceWillStruct } from "./../typechain-types/contracts/inheritance/InheritanceWillRouter";
import * as InheritanceWillRouterMetadata from "../artifacts/contracts/inheritance/InheritanceWillRouter.sol/InheritanceWillRouter.json";
import { ethers } from "hardhat";
import { InterfaceAbi, Wallet } from "ethers";
import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import {
  MetaTransactionData,
  OperationType,
  SafeMultisigTransactionResponse,
  SafeSignature,
  SafeTransaction,
  TransactionResult,
} from "@safe-global/safe-core-sdk-types";

import * as dotenv from "dotenv";
dotenv.config();

describe("InheritanceRouter", function () {
  /* config */
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const CHAIN_ID = process.env.SEPOLIA_CHAIN_ID;
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

  const INHERITANCE_WILL_ROUTER = process.env.INHERITANCE_WILL_ROUTER as string;

  const SAFE_WALLET = process.env.SAFE_WALLET_SUCCESSFULLY as string;
  const SAFE_WALLET_INVALID_PARAM = process.env.SAFE_WALLET_LENGTH_TWO_ARRAY as string;
  const SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID = process.env.SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID as string;
  const SAFE_WALLET_SIGNER_NOT_OWNER = process.env.SAFE_WALLET_SIGNER_NOT_OWNER as string;

  const SIGNER1_PRIVATE_KEY = process.env.SIGNER1_PRIVATE_KEY as string;
  const SIGNER2_PRIVATE_KEY = process.env.SIGNER2_PRIVATE_KEY as string;

  const BENEFICIARY1 = process.env.BENEFICIARY1 as string;
  const BENEFICIARY2 = process.env.BENEFICIARY2 as string;

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
  type MainConfig = InheritanceWillRouter.WillMainConfigStruct;
  type ExtraConfig = InheritanceWillStruct.WillExtraConfigStruct;

  /* Get contract */
  async function getContract(tag: string, address: string) {
    const factory = await ethers.getContractFactory(tag);
    const contract = factory.attach(address);
    return contract;
  }

  /* Functions */
  async function checkActiveWill(willId: bigint): Promise<boolean> {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;
    const tx = await inheritanceWillRouter.checkActiveWill(willId);
    return tx;
  }

  async function createWill(safeWallet: string, mainConfig: MainConfig, extraConfig: ExtraConfig, signer: Wallet) {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;
    const tx = await inheritanceWillRouter.connect(signer).createWill(safeWallet, mainConfig, extraConfig);
    return tx;
  }

  async function setWillConfig(protocolKit: Safe, signer: string, willId: bigint, mainConfig: MainConfig, extraConfig: ExtraConfig): Promise<string> {
    const data = getEncodeFunctionData(InheritanceWillRouterMetadata.abi, "setWillConfig", [willId, mainConfig, extraConfig]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(INHERITANCE_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }

  async function setWillBeneficiaries(
    protocolKit: Safe,
    signer: string,
    willId: bigint,
    nicknames: string[],
    beneficiaries: string[],
    minRequiredSignatures: bigint
  ): Promise<string> {
    const data = getEncodeFunctionData(InheritanceWillRouterMetadata.abi, "setWillBeneficiaries", [
      willId,
      nicknames,
      beneficiaries,
      minRequiredSignatures,
    ]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(INHERITANCE_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }

  async function setActivationTrigger(protocolKit: Safe, signer: string, willId: bigint, lackOfOutgoingTxRange: bigint): Promise<string> {
    const data = getEncodeFunctionData(InheritanceWillRouterMetadata.abi, "setActivationTrigger", [willId, lackOfOutgoingTxRange]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(INHERITANCE_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }

  async function setNameNote(protocolKit: Safe, signer: string, willId: bigint, name: string, note: string) {
    const data = getEncodeFunctionData(InheritanceWillRouterMetadata.abi, "setNameNote", [willId, name, note]);
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData(INHERITANCE_WILL_ROUTER, data);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }
  async function activeWill(willId: bigint, signer: Wallet) {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;
    const tx = await inheritanceWillRouter.connect(signer).activeWill(willId);
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
    it.only("Should create will successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [BENEFICIARY1],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 100,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //State Expect
      const willIdExpect: bigint = (await inheritanceWillRouter._willId()) + BigInt(1);
      const nonceByUserExpect: bigint = (await inheritanceWillRouter.nonceByUsers(signer.address)) + BigInt(1);
      const isActiveExpect: bigint = BigInt(1);

      //Execute
      const tx = await createWill(SAFE_WALLET, mainConfig, extraConfig, signer);

      //State After Execute
      const willId_: bigint = await inheritanceWillRouter._willId();
      const nonceByUser_ = await inheritanceWillRouter.nonceByUsers(signer.address);
      const willAddress_: string = await inheritanceWillRouter.willAddresses(willId_);
      const guardAddress_: string = await inheritanceWillRouter.guardAddresses(willId_);
      const will_: InheritanceWill = (await getContract("InheritanceWill", willAddress_)) as InheritanceWill;
      const willInfo_: [bigint, string, bigint] = await will_.getWillInfo();
      const beneficiaries_: string[] = await will_.getBeneficiaries();
      const activationTrigger_: bigint = await will_.getActivationTrigger();
      const minRequiredSignatures_: bigint = await will_.getMinRequiredSignatures();

      //Expect
      expect(willId_).to.equal(willIdExpect);
      expect(nonceByUser_).to.equal(nonceByUserExpect);
      expect(willInfo_[0]).to.equal(willIdExpect);
      expect(willInfo_[1]).to.equal(SAFE_WALLET);
      expect(willInfo_[2]).to.equal(isActiveExpect);
      expect(activationTrigger_).to.equal(extraConfig.lackOfOutgoingTxRange);
      expect(minRequiredSignatures_).to.equal(extraConfig.minRequiredSignatures);
      expect(beneficiaries_).to.deep.equal(mainConfig.beneficiaries);
    });

    it("Should revert if length of beneficiaries list difference length of nicknames list ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname2"],
        beneficiaries: [BENEFICIARY1],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiariesInvalid");
    });

    it("Should revert if not existed beneficiaries", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: [],
        beneficiaries: [],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiariesInvalid");
    });

    // it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
    //   const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
    //     "InheritanceWillRouter",
    //     INHERITANCE_WILL_ROUTER
    //   )) as InheritanceWillRouter;

    //   //Input
    //   const mainConfig: MainConfig = {
    //     name: "CW name",
    //     note: "CW note",
    //     nickNames: ["CW nickname1", "CW nickname2", "CW nickname3"],
    //     beneficiaries: [BENEFICIARY1, BENEFICIARY2, BENEFICIARY3],
    //   };

    //   const extraConfig: ExtraConfig = {
    //     minRequiredSignatures: 1,
    //     lackOfOutgoingTxRange: 100,
    //   };
    //   const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    //   const numBeneficiariesLimit: number = mainConfig.beneficiaries.length - 1;

    //   //Execute
    //   const tx = await createWill(SAFEWALLET_SUCEESFULLY, mainConfig, extraConfig, signer);

    //   //Expect
    //   expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    // });

    it("Should revert if safe wallet existed guard ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input

      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [BENEFICIARY1],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ExistedGuardInSafeWallet").withArgs(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID);
    });
  });

  it("Should revert if signer is not owner of safe wallet ", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input

    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [BENEFICIARY1],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 60,
    };
    const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_SIGNER_NOT_OWNER, mainConfig, extraConfig, signer);

    //Expect
    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "SignerIsNotOwnerOfSafeWallet");
  });

  it("Should revert if activation trigger invalid ", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input

    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [BENEFICIARY1],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 0,
    };
    const signer1 = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

    //Expect
    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ActivationTriggerInvalid");
  });

  it("Should revert if beneficiary = zeroAddress", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input
    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [ethers.ZeroAddress],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 60,
    };

    const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
  });

  it("Should revert if beneficiary is owner", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input
    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [SAFE_WALLET_INVALID_PARAM],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 60,
    };

    const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
  });

  it("Should revert if beneficiary is a contract", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input
    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [INHERITANCE_WILL_ROUTER],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 60,
    };

    const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
  });

  it("Should revert if beneficiary is the signer of safe wallet", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Input
    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [signer1.address],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 60,
    };

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer1);

    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
  });

  it("Should revert if revert min required signature invalid ", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input

    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1", "CW nickname 2"],
      beneficiaries: [BENEFICIARY1, BENEFICIARY2],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 3,
      lackOfOutgoingTxRange: 60,
    };
    const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer);

    //Expect
    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "MinRequiredSignaturesInvalid");
  });

  it("Should revert if revert min required signature invalid ", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
      "InheritanceWillRouter",
      INHERITANCE_WILL_ROUTER
    )) as InheritanceWillRouter;

    //Input

    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1", "CW nickname 2"],
      beneficiaries: [BENEFICIARY1, BENEFICIARY2],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 0,
      lackOfOutgoingTxRange: 60,
    };
    const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFE_WALLET_INVALID_PARAM, mainConfig, extraConfig, signer);

    //Expect
    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "MinRequiredSignaturesInvalid");
  });

  /* Set Will Config */
  describe("setWillConfig", function () {
    it.only("Should update will config successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        beneficiaries: [BENEFICIARY1, BENEFICIARY2],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 120,
      };

      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = (await getContract("InheritanceWill", willAddress)) as InheritanceWill;

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //State Expect

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //State After Execute
      const beneficiaries_: string[] = await will.getBeneficiaries();
      const activationTrigger_: bigint = await will.getActivationTrigger();
      const minRequiredSignatures_: bigint = await will.getMinRequiredSignatures();

      //Expect
      expect(activationTrigger_).to.equal(extraConfig.lackOfOutgoingTxRange);
      expect(minRequiredSignatures_).to.equal(extraConfig.minRequiredSignatures);
      expect(beneficiaries_).to.deep.equal(mainConfig.beneficiaries);
      // expect(tx).to.emit(inheritanceWillRouter, "InheritanceWillConfigUpdated").withArgs(willId, mainConfig, extraConfig);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        beneficiaries: [BENEFICIARY1, BENEFICIARY2],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
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
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input

      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        beneficiaries: [BENEFICIARY1, BENEFICIARY2],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
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
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });

    it("Should revert if length of beneficiaries list difference length of nicknames list", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2", "SWC nickname3"],
        beneficiaries: [BENEFICIARY1, BENEFICIARY2],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 120,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiariesInvalid");
    });

    it("Should revert if not exist beneficiaries", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: [],
        beneficiaries: [],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 120,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiariesInvalid");
    });

    //     it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
    //       const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

    //       //Input
    //       const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
    //       const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
    //       const beneficiaries3 = new ethers.Wallet(BENEFICIARIES3_PRIVATE_KEY, provider);

    //       const willId: bigint = BigInt(1);
    //       const mainConfig: MainConfig = {
    //         name: "SWC name",
    //         note: "SWC note",
    //         nickNames: ["SWC nickname1", "SWC nickname2", "SWC nickname3"],
    //         beneficiaries: [beneficiaries1.address, beneficiaries2.address, beneficiaries3.address],
    //       };
    //       const extraConfig: ExtraConfig = {
    //         minRequiredSignatures: 2,
    //         lackOfOutgoingTxRange: 200,
    //       };
    //       const numBeneficiariesLimit: number = mainConfig.beneficiaries.length - 1;

    //       const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
    //       const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    //       const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

    //       const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
    //       signTransaction(protocolKit2, safeTransactionHash);

    //       //Execute
    //       const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

    //       //Expect
    //       expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    //     });
    it("Should revert if activation trigger invalid ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [BENEFICIARY1],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 0,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ActivationTriggerInvalid");
    });

    it("Should revert if beneficiary = zeroAddress", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [ethers.ZeroAddress],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary is owner of safe wallet", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [SAFE_WALLET_INVALID_PARAM],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary is a contract", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [INHERITANCE_WILL_ROUTER],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary in the signer of safe wallet", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [signer1.address],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 60,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if revert min required signature invalid ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname 2"],
        beneficiaries: [BENEFICIARY1, BENEFICIARY2],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 3,
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "MinRequiredSignaturesInvalid");
    });

    it("Should revert if revert min required signature invalid ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname 2"],
        beneficiaries: [BENEFICIARY1, BENEFICIARY2],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 0,
        lackOfOutgoingTxRange: 60,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "MinRequiredSignaturesInvalid");
    });
  });

  describe("setWillBeneficiaries", function () {
    it("Should update will beneficiaries successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;
      //Input

      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2"];
      const beneficiaries: string[] = [BENEFICIARY1, BENEFICIARY2];
      const minRequiredSignatures: bigint = BigInt(3);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = (await getContract("InheritanceWill", willAddress)) as InheritanceWill;

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //State Expect
      const timestampExpect = 1;

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //State After Execute
      const beneficiaries_: string[] = await will.getBeneficiaries();
      const minRequiredSignatures_: bigint = await will.getMinRequiredSignatures();

      //Expect
      expect(minRequiredSignatures_).to.equal(minRequiredSignatures);
      expect(beneficiaries_).to.deep.equal(beneficiaries);
      // expect(tx)
      //   .to.emit(inheritanceWillRouter, "InheritanceWillBeneficiesUpdated")
      //         .withArgs(willId, nicknames, beneficiaries, minRequiredSignatures, timestampExpect);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1", "SB nickname2"];
      const beneficiaries: string[] = [BENEFICIARY1, BENEFICIARY2];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input

      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1", "SB nickname2"];
      const beneficiaries: string[] = [BENEFICIARY1, BENEFICIARY2];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_EXISTED_GUARD_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });

    it("Should revert if length of beneficiaries list difference length of nicknames list", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2", "SB nickname3"];
      const beneficiaries: string[] = [BENEFICIARY1, BENEFICIARY2];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiariesInvalid");
    });

    it("Should revert if not existed beneficiaries", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = [];
      const beneficiaries: string[] = [];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiariesInvalid");
    });

    it("Should revert if beneficiary = zeoAddress", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const beneficiaries: string[] = [ethers.ZeroAddress];
      const minRequiredSignatures: bigint = BigInt(1);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary owner of safe wallet", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const beneficiaries: string[] = [SAFE_WALLET_INVALID_PARAM];
      const minRequiredSignatures: bigint = BigInt(1);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary is a contract", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const beneficiaries: string[] = [INHERITANCE_WILL_ROUTER];
      const minRequiredSignatures: bigint = BigInt(1);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary is the signer of safe wallet", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1"];
      const beneficiaries: string[] = [signer1.address];
      const minRequiredSignatures: bigint = BigInt(1);

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryInvalid");
    });

    //   it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
    //     const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
    //       "InheritanceWillRouter",
    //       INHERITANCE_WILL_ROUTER
    //     )) as InheritanceWillRouter;

    //     //Input
    //     const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
    //     const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
    //     const beneficiaries3 = new ethers.Wallet(BENEFICIARIES3_PRIVATE_KEY, provider);
    //     const willId: bigint = BigInt(1);
    //     const nicknames: string[] = ["SB nickname1", "SB nickname2", "SB nickname3"];
    //     const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address, beneficiaries3.address];
    //     const minRequiredSignatures: bigint = BigInt(3);
    //     const numBeneficiariesLimit: number = beneficiaries.length - 1;

    //     const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
    //     const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
    //     const safeTransactionHash: string = await setWillBeneficiaries(
    //       protocolKit1,
    //       signer1.address,
    //       willId,
    //       nicknames,
    //       beneficiaries,
    //       minRequiredSignatures
    //     );
    //     const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
    //     signTransaction(protocolKit2, safeTransactionHash);

    //     //Execute

    //     const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

    //     expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    //   });
    // });

    it("Should revert if revert min required signature invalid ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["CW nickname 1", "CW nickname 2"];
      const beneficiaries: string[] = [BENEFICIARY1, BENEFICIARY2];
      const minRequiredSignatures: bigint = BigInt(3);

      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "MinRequiredSignaturesInvalid");
    });

    it("Should revert if revert min required signature invalid ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["CW nickname 1", "CW nickname 2"];
      const beneficiaries: string[] = [BENEFICIARY1, BENEFICIARY2];
      const minRequiredSignatures: bigint = BigInt(0);
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "MinRequiredSignaturesInvalid");
    });
  });

  describe("setActivationTrigger", function () {
    it.only("Should update will activation trigger", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = (await getContract("InheritanceWill", willAddress)) as InheritanceWill;

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
      // expect(tx).to.emit(inheritanceWillRouter, "InheritanceWillCreated").withArgs(willId, lackOfOutgoingTxRange, timestampExpect);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

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
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

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
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });

    it("Should revert if activation trigger invalid ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(0);

      //Execute
      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET_INVALID_PARAM, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ActivationTriggerInvalid");
    });
  });

  describe("setNameNote", function () {
    it("Should update will name note", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //State expect
      const timestamp = 1;

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      // //Expect
      // await expect(tx).to.emit(inheritanceWillRouter, "InheritanceWillNameNoteUpdated").withArgs(willId, name, note, timestamp);
    });

    it("Should revert if guard of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;
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
      await expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safe wallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;
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
      await expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });
  });

  describe("activeWill", function () {
    it("Should active will successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input

      const willId: bigint = BigInt(1);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = (await getContract("InheritanceWill", willAddress)) as InheritanceWill;
      const beneficiaries: string[] = await will.getBeneficiaries();
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const protocolKit: Safe = await getProtocolKit(SAFE_WALLET, signer1.address);
      const owners: string[] = await protocolKit.getOwners();

      //State Expect
      const isActiveExpect: bigint = BigInt(2);
      const beneficiariesExpect: string[] = [];
      const ownersExpect: string[] = [...beneficiaries, ...owners];
      const thresholdExpect: bigint = await will.getMinRequiredSignatures();

      //Execute
      const tx = await activeWill(willId, signer1);

      //State After Execute
      const willInfo_: [bigint, string, bigint] = await will.getWillInfo();
      const beneficiaries_: string[] = await will.getBeneficiaries();
      const threshold_: number = await protocolKit.getThreshold();
      const owners_: string[] = await protocolKit.getOwners();

      //Expect
      expect(willInfo_[2]).to.equal(isActiveExpect);
      expect(beneficiaries_).to.equal(beneficiariesExpect);
      expect(threshold_).to.equal(thresholdExpect);
      expect(owners_).to.equal(ownersExpect);
    });

    it("Should revert if signer not contain beneficiaries", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;

      //Input
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = (await getContract("InheritanceWill", willAddress)) as InheritanceWill;

      //Execute
      const tx = await activeWill(willId, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(will, "NotBeneficiary");
    });

    it("Should revert if not time active will", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = (await getContract(
        "InheritanceWillRouter",
        INHERITANCE_WILL_ROUTER
      )) as InheritanceWillRouter;
      //Input

      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(10 ** 9);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = (await getContract("InheritanceWill", willAddress)) as InheritanceWill;

      const protocolKit1: Safe = await getProtocolKit(SAFE_WALLET, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFE_WALLET, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      await executeTransaction(protocolKit2, safeTransactionHash);
      const tx = await activeWill(willId, signer1);

      //Expect
      expect(tx).to.be.revertedWithCustomError(will, "NotEnoughConditionalActive");
    });
  });
});
