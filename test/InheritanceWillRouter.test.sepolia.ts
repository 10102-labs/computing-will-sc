import { ContractRunner } from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";
import "dotenv/config";
import { InheritanceWill__factory, InheritanceWillRouter, InheritanceWillRouter__factory } from "../typechain-types";
import { InheritanceWill, InheritanceWillStruct } from "./../typechain-types/contracts/InheritanceWill";
import fs from "fs";
import path from "path";
import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import {
  MetaTransactionData,
  SafeMultisigTransactionResponse,
  SafeSignature,
  SafeTransaction,
  TransactionResult,
} from "@safe-global/safe-core-sdk-types";

describe("InheritanceRouter", function () {
  /* config */
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const CHAIN_ID = process.env.SEPOLIA_CHAIN_ID;
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

  const INHERITANCE_WILL_ROUTER = process.env.INHERITANCE_WILL_ROUTER as string;
  const SAFEWALLET_SUCEESFULLY = process.env.SAFEWALLET_SUCCESSFULLY as string;
  const SAFEWALLET_LENGTH_TWO_ARRAY = process.env.SAFEWALLET_LENGTH_TWO_ARRAY as string;
  const SAFEWALLET_EXIST_GUARD = process.env.SAFEWALLET_NOT_EXIST_GUARD as string;
  const SAFEWALLET_SIGNER_NOT_OWNER = process.env.SAFEWALLET_SIGNER_NOT_OWNER as string;
  const SAFEWALLET_GUARD_INVALID = process.env.SAFEWALLET_GUARD_INVALID as string;
  const SAFEWALLET_MODULE_INVALID = process.env.SAFEWALLET_MODULE_INVALID as string;
  const ADMIN_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as string;
  const SIGNER1_PRIVATE_KEY = process.env.SIGNER1_PRIVATE_KEY as string;
  const SIGNER2_PRIVATE_KEY = process.env.SIGNER2_PRIVATE_KEY as string;
  const BENEFICIARIES1_PRIVATE_KEY = process.env.BENEFICIARIES1 as string;
  const BENEFICIARIES2_PRIVATE_KEY = process.env.BENEFICIARIES2 as string;
  const BENEFICIARIES3_PRIVATE_KEY = process.env.BENEFICIARIES3 as string;
  const NUM_BENEFICIARIES_LIMIT = process.env.NUM_BENEFICIARIES_LIMIT as string;

  /* Get router contract */
  async function getInheritanceWillRouter() {
    const inheritanceRouterFactory: InheritanceWillRouter__factory = await ethers.getContractFactory("InheritanceWillRouter");
    const inheritanceRouterContract: InheritanceWillRouter = inheritanceRouterFactory.attach(INHERITANCE_WILL_ROUTER) as InheritanceWillRouter;
    return inheritanceRouterContract;
  }

  /* Get will contract */
  async function getInheritanceWill(willAddress: string) {
    const inheritanceWillFactory: InheritanceWill__factory = await ethers.getContractFactory("InheritanceWill");
    const inheritanceWillContract: InheritanceWill = inheritanceWillFactory.attach(willAddress) as InheritanceWill;
    return inheritanceWillContract;
  }

  /* Create protocol kit */
  async function getProtocolKit(safeAddress: string, privateKeySigner: string): Promise<Safe> {
    const protocolKit: Safe = await Safe.init({
      provider: SEPOLIA_RPC_URL as string,
      signer: privateKeySigner,
      safeAddress: safeAddress,
    });
    return protocolKit;
  }

  /* Create api kit */
  async function getApiKit(): Promise<SafeApiKit> {
    const apiKit = await new SafeApiKit({
      chainId: BigInt(CHAIN_ID as string),
    });
    return apiKit;
  }

  /* Create transaction data */
  async function getMetaTransactionData(nameFn: string, arg: Object): Promise<MetaTransactionData> {
    const routerAbiJson = getAbi("../artifacts/contracts/InheritanceWillRouter.sol/InheritanceWillRouter.json");
    const routerAbi = new ethers.Interface(routerAbiJson);
    const selector = await routerAbi.encodeFunctionData(nameFn, Object.values(arg));
    const transactionData: MetaTransactionData = {
      to: INHERITANCE_WILL_ROUTER,
      value: "0",
      data: selector,
    };
    return transactionData;
  }

  /* Create transaction  */
  type CreateTransaction = {
    safeTransaction: SafeTransaction;
    safeTransactionHash: string;
    signature: SafeSignature;
  };

  async function createTransaction(protocolKit: Safe, signer: string, metaTransactionDatas: MetaTransactionData[]): Promise<string> {
    const safeTransaction: SafeTransaction = await protocolKit.createTransaction({
      transactions: metaTransactionDatas,
    });
    const safeTransactionHash: string = await protocolKit.getTransactionHash(safeTransaction);
    const signature: SafeSignature = await protocolKit.signHash(safeTransactionHash);
    const safeAddress: string = await protocolKit.getAddress();
    const apiKit: SafeApiKit = await getApiKit();

    await apiKit.proposeTransaction({
      safeAddress: safeAddress,
      senderAddress: signer,
      safeTxHash: safeTransactionHash,
      safeTransactionData: safeTransaction.data,
      senderSignature: signature.data,
    });
    return safeTransactionHash;
  }

  /* Sign transaction */
  async function signTransaction(protocolKit: Safe, safeTransactionHash: string) {
    const apiKit: SafeApiKit = await getApiKit();
    const signature: SafeSignature = await protocolKit.signHash(safeTransactionHash);
    await apiKit.confirmTransaction(safeTransactionHash, signature.data);
  }

  /* Execute transaction safe wallet */
  async function executeTransaction(protocolKit: Safe, safeTransactionHash: string): Promise<TransactionResult> {
    const apiKit: SafeApiKit = await getApiKit();
    const transaction: SafeMultisigTransactionResponse = await apiKit.getTransaction(safeTransactionHash);
    const tx = await protocolKit.executeTransaction(transaction);
    return tx;
  }

  /* Struct */
  type MainConfig = InheritanceWillRouter.WillMainConfigStruct;
  type ExtraConfig = InheritanceWillStruct.WillExtraConfigStruct;

  /* Functions */
  async function checkActiveWill(willId: bigint): Promise<boolean> {
    const inheritanceWillrouter: InheritanceWillRouter = await getInheritanceWillRouter();
    const tx = await inheritanceWillrouter.checkActiveWill(willId);
    return tx;
  }

  async function setBeneficiariesLimit(numBeneficiariesLimit: bigint) {
    const inheritanceWillrouter: InheritanceWillRouter = await getInheritanceWillRouter();
    const signer = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    await inheritanceWillrouter.connect(signer).setBeneficiaryLimit(numBeneficiariesLimit);
  }

  async function createWill(safeWallet: string, mainConfig: MainConfig, extraConfig: ExtraConfig, signer: ContractRunner) {
    const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
    const tx = await inheritanceWillRouter.connect(signer).createWill(safeWallet, mainConfig, extraConfig);
    return tx;
  }

  async function setWillConfig(protocolKit: Safe, signer: string, willId: bigint, mainConfig: MainConfig, extraConfig: ExtraConfig): Promise<string> {
    type ArgType = {
      willId: bigint;
      mainConfig: MainConfig;
      extraConfig: ExtraConfig;
    };
    const arg: ArgType = { willId, mainConfig, extraConfig };
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData("setWillConfig", arg);
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
    type ArgType = {
      willId: bigint;
      nicknames: string[];
      beneficiaries: string[];
      minRequiredSignatures: bigint;
    };
    const arg: ArgType = { willId, nicknames, beneficiaries, minRequiredSignatures };
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData("setWillBeneficiaries", arg);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }
  async function setActivationTrigger(protocolKit: Safe, signer: string, willId: bigint, lackOfOutgoingTxRange: bigint): Promise<string> {
    type ArgType = {
      willId: bigint;
      lackOfOutgoingTxRange: bigint;
    };
    const arg: ArgType = { willId: willId, lackOfOutgoingTxRange };
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData("setActivationTrigger", arg);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }
  async function setNameNote(protocolKit: Safe, signer: string, willId: bigint, name: string, note: string) {
    type ArgType = {
      willId: bigint;
      name: string;
      note: string;
    };
    const arg: ArgType = { willId, name, note };
    const metaTransactionData: MetaTransactionData = await getMetaTransactionData("setNameNote", arg);
    const safeTransactionHash: string = await createTransaction(protocolKit, signer, [metaTransactionData]);
    return safeTransactionHash;
  }
  async function activeWill(willId: bigint, signer: ContractRunner) {
    const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
    const tx = await inheritanceWillRouter.connect(signer).activeWill(willId);
    return tx;
  }

  /* Utils functions */
  function getAbi(abiPath: string) {
    const dir = path.resolve(__dirname, abiPath);
    const file = fs.readFileSync(dir, "utf-8");
    const json = JSON.parse(file);
    const abi = json.abi;
    return abi;
  }

  async function getLogsTransaction(nameContract: string, transactionHash: string) {
    const abi = getAbi(nameContract);
    const iface = new ethers.Interface(abi);
    const receipt = await provider.getTransactionReceipt(transactionHash);
    receipt?.logs.forEach((log) => {
      console.log(iface.parseLog(log)?.args);
    });
  }

  /* Create Will */
  describe("createWill", function () {
    it("Should create will successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [beneficiaries1.address],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 100,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //State Expect
      const willIdExpect: bigint = (await inheritanceWillRouter.willId()) + BigInt(1);
      const willAddressExpect: string = await inheritanceWillRouter.getNextWillAddress(signer.address);
      const guardAddressExpect: string = await inheritanceWillRouter.getNextGuardAddress(signer.address);
      const nonceByUserExpect: bigint = (await inheritanceWillRouter.nonceByUsers(signer.address)) + BigInt(1);
      const isActiveExpect: bigint = BigInt(1);
      const timestampExpect = 1;

      //Execute
      const tx = await createWill(SAFEWALLET_SUCEESFULLY, mainConfig, extraConfig, signer);

      //State After Execute
      const willId_: bigint = await inheritanceWillRouter.willId();
      const nonceByUser_ = await inheritanceWillRouter.nonceByUsers(signer.address);
      const willAddress_: string = await inheritanceWillRouter.willAddresses(willId_);
      const guardAddress_: string = await inheritanceWillRouter.guardAddresses(willId_);
      const will_: InheritanceWill = await getInheritanceWill(willAddress_);
      const willInfo_: [bigint, string, bigint] = await will_.getWillInfo();
      const beneficiaries_: string[] = await will_.getBeneficiaries();
      const activationTrigger_: bigint = await will_.getActivationTrigger();
      const minRequiredSignatures_: bigint = await will_.getMinRequiredSignatures();

      //Expect
      expect(willId_).to.equal(willIdExpect);
      expect(willAddress_).to.equal(willAddressExpect);
      expect(guardAddress_).to.equal(guardAddressExpect);
      expect(nonceByUser_).to.equal(nonceByUserExpect);
      expect(willInfo_[0]).to.equal(willIdExpect);
      expect(willInfo_[1]).to.equal(SAFEWALLET_SUCEESFULLY);
      expect(willInfo_[2]).to.equal(isActiveExpect);
      expect(activationTrigger_).to.equal(extraConfig.lackOfOutgoingTxRange);
      expect(minRequiredSignatures_).to.equal(extraConfig.minRequiredSignatures);
      expect(beneficiaries_).to.deep.equal(mainConfig.beneficiaries);
      expect(tx)
        .to.emit(inheritanceWillRouter, "InheritanceWillCreated")
        .withArgs(
          willIdExpect,
          willAddressExpect,
          guardAddressExpect,
          signer.address,
          SAFEWALLET_SUCEESFULLY,
          mainConfig,
          extraConfig,
          timestampExpect
        );
    });
    it("Should revert if length of beneficiaries list difference length of nicknames list ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1", "CW nickname2", "CW nickname3"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 100,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFEWALLET_LENGTH_TWO_ARRAY, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "TwoArraysLengthMismatch");
    });
    it("Should revert if not existed beneficiarires", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: [],
        beneficiaries: [],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 100,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFEWALLET_SUCEESFULLY, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "EmptyArray");
    });
    it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const beneficiaries3 = new ethers.Wallet(BENEFICIARIES3_PRIVATE_KEY, provider);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname1", "CW nickname2", "CW nickname3"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address, beneficiaries3.address],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 100,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const numBeneficiariesLimit: number = mainConfig.beneficiaries.length - 1;

      //Execute
      await setBeneficiariesLimit(BigInt(numBeneficiariesLimit));
      const tx = await createWill(SAFEWALLET_SUCEESFULLY, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    });
    it("Should revert if safe wallet existed guard ", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const mainConfig: MainConfig = {
        name: "CW name",
        note: "CW note",
        nickNames: ["CW nickname 1"],
        beneficiaries: [beneficiaries1.address],
      };

      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 1,
        lackOfOutgoingTxRange: 100,
      };
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      //Execute
      const tx = await createWill(SAFEWALLET_EXIST_GUARD, mainConfig, extraConfig, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ExistedGuardInSafeWallet").withArgs(SAFEWALLET_EXIST_GUARD);
    });
  });

  it("Should revert if signer is not owner of safe wallet ", async function () {
    const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
    //Input
    const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
    const mainConfig: MainConfig = {
      name: "CW name",
      note: "CW note",
      nickNames: ["CW nickname 1"],
      beneficiaries: [beneficiaries1.address],
    };

    const extraConfig: ExtraConfig = {
      minRequiredSignatures: 1,
      lackOfOutgoingTxRange: 100,
    };
    const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

    //Execute
    const tx = await createWill(SAFEWALLET_SIGNER_NOT_OWNER, mainConfig, extraConfig, signer);

    //Expect
    expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "SignerIsNotOwnerOfSafeWallet");
  });

  /* Set Will Config */
  describe("setWillConfig", function () {
    it("Should update will config successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 200,
      };

      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = await getInheritanceWill(willAddress);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //State Expect
      const timestampExpect = 1;

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
      expect(tx).to.emit(inheritanceWillRouter, "InheritanceWillConfigUpdated").withArgs(willId, mainConfig, extraConfig, timestampExpect);
    });
    it("Should revert if guard of safewallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 200,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });

    it("Should revert if module of safewallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 200,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });

    it("Should revert if length of beneficiaries list difference length of nicknames list", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2", "SWC nickname3"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 200,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_LENGTH_TWO_ARRAY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_LENGTH_TWO_ARRAY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "TwoArraysLengthMismatch");
    });
    it("Should revert if not exist beneficiaries", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

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
        lackOfOutgoingTxRange: 200,
      };

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "EmptyArray");
    });
    it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const beneficiaries3 = new ethers.Wallet(BENEFICIARIES3_PRIVATE_KEY, provider);

      const willId: bigint = BigInt(1);
      const mainConfig: MainConfig = {
        name: "SWC name",
        note: "SWC note",
        nickNames: ["SWC nickname1", "SWC nickname2", "SWC nickname3"],
        beneficiaries: [beneficiaries1.address, beneficiaries2.address, beneficiaries3.address],
      };
      const extraConfig: ExtraConfig = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 200,
      };
      const numBeneficiariesLimit: number = mainConfig.beneficiaries.length - 1;

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillConfig(protocolKit1, signer1.address, willId, mainConfig, extraConfig);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      await setBeneficiariesLimit(BigInt(numBeneficiariesLimit));
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    });
  });

  describe("setWillBeneficiaries", function () {
    it("Should update will beneficiaries successfully", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2"];
      const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address];
      const minRequiredSignatures: bigint = BigInt(3);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = await getInheritanceWill(willAddress);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
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
      expect(tx)
        .to.emit(inheritanceWillRouter, "InheritanceWillBeneficiesUpdated")
        .withArgs(willId, nicknames, beneficiaries, minRequiredSignatures, timestampExpect);
    });
    it("Should revert if guard of safewallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1", "SB nickname2"];
      const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });
    it("Should revert if module of safewallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1", "SB nickname2"];
      const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute

      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });
    it("Should revert if length of beneficiaries list difference length of nicknames list", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname 1", "SB nickname 2", "SB nickname3"];
      const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "TwoArraysLengthMismatch");
    });

    it("Should revert if not existed beneficiaries", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const willId: bigint = BigInt(1);
      const nicknames: string[] = [];
      const beneficiaries: string[] = [];
      const minRequiredSignatures: bigint = BigInt(3);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "EmptyArray");
    });
    it("Should revert if number of beneficiaries > beneficiariesLimit", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();

      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const beneficiaries2 = new ethers.Wallet(BENEFICIARIES2_PRIVATE_KEY, provider);
      const beneficiaries3 = new ethers.Wallet(BENEFICIARIES3_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const nicknames: string[] = ["SB nickname1", "SB nickname2", "SB nickname3"];
      const beneficiaries: string[] = [beneficiaries1.address, beneficiaries2.address, beneficiaries3.address];
      const minRequiredSignatures: bigint = BigInt(3);
      const numBeneficiariesLimit: number = beneficiaries.length - 1;

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const safeTransactionHash: string = await setWillBeneficiaries(
        protocolKit1,
        signer1.address,
        willId,
        nicknames,
        beneficiaries,
        minRequiredSignatures
      );
      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      await setBeneficiariesLimit(BigInt(numBeneficiariesLimit));
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    });
  });
  describe("setActivationTrigger", function () {
    it("Should update will activation trigger", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will: InheritanceWill = await getInheritanceWill(willAddress);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //State Expect
      const timestampExpect = 1;

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //State After Execute

      const activationTrigger_: bigint = await will.getActivationTrigger();

      //Expect
      expect(activationTrigger_).to.equal(lackOfOutgoingTxRange);
      expect(tx).to.emit(inheritanceWillRouter, "InheritanceWillCreated").withArgs(willId, lackOfOutgoingTxRange, timestampExpect);
    });
    it("Should revert if guard of safewallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });
    it("Should revert if module of safewallet is invalid", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(60);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });
  });

  describe("setNameNote", function () {
    it("Should update will name note", async function () {
      const inheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //State expect
      const timestamp = 1;

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      await expect(tx).to.emit(inheritanceWillRouter, "InheritanceWillNameNoteUpdated").withArgs(willId, name, note, timestamp);
    });

    it("Should revert if guard of safewallet is invalid", async function () {
      const inheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_GUARD_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      await expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "GuardSafeWalletInvalid");
    });
    it("Should revert if module of safewallet is invalid", async function () {
      const inheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const willId: bigint = BigInt(1);
      const name: string = "SNN name";
      const note: string = "SNN note";

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setNameNote(protocolKit1, signer1.address, willId, name, note);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_MODULE_INVALID, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      const tx: TransactionResult = await executeTransaction(protocolKit2, safeTransactionHash);

      //Expect
      await expect(tx).to.be.revertedWithCustomError(inheritanceWillRouter, "ModuleSafeWalletInvalid");
    });
  });

  describe("activeWill", function () {
    it("Should active will", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will = await getInheritanceWill(willAddress);
      const beneficiaries: string[] = await will.getBeneficiaries();
      const protocolKit: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, beneficiaries1.address);
      const owners: string[] = await protocolKit.getOwners();

      //State Expect
      const isActiveExpect: bigint = BigInt(2);
      const beneficiariesExpect: string[] = [];
      const ownersExpect: string[] = [...beneficiaries, ...owners];
      const thresholdExpect: bigint = await will.getMinRequiredSignatures();

      //Execute
      const tx = await activeWill(willId, beneficiaries1);

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
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const signer = new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will = await getInheritanceWill(willAddress);

      //Execute
      const tx = await activeWill(willId, signer);

      //Expect
      expect(tx).to.be.revertedWithCustomError(will, "NotBeneficiary");
    });
    it("Should revert if not time active will", async function () {
      const inheritanceWillRouter: InheritanceWillRouter = await getInheritanceWillRouter();
      //Input
      const beneficiaries1 = new ethers.Wallet(BENEFICIARIES1_PRIVATE_KEY, provider);
      const willId: bigint = BigInt(1);
      const lackOfOutgoingTxRange: bigint = BigInt(10 ** 9);
      const willAddress: string = await inheritanceWillRouter.willAddresses(willId);
      const will = await getInheritanceWill(willAddress);

      const protocolKit1: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER1_PRIVATE_KEY);
      const signer1 = await new ethers.Wallet(SIGNER1_PRIVATE_KEY, provider);

      const safeTransactionHash: string = await setActivationTrigger(protocolKit1, signer1.address, willId, lackOfOutgoingTxRange);

      const protocolKit2: Safe = await getProtocolKit(SAFEWALLET_SUCEESFULLY, SIGNER2_PRIVATE_KEY);
      signTransaction(protocolKit2, safeTransactionHash);

      //Execute
      await executeTransaction(protocolKit2, safeTransactionHash);
      const tx = await activeWill(willId, beneficiaries1);

      //Expect
      expect(tx).to.be.revertedWithCustomError(will, "NotEnoughContitionalActive");
    });
  });
});
