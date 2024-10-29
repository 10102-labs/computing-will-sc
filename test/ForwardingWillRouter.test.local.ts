import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ForwardingWill, ForwardingWillRouter, WillToken } from "../typechain-types";
import { ForwardingWillStruct } from "../typechain-types/contracts/ForwardingWillRouter";

describe("ForwardingWillRouter", function () {
  async function deployRouterFixture() {
    const [deployer, operator, feeReceiver, user1, user2, user3] = await ethers.getSigners();
    // Deploy mock ERC20
    const erc20Contract1 = await ethers.deployContract("WillToken", ["Will V1", "WV1"], deployer);
    await erc20Contract1.waitForDeployment();
    const erc20Contract2 = await ethers.deployContract("WillToken", ["Will V2", "WV2"], deployer);
    await erc20Contract2.waitForDeployment();
    // Deploy ERC20Whitelist
    const erc20Whitelist = await ethers.deployContract("ERC20Whitelist", deployer);
    await erc20Whitelist.waitForDeployment();
    // Set whitelist
    await erc20Whitelist.connect(deployer).updateWhitelist([erc20Contract1.target, erc20Contract2.target], true);
    // Deploy ForwardingWillRouter
    const forwardingWillRouter = await ethers.deployContract(
      "ForwardingWillRouter",
      [0, feeReceiver.address, 0, erc20Whitelist.target],
      deployer
    );
    await forwardingWillRouter.waitForDeployment();
    await forwardingWillRouter.connect(deployer).addOperator(operator.address);
    const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

    return {
      deployer,
      operator,
      feeReceiver,
      user1,
      user2,
      user3,
      erc20Contract1,
      erc20Contract2,
      erc20Whitelist,
      forwardingWillRouter,
      ETH_ADDRESS,
    };
  }

  /* Deployment */
  describe("Deployment", function () {
    it("Should set the right admin", async function () {
      const { deployer, forwardingWillRouter } = await loadFixture(deployRouterFixture);

      const ADMIN_ROLE = await forwardingWillRouter.DEFAULT_ADMIN_ROLE();
      expect(await forwardingWillRouter.hasRole(ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("Should set the right configures", async function () {
      const { feeReceiver, erc20Whitelist, forwardingWillRouter } = await loadFixture(deployRouterFixture);

      expect(await forwardingWillRouter.willFee()).to.equal(0);
      expect(await forwardingWillRouter.feeReceiver()).to.equal(feeReceiver.address);
      expect(await forwardingWillRouter.willLimit()).to.equal(0);
      expect(await forwardingWillRouter.erc20Whitelist()).to.equal(erc20Whitelist.target);
    });
  });

  async function getWillContract(willAddress: string) {
    const forwardingWillFactory = await ethers.getContractFactory("ForwardingWill");
    const forwardingWill: ForwardingWill = forwardingWillFactory.attach(willAddress) as any;
    return forwardingWill;
  }

  const extraConfig: ForwardingWillStruct.WillExtraConfigStruct = {
    minRequiredSignatures: 1,
    lackOfOutgoingTxRange: 2,
  };

  async function createWill(
    user1: any,
    user2: any,
    user3: any,
    forwardingWillRouter: ForwardingWillRouter,
    erc20Contract1: WillToken,
    erc20Contract2: WillToken,
    ETH_ADDRESS: string,
    value: bigint = BigInt(0)
  ) {
    const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
      name: "My will",
      note: "For my family",
      nickNames: ["Dad", "Mom"],
      distributions: [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 50, 100],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target],
          percents: [80, 50],
        },
      ],
    };
    const mainConfigTuple = [
      mainConfig.name,
      mainConfig.note,
      mainConfig.nickNames,
      [
        [user2.address, [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS], [20, 50, 100]],
        [user3.address, [erc20Contract1.target, erc20Contract2.target], [80, 50]],
      ],
    ];
    const extraConfigTuple = [extraConfig.minRequiredSignatures, extraConfig.lackOfOutgoingTxRange];

    const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
    await forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig, { value });
    const willId = await forwardingWillRouter.willId();

    return { willId, willAddress, mainConfig, extraConfig, mainConfigTuple, extraConfigTuple };
  }

  async function getTimestampOfNextBlock() {
    const nextTimestamp = (await time.latest()) + 1;
    await time.setNextBlockTimestamp(nextTimestamp);
    return nextTimestamp;
  }

  /* Create will */
  describe("Create will", function () {
    // Happy cases
    it("Should change router state", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const newWillId = (await forwardingWillRouter.willId()) + BigInt(1);
      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const willCountByUser = (await forwardingWillRouter.willCountByUsers(user1.address)) + BigInt(1);
      const nonceByUser = (await forwardingWillRouter.nonceByUsers(user1.address)) + BigInt(1);

      await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);

      expect(await forwardingWillRouter.willId()).to.equal(newWillId);
      expect(await forwardingWillRouter.willAddresses(newWillId)).to.equal(willAddress);
      expect(await forwardingWillRouter.willCountByUsers(user1.address)).to.equal(willCountByUser);
      expect(await forwardingWillRouter.nonceByUsers(user1.address)).to.equal(nonceByUser);
    });

    it("Should change forwarding will state", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      expect(await forwardingWill.getWillInfo()).to.deep.equal([willId, user1.address, 1]);
      expect(await forwardingWill.getActivationTrigger()).to.equal(2);
      expect(await forwardingWill.minRequiredSignatures()).to.equal(1);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user2.address)).to.equal(20);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user3.address)).to.equal(80);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user2.address)).to.equal(50);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user3.address)).to.equal(50);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user2.address)).to.equal(100);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user3.address)).to.equal(0);
      expect(await forwardingWill.getBeneficiaries()).to.deep.equal([user2.address, user3.address]);
      expect(await forwardingWill.getAllAssets()).to.deep.equal([erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS]);
    });

    it("Should emit ForwardingWillCreated event ", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { mainConfig, extraConfig, mainConfigTuple, extraConfigTuple } = await createWill(
        user1,
        user2,
        user3,
        forwardingWillRouter,
        erc20Contract1,
        erc20Contract2,
        ETH_ADDRESS
      );
      const timestamp = await getTimestampOfNextBlock();
      const willId = (await forwardingWillRouter.willId()) + BigInt(1);
      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);

      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig))
        .to.emit(forwardingWillRouter, "ForwardingWillCreated")
        .withArgs(willId, willAddress, user1.address, mainConfigTuple, extraConfigTuple, timestamp);
    });

    it("Should handle case of duplicate user in asset distribution config", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom", "Dad"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
            percents: [20, 50, 100],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [10, 40],
          },
        ],
      };
      const newWillId = (await forwardingWillRouter.willId()) + BigInt(1);
      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const willCountByUser = (await forwardingWillRouter.willCountByUsers(user1.address)) + BigInt(1);
      const nonceByUser = (await forwardingWillRouter.nonceByUsers(user1.address)) + BigInt(1);

      await forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig);
      const forwardingWill = await getWillContract(willAddress);

      // Router state
      expect(await forwardingWillRouter.willId()).to.equal(newWillId);
      expect(await forwardingWillRouter.willAddresses(newWillId)).to.equal(willAddress);
      expect(await forwardingWillRouter.willCountByUsers(user1.address)).to.equal(willCountByUser);
      expect(await forwardingWillRouter.nonceByUsers(user1.address)).to.equal(nonceByUser);
      // Will state
      expect(await forwardingWill.getWillInfo()).to.deep.equal([newWillId, user1.address, 1]);
      expect(await forwardingWill.getActivationTrigger()).to.equal(2);
      expect(await forwardingWill.minRequiredSignatures()).to.equal(1);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user2.address)).to.equal(10);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user3.address)).to.equal(80);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user2.address)).to.equal(40);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user3.address)).to.equal(50);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user2.address)).to.equal(100);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user3.address)).to.equal(0);
      expect(await forwardingWill.getBeneficiaries()).to.deep.equal([user2.address, user3.address]);
      expect(await forwardingWill.getAllAssets()).to.deep.equal([erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS]);
    });

    it("Should handle case of duplicate asset in asset distribution config", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS, erc20Contract1.target],
            percents: [20, 50, 100, 40],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target, erc20Contract1.target],
            percents: [80, 50, 60],
          },
        ],
      };
      const newWillId = (await forwardingWillRouter.willId()) + BigInt(1);
      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const willCountByUser = (await forwardingWillRouter.willCountByUsers(user1.address)) + BigInt(1);
      const nonceByUser = (await forwardingWillRouter.nonceByUsers(user1.address)) + BigInt(1);

      await forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig);
      const forwardingWill = await getWillContract(willAddress);

      // Router state
      expect(await forwardingWillRouter.willId()).to.equal(newWillId);
      expect(await forwardingWillRouter.willAddresses(newWillId)).to.equal(willAddress);
      expect(await forwardingWillRouter.willCountByUsers(user1.address)).to.equal(willCountByUser);
      expect(await forwardingWillRouter.nonceByUsers(user1.address)).to.equal(nonceByUser);
      // Will state
      expect(await forwardingWill.getWillInfo()).to.deep.equal([newWillId, user1.address, 1]);
      expect(await forwardingWill.getActivationTrigger()).to.equal(2);
      expect(await forwardingWill.minRequiredSignatures()).to.equal(1);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user2.address)).to.equal(40);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user3.address)).to.equal(60);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user2.address)).to.equal(50);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user3.address)).to.equal(50);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user2.address)).to.equal(100);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user3.address)).to.equal(0);
      expect(await forwardingWill.getBeneficiaries()).to.deep.equal([user2.address, user3.address]);
      expect(await forwardingWill.getAllAssets()).to.deep.equal([erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS]);
    });

    // Unhappy cases
    it("Should revert if asset percentages are greater than 100", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
            percents: [21, 50, 100],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "InvalidPercent"
      );
    });

    it("Should revert if beneficiary limit is reached", async function () {
      const { deployer, user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
            percents: [20, 50, 100],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };
      // Set beneficiary limit
      await forwardingWillRouter.connect(deployer).setBeneficiaryLimit(1);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWillRouter,
        "BeneficiaryLimitExceeded"
      );
    });

    it("Should revert if min required signatures > number of beneficiaries", async function () {
      const { user1, user2, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom", "Dad"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
            percents: [20, 50, 100],
          },
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [50, 30],
          },
        ],
      };
      const extraConfig: ForwardingWillStruct.WillExtraConfigStruct = {
        minRequiredSignatures: 2,
        lackOfOutgoingTxRange: 2,
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "MinRequiredSignaturesInvalid"
      );
    });

    it("Should revert if assets array and percents array length mismatch", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
            percents: [20, 50],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "TwoArrayLengthMismatch"
      );
    });

    it("Should revert if beneficiary is address 0", async function () {
      const { user1, user2, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
            percents: [20, 50, 100],
          },
          {
            user: ethers.ZeroAddress,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "BeneficiaryInvalid"
      );
    });

    it("Should revert if assets array is empty", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [20, 50],
          },
          {
            user: user3,
            assets: [],
            percents: [],
          },
        ],
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "EmptyArray"
      );
    });

    it("Should revert if percent = 0", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [20, 0],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "InvalidPercent"
      );
    });

    it("Should revert if percent > 100", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [20, 101],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "InvalidPercent"
      );
    });

    it("Should revert if asset is not in Whitelist", async function () {
      const { deployer, user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, erc20Whitelist } = await loadFixture(
        deployRouterFixture
      );
      const mainConfig: ForwardingWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        distributions: [
          {
            user: user2.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [20, 50],
          },
          {
            user: user3.address,
            assets: [erc20Contract1.target, erc20Contract2.target],
            percents: [80, 50],
          },
        ],
      };
      await erc20Whitelist.connect(deployer).updateWhitelist([erc20Contract1.target], false);

      const willAddress = await forwardingWillRouter.getNextWillAddressOfUser(user1.address);
      const forwardingWill = await getWillContract(willAddress);
      await expect(forwardingWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        forwardingWill,
        "ERC20NotInWhitelist"
      );
    });

    it("Should revert if will limit is reached", async function () {
      const { deployer, user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );
      await forwardingWillRouter.connect(deployer).setWillLimit(2);
      await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      await expect(createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS)).to.be.revertedWithCustomError(
        forwardingWillRouter,
        "WillLimitExceeded"
      );
    });
  });

  /* Delete will */
  describe("Delete will", function () {
    // Happy cases
    it("Should change router state", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      expect(await forwardingWillRouter.willCountByUsers(user1.address)).to.equal(1);
      expect(await forwardingWillRouter.nonceByUsers(user1.address)).to.equal(1);

      await forwardingWillRouter.connect(user1).deleteWill(willId);
      expect(await forwardingWillRouter.willCountByUsers(user1.address)).to.equal(0);
      expect(await forwardingWillRouter.nonceByUsers(user1.address)).to.equal(1);
    });

    it("Should change forwarding will state", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(
        user1,
        user2,
        user3,
        forwardingWillRouter,
        erc20Contract1,
        erc20Contract2,
        ETH_ADDRESS,
        etherAmount
      );
      expect(await ethers.provider.getBalance(willAddress)).to.equal(etherAmount);

      await expect(forwardingWillRouter.connect(user1).deleteWill(willId)).to.changeEtherBalance(user1, etherAmount);
      expect(await ethers.provider.getBalance(willAddress)).to.equal(0);

      const forwardingWill = await getWillContract(willAddress);
      expect(await forwardingWill.getWillInfo()).to.deep.equal([willId, user1.address, 0]);
      expect(await forwardingWill.getBeneficiaries()).to.deep.equal([]);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user2.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user3.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user2.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user3.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user2.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user3.address)).to.equal(0);
    });

    it("Should emit ForwardingWillDeleted event", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const timestamp = await getTimestampOfNextBlock();

      await expect(forwardingWillRouter.connect(user1).deleteWill(willId))
        .to.emit(forwardingWillRouter, "ForwardingWillDeleted")
        .withArgs(willId, user1.address, timestamp);
    });

    // Unhappy cases
    it("Should revert if will does not exist", async function () {
      const { user1, forwardingWillRouter } = await loadFixture(deployRouterFixture);

      await expect(forwardingWillRouter.connect(user1).deleteWill(1)).to.be.revertedWithCustomError(forwardingWillRouter, "WillNotFound");
    });

    it("Should revert if sender is not owner", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      await createWill(user2, user1, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      await expect(forwardingWillRouter.connect(user2).deleteWill(willId)).to.be.revertedWithCustomError(forwardingWill, "OnlyOwner");
    });

    it("Should revert if will is not activated", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      await forwardingWillRouter.connect(user1).deleteWill(willId);
      await expect(forwardingWillRouter.connect(user1).deleteWill(willId)).to.be.revertedWithCustomError(forwardingWill, "WillNotActive");
    });

    it("Should revert if sender is not router", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      await expect(forwardingWill.connect(user1).deleteWill(user1.address)).to.be.revertedWithCustomError(forwardingWill, "OnlyRouter");
    });
  });

  /* Withdraw ETH from the will */
  describe("Withdraw ETH", function () {
    it("Should withdraw ETH to the owner", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(
        user1,
        user2,
        user3,
        forwardingWillRouter,
        erc20Contract1,
        erc20Contract2,
        ETH_ADDRESS,
        etherAmount
      );

      const withdrawAmount = ethers.parseEther("0.5");
      await expect(forwardingWillRouter.connect(user1).withdrawEthFromWill(willId, withdrawAmount)).to.changeEtherBalances(
        [user1, willAddress],
        [withdrawAmount, withdrawAmount - etherAmount]
      );
    });

    it("Should revert if will not enough balance", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(
        user1,
        user2,
        user3,
        forwardingWillRouter,
        erc20Contract1,
        erc20Contract2,
        ETH_ADDRESS,
        etherAmount
      );
      const forwardingWill = await getWillContract(willAddress);

      await expect(forwardingWillRouter.connect(user1).withdrawEthFromWill(willId, etherAmount + BigInt(1))).to.be.revertedWithCustomError(
        forwardingWill,
        "NotEnoughEther"
      );
    });

    it("Should revert if sender is not owner", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(
        user1,
        user2,
        user3,
        forwardingWillRouter,
        erc20Contract1,
        erc20Contract2,
        ETH_ADDRESS,
        etherAmount
      );
      const forwardingWill = await getWillContract(willAddress);

      await expect(forwardingWillRouter.connect(user2).withdrawEthFromWill(willId, etherAmount)).to.be.revertedWithCustomError(
        forwardingWill,
        "OnlyOwner"
      );
    });
  });

  /* Update will asset distribution */
  describe("Update will asset distribution", function () {
    it("Should update asset distribution", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [30, 40, 50],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [70, 60, 50],
        },
      ];
      await forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom"], assetsDistribution, 2);

      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user2.address)).to.equal(30);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user3.address)).to.equal(70);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user2.address)).to.equal(40);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user3.address)).to.equal(60);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user2.address)).to.equal(50);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user3.address)).to.equal(50);
    });

    it("Should update beneficiaries", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target],
          percents: [0, 40],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [70, 60, 50],
        },
        {
          user: user2.address,
          assets: [erc20Contract2.target, ETH_ADDRESS],
          percents: [0, 0],
        },
      ];
      await forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom", "Dad"], assetsDistribution, 1);

      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user2.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(erc20Contract1.target, user3.address)).to.equal(70);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user2.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(erc20Contract2.target, user3.address)).to.equal(60);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user2.address)).to.equal(0);
      expect(await forwardingWill.assetsDistribution(ETH_ADDRESS, user3.address)).to.equal(50);
      expect(await forwardingWill.getBeneficiaries()).to.deep.equal([user3.address]);
      expect(await forwardingWill.minRequiredSignatures()).to.equal(1);
    });

    it("Should revert if not have any beneficiary", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [0, 0, 0],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [0, 0, 0],
        },
      ];
      await expect(
        forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom"], assetsDistribution, 1)
      ).to.be.revertedWithCustomError(forwardingWill, "NotHaveAnyBeneficiaries");
    });

    it("Should revert if beneficiary is creator", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: user1.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
      ];
      await expect(
        forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom"], assetsDistribution, 1)
      ).to.be.revertedWithCustomError(forwardingWill, "BeneficiaryInvalid");
    });

    it("Should revert if beneficiary is address 0", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: ethers.ZeroAddress,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
      ];
      await expect(
        forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom"], assetsDistribution, 1)
      ).to.be.revertedWithCustomError(forwardingWill, "BeneficiaryInvalid");
    });

    it("Should revert if asset percentages > 100", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: user2.address,
          assets: [erc20Contract2.target],
          percents: [90],
        },
      ];
      await expect(
        forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom", "Dad"], assetsDistribution, 1)
      ).to.be.revertedWithCustomError(forwardingWill, "InvalidPercent");
    });

    it("Should revert if min required signatures > number of beneficiaries", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
      ];
      await expect(
        forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom", "Dad"], assetsDistribution, 3)
      ).to.be.revertedWithCustomError(forwardingWill, "MinRequiredSignaturesInvalid");
    });

    it("Should revert if beneficiary limit is reached", async function () {
      const { deployer, user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );

      const { willId } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      await forwardingWillRouter.connect(deployer).setBeneficiaryLimit(1);

      const assetsDistribution: ForwardingWillStruct.AssetDistributionStruct[] = [
        {
          user: user2.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
        {
          user: user3.address,
          assets: [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS],
          percents: [20, 20, 20],
        },
      ];
      await expect(
        forwardingWillRouter.connect(user1).updateWillAssetsDistribution(willId, ["Dad", "Mom"], assetsDistribution, 1)
      ).to.be.revertedWithCustomError(forwardingWillRouter, "BeneficiaryLimitExceeded");
    });
  });

  /* Active will */
  describe("Active will", function () {
    async function signByBeneficiary(beneficiary: any, willId: bigint, owner: any) {
      const message = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "uint256", "address", "address"],
        [31337, 2, willId, owner.address, beneficiary.address]
      );
      return beneficiary.signMessage(ethers.toBeArray(message));
    }
    it("Should active will", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress, mainConfig } = await createWill(
        user1,
        user2,
        user3,
        forwardingWillRouter,
        erc20Contract1,
        erc20Contract2,
        ETH_ADDRESS,
        etherAmount
      );

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1), await signByBeneficiary(user3, willId, user1)];
      const erc20Addresses = [erc20Contract1.target, erc20Contract2.target, ETH_ADDRESS];

      // Mint erc20 token
      const [mintAmount1, mintAmount2] = [ethers.parseEther("100"), ethers.parseEther("100")];
      await erc20Contract1.connect(user1).mint(user1.address, mintAmount1);
      await erc20Contract2.connect(user1).mint(user1.address, mintAmount2);
      // Approve erc20 token
      const [approveAmount1, approveAmount2] = [ethers.parseEther("50"), ethers.parseEther("150")];
      await erc20Contract1.connect(user1).approve(willAddress, approveAmount1);
      await erc20Contract2.connect(user1).approve(willAddress, approveAmount2);
      const transferAmount1 = mintAmount1 > approveAmount1 ? approveAmount1 : mintAmount1;
      const transferAmount2 = mintAmount2 > approveAmount2 ? approveAmount2 : mintAmount2;
      // Received amount
      const [distribution1, distribution2] = mainConfig.distributions;
      const amount1User2 = (BigInt(distribution1.percents[0]) * transferAmount1) / BigInt(100);
      const amount2User2 = (BigInt(distribution1.percents[1]) * transferAmount2) / BigInt(100);
      const amount3User2 = (BigInt(distribution1.percents[2]) * etherAmount) / BigInt(100);
      const amount1User3 = (BigInt(distribution2.percents[0]) * transferAmount1) / BigInt(100);
      const amount2User3 = (BigInt(distribution2.percents[1]) * transferAmount2) / BigInt(100);

      const timestamp = await getTimestampOfNextBlock();

      await expect(forwardingWillRouter.connect(user2).activeWill(willId, signatures[0]))
        .to.emit(forwardingWillRouter, "ForwardingWillActivated")
        .withArgs(willId, etherAmount, erc20Addresses, [transferAmount1, transferAmount2, 0], timestamp);

      expect(await erc20Contract1.balanceOf(user1.address)).to.equal(mintAmount1 - transferAmount1);
      expect(await erc20Contract2.balanceOf(user1.address)).to.equal(mintAmount2 - transferAmount2);
      expect(await ethers.provider.getBalance(willAddress)).to.equal(etherAmount - amount3User2);

      expect(await erc20Contract1.balanceOf(user2.address)).to.equal(amount1User2);
      expect(await erc20Contract2.balanceOf(user2.address)).to.equal(amount2User2);
      expect(await ethers.provider.getBalance(user2.address)).to.changeEtherBalance(user2.address, amount3User2);

      expect(await erc20Contract1.balanceOf(user3.address)).to.equal(amount1User3);
      expect(await erc20Contract2.balanceOf(user3.address)).to.equal(amount2User3);
    });

    it("Should revert if sender is not beneficiary", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1)];
      const erc20Addresses = [erc20Contract1.target, erc20Contract2.target];

      await expect(
        forwardingWillRouter.connect(user1).activeWill(willId, signatures[0])
      ).to.be.revertedWithCustomError(forwardingWill, "NotBeneficiary");
    });

    it("Should revert if beneficiary signature invalid", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1)];
      const erc20Addresses = [erc20Contract1.target, erc20Contract2.target];

      await expect(
        forwardingWillRouter.connect(user3).activeWill(willId, signatures[0])
      ).to.be.revertedWithCustomError(forwardingWill, "SignatureInvalid");
    });

    it("Should revert if will is not active", async function () {
      const { user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS } = await loadFixture(
        deployRouterFixture
      );

      const { willId, willAddress } = await createWill(user1, user2, user3, forwardingWillRouter, erc20Contract1, erc20Contract2, ETH_ADDRESS);
      const forwardingWill = await getWillContract(willAddress);

      await forwardingWillRouter.connect(user1).deleteWill(willId);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1)];
      const erc20Addresses = [erc20Contract1.target, erc20Contract2.target];

      await expect(
        forwardingWillRouter.connect(user3).activeWill(willId, signatures[0])
      ).to.be.revertedWithCustomError(forwardingWill, "WillNotActive");
    });
  });
});
