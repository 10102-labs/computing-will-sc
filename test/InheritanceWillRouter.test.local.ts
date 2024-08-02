import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { InheritanceWill, InheritanceWillRouter } from "../typechain-types";
import { InheritanceWillStruct } from "../typechain-types/contracts/InheritanceWill";

describe("InheritanceWillRouter", function () {
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
    // Deploy InheritanceWillRouter
    const inheritanceWillRouter = await ethers.deployContract("InheritanceWillRouter", [0, feeReceiver.address, 0, erc20Whitelist.target], deployer);
    await inheritanceWillRouter.waitForDeployment();
    await inheritanceWillRouter.connect(deployer).addOperator(operator.address);

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
      inheritanceWillRouter,
    };
  }

  /* Deployment */
  describe("Deployment", function () {
    it("Should set the right admin", async function () {
      const { deployer, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const ADMIN_ROLE = await inheritanceWillRouter.DEFAULT_ADMIN_ROLE();
      expect(await inheritanceWillRouter.hasRole(ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("Should set the right configures", async function () {
      const { feeReceiver, erc20Whitelist, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      expect(await inheritanceWillRouter.willFee()).to.equal(0);
      expect(await inheritanceWillRouter.feeReceiver()).to.equal(feeReceiver.address);
      expect(await inheritanceWillRouter.willLimit()).to.equal(0);
      expect(await inheritanceWillRouter.erc20Whitelist()).to.equal(erc20Whitelist.target);
    });
  });

  async function getWillContract(willAddress: string) {
    const willFactory = await ethers.getContractFactory("InheritanceWill");
    const inheritanceWill: InheritanceWill = willFactory.attach(willAddress) as any;
    return inheritanceWill;
  }

  const extraConfig: InheritanceWillStruct.WillExtraConfigStruct = {
    minRequiredSignatures: 2,
    lackOfOutgoingTxRange: 2,
  };

  async function createWill(
    user1: any,
    user2: any,
    user3: any,
    inheritanceWillRouter: InheritanceWillRouter,
    value: bigint = BigInt(0),
    assets: string[] = []
  ) {
    const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
      name: "My will",
      note: "For my family",
      nickNames: ["Dad", "Mom"],
      beneficiaries: [user2.address, user3.address],
      assets,
    };
    const mainConfigTuple = [mainConfig.name, mainConfig.note, mainConfig.nickNames, mainConfig.beneficiaries, mainConfig.assets];
    const extraConfigTuple = [extraConfig.minRequiredSignatures, extraConfig.lackOfOutgoingTxRange];

    const willAddress = await inheritanceWillRouter.getNextWillAddressOfUser(user1.address);
    await inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig, { value });
    const willId = await inheritanceWillRouter.willId();

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
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const newWillId = (await inheritanceWillRouter.willId()) + BigInt(1);
      const willAddress = await inheritanceWillRouter.getNextWillAddressOfUser(user1.address);
      const willCountByUser = (await inheritanceWillRouter.willCountByUsers(user1.address)) + BigInt(1);
      const nonceByUser = (await inheritanceWillRouter.nonceByUsers(user1.address)) + BigInt(1);

      await createWill(user1, user2, user3, inheritanceWillRouter);

      expect(await inheritanceWillRouter.willId()).to.equal(newWillId);
      expect(await inheritanceWillRouter.willAddresses(newWillId)).to.equal(willAddress);
      expect(await inheritanceWillRouter.willCountByUsers(user1.address)).to.equal(willCountByUser);
      expect(await inheritanceWillRouter.nonceByUsers(user1.address)).to.equal(nonceByUser);
    });

    it("Should change inheritance will state", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      expect(await will.getWillInfo()).to.deep.equal([willId, user1.address, 1]);
      expect(await will.getActivationTrigger()).to.equal(extraConfig.lackOfOutgoingTxRange);
      expect(await will.minRequiredSignatures()).to.equal(extraConfig.minRequiredSignatures);
      expect(await will.getBeneficiaries()).to.deep.equal([user2.address, user3.address]);
    });

    it("Should emit InheritanceWillCreated event ", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { mainConfig, extraConfig, mainConfigTuple, extraConfigTuple } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const timestamp = await getTimestampOfNextBlock();
      const willId = (await inheritanceWillRouter.willId()) + BigInt(1);
      const willAddress = await inheritanceWillRouter.getNextWillAddressOfUser(user1.address);

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig))
        .to.emit(inheritanceWillRouter, "InheritanceWillCreated")
        .withArgs(willId, willAddress, user1.address, mainConfigTuple, extraConfigTuple, timestamp);
    });

    // Unhappy cases
    it("Should revert if nickname length is not equal to beneficiaries length", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad"],
        beneficiaries: [user2.address, user3.address],
        assets: [],
      };

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        inheritanceWillRouter,
        "TwoArraysLengthMismatch"
      );
    });

    it("Should revert if min required signatures > number of beneficiaries", async function () {
      const { user1, user2, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom", "Mom"],
        beneficiaries: [user2.address, user2.address, user2.address],
        assets: [],
      };
      const will = await getWillContract(user1.address);

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        will,
        "MinRequiredSignaturesInvalid"
      );
    });

    it("Should revert if beneficiary is address 0", async function () {
      const { user1, user2, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        beneficiaries: [user2.address, ethers.ZeroAddress],
        assets: [],
      };
      const will = await getWillContract(user1.address);

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        will,
        "BeneficiaryInvalid"
      );
    });

    it("Should revert if beneficiary is owner", async function () {
      const { user1, user2, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        beneficiaries: [user2.address, user1.address],
        assets: [],
      };
      const will = await getWillContract(user1.address);

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        will,
        "BeneficiaryInvalid"
      );
    });

    it("Should revert if not enough ether to pay fee", async function () {
      const { deployer, user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);
      const etherAmount = ethers.parseEther("1");
      await inheritanceWillRouter.connect(deployer).setFee(etherAmount);

      const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        beneficiaries: [user2.address, user3.address],
        assets: [],
      };

      await expect(
        inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig, { value: ethers.parseEther("0.9") })
      ).to.be.revertedWithCustomError(inheritanceWillRouter, "NotEnoughEther");
    });

    it("Should revert if beneficiary limit is reached", async function () {
      const { deployer, user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);
      await inheritanceWillRouter.connect(deployer).setBeneficiaryLimit(1);

      const mainConfig: InheritanceWillRouter.WillMainConfigStruct = {
        name: "My will",
        note: "For my family",
        nickNames: ["Dad", "Mom"],
        beneficiaries: [user2.address, user3.address],
        assets: [],
      };

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        inheritanceWillRouter,
        "BeneficiaryLimitExceeded"
      );
    });

    it("Should revert if will limit is reached", async function () {
      const { deployer, user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);
      await inheritanceWillRouter.connect(deployer).setWillLimit(2);

      const { mainConfig } = await createWill(user1, user2, user3, inheritanceWillRouter);
      await createWill(user1, user2, user3, inheritanceWillRouter);

      await expect(inheritanceWillRouter.connect(user1).createWill(mainConfig, extraConfig)).to.be.revertedWithCustomError(
        inheritanceWillRouter,
        "WillLimitExceeded"
      );
    });

    it("Should revert if will is initialized", async function () {
      const { user1, user2, user3, inheritanceWillRouter, erc20Whitelist } = await loadFixture(deployRouterFixture);

      const { willId, willAddress, mainConfig, extraConfig } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await expect(
        will.connect(user1).initialize(willId, user1.address, erc20Whitelist.target, mainConfig.beneficiaries, mainConfig.assets, extraConfig)
      ).to.be.revertedWithCustomError(will, "WillAlreadyInitialized");
    });
  });

  /* Delete will */
  describe("Delete will", function () {
    // Happy cases
    it("Should change router state", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId } = await createWill(user1, user2, user3, inheritanceWillRouter);
      expect(await inheritanceWillRouter.willCountByUsers(user1.address)).to.equal(1);
      expect(await inheritanceWillRouter.nonceByUsers(user1.address)).to.equal(1);

      await inheritanceWillRouter.connect(user1).deleteWill(willId);
      expect(await inheritanceWillRouter.willCountByUsers(user1.address)).to.equal(0);
      expect(await inheritanceWillRouter.nonceByUsers(user1.address)).to.equal(1);
    });

    it("Should change inheritance will state", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter, etherAmount);
      expect(await ethers.provider.getBalance(willAddress)).to.equal(etherAmount);

      await expect(inheritanceWillRouter.connect(user1).deleteWill(willId)).to.changeEtherBalance(user1, etherAmount);
      expect(await ethers.provider.getBalance(willAddress)).to.equal(0);

      const will = await getWillContract(willAddress);
      expect(await will.getWillInfo()).to.deep.equal([willId, user1.address, 0]);
      expect(await will.getBeneficiaries()).to.deep.equal([]);
    });

    it("Should emit InheritanceWillDeleted event", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const timestamp = await getTimestampOfNextBlock();

      await expect(inheritanceWillRouter.connect(user1).deleteWill(willId))
        .to.emit(inheritanceWillRouter, "InheritanceWillDeleted")
        .withArgs(willId, user1.address, timestamp);
    });

    // Unhappy cases
    it("Should revert if will does not exist", async function () {
      const { user1, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      await expect(inheritanceWillRouter.connect(user1).deleteWill(1)).to.be.revertedWithCustomError(inheritanceWillRouter, "WillNotFound");
    });

    it("Should revert if sender is not owner", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      await createWill(user2, user1, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await expect(inheritanceWillRouter.connect(user2).deleteWill(willId)).to.be.revertedWithCustomError(will, "OnlyOwner");
    });

    it("Should revert if will is not activated", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await inheritanceWillRouter.connect(user1).deleteWill(willId);
      await expect(inheritanceWillRouter.connect(user1).deleteWill(willId)).to.be.revertedWithCustomError(will, "WillNotActive");
    });

    it("Should revert if sender is not router", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await expect(will.connect(user1).deleteWill(user1.address)).to.be.revertedWithCustomError(will, "OnlyRouter");
    });
  });

  /* Withdraw ETH from the will */
  describe("Withdraw ETH", function () {
    it("Should withdraw ETH to the owner", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter, etherAmount);

      const withdrawAmount = ethers.parseEther("0.5");
      await expect(inheritanceWillRouter.connect(user1).withdrawEthFromWill(willId, withdrawAmount)).to.changeEtherBalances(
        [user1, willAddress],
        [withdrawAmount, withdrawAmount - etherAmount]
      );
    });

    it("Should revert if will not enough balance", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter, etherAmount);
      const will = await getWillContract(willAddress);

      await expect(inheritanceWillRouter.connect(user1).withdrawEthFromWill(willId, etherAmount + BigInt(1))).to.be.revertedWithCustomError(
        will,
        "NotEnoughEther"
      );
    });

    it("Should revert if sender is not owner", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter, etherAmount);
      const will = await getWillContract(willAddress);

      await expect(inheritanceWillRouter.connect(user2).withdrawEthFromWill(willId, etherAmount)).to.be.revertedWithCustomError(will, "OnlyOwner");
    });
  });

  /* Update beneficiaries */
  describe("Update beneficiaries", function () {
    it("Should update beneficiaries", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);
      const timestamp = await getTimestampOfNextBlock();

      await expect(inheritanceWillRouter.connect(user1).setWillBeneficiaries(willId, ["Dad"], [user2.address], 1))
        .to.emit(inheritanceWillRouter, "InheritanceWillBeneficiaryUpdated")
        .withArgs(willId, ["Dad"], [user2.address], 1, timestamp);
      expect(await will.getBeneficiaries()).to.deep.equal([user2.address]);
    });
    it("Should revert if beneficiary is address 0", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await expect(
        inheritanceWillRouter.connect(user1).setWillBeneficiaries(willId, ["Dad", "Mom"], [user2.address, ethers.ZeroAddress], 1)
      ).to.be.revertedWithCustomError(will, "BeneficiaryInvalid");
    });
    it("Should revert if beneficiary is owner", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await expect(
        inheritanceWillRouter.connect(user1).setWillBeneficiaries(willId, ["Dad", "Mom"], [user2.address, user1.address], 1)
      ).to.be.revertedWithCustomError(will, "BeneficiaryInvalid");
    });
    it("Should revert if min required signatures > number of beneficiaries", async function () {
      const { user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await expect(
        inheritanceWillRouter.connect(user1).setWillBeneficiaries(willId, ["Dad", "Mom"], [user2.address, user2.address], 2)
      ).to.be.revertedWithCustomError(will, "MinRequiredSignaturesInvalid");
    });
    it("Should revert if beneficiary limit is reached", async function () {
      const { deployer, user1, user2, user3, inheritanceWillRouter } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);
      await inheritanceWillRouter.connect(deployer).setBeneficiaryLimit(1);

      await expect(
        inheritanceWillRouter.connect(user1).setWillBeneficiaries(willId, ["Dad", "Mom"], [user2.address, user3.address], 1)
      ).to.be.revertedWithCustomError(inheritanceWillRouter, "BeneficiaryLimitExceeded");
    });
  });

  /* Active will */
  async function signByBeneficiary(beneficiary: any, willId: bigint, owner: any) {
    const message = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "uint256", "address", "address"],
      [31337, 1, willId, owner.address, beneficiary.address]
    );
    return beneficiary.signMessage(ethers.toBeArray(message));
  }

  describe("Active will", function () {
    it("Should active will", async function () {
      const { user1, user2, user3, inheritanceWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const erc20Addresses: string[] = [erc20Contract1.target.toString(), erc20Contract2.target.toString()];
      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter, etherAmount, erc20Addresses);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1), await signByBeneficiary(user3, willId, user1)];

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

      await (await inheritanceWillRouter.connect(user2).activeWill(willId, signatures[0])).wait();

      const timestamp = await getTimestampOfNextBlock();

      await expect(inheritanceWillRouter.connect(user3).activeWill(willId, signatures[1]))
        .to.emit(inheritanceWillRouter, "InheritanceWillActivated")
        .withArgs(willId, etherAmount, erc20Addresses, [transferAmount1, transferAmount2], timestamp);

      expect(await erc20Contract1.balanceOf(user1.address)).to.equal(mintAmount1 - transferAmount1);
      expect(await erc20Contract2.balanceOf(user1.address)).to.equal(mintAmount2 - transferAmount2);
      expect(await ethers.provider.getBalance(willAddress)).to.equal(0);

      expect(await erc20Contract1.balanceOf(user2.address)).to.equal(transferAmount1 / BigInt(2));
      expect(await erc20Contract2.balanceOf(user2.address)).to.equal(transferAmount2 / BigInt(2));
      expect(await erc20Contract1.balanceOf(user3.address)).to.equal(transferAmount1 / BigInt(2));
      expect(await erc20Contract2.balanceOf(user3.address)).to.equal(transferAmount2 / BigInt(2));
      expect(await ethers.provider.getBalance(user2.address)).to.changeEtherBalance(
        [user2.address, user3.address],
        [etherAmount / BigInt(2), etherAmount / BigInt(2)]
      );
    });

    it("Not enough signature", async function () {
      const { user1, user2, user3, inheritanceWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);

      const etherAmount = ethers.parseEther("1");
      const erc20Addresses: string[] = [erc20Contract1.target.toString(), erc20Contract2.target.toString()];
      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter, etherAmount, erc20Addresses);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1), await signByBeneficiary(user3, willId, user1)];

      // Mint erc20 token
      const [mintAmount1, mintAmount2] = [ethers.parseEther("100"), ethers.parseEther("100")];
      await erc20Contract1.connect(user1).mint(user1.address, mintAmount1);
      await erc20Contract2.connect(user1).mint(user1.address, mintAmount2);
      // Approve erc20 token
      const [approveAmount1, approveAmount2] = [ethers.parseEther("50"), ethers.parseEther("150")];
      await erc20Contract1.connect(user1).approve(willAddress, approveAmount1);
      await erc20Contract2.connect(user1).approve(willAddress, approveAmount2);

      const timestamp = await getTimestampOfNextBlock();

      await expect(inheritanceWillRouter.connect(user3).activeWill(willId, signatures[1]))
        .to.emit(inheritanceWillRouter, "InheritanceWillActivated")
        .withArgs(willId, 0, erc20Addresses, [0, 0], timestamp);
    });

    it("Should revert if sender is not beneficiary", async function () {
      const { user1, user2, user3, inheritanceWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1), await signByBeneficiary(user3, willId, user1)];

      await expect(inheritanceWillRouter.connect(user1).activeWill(willId, signatures[0])).to.be.revertedWithCustomError(will, "NotBeneficiary");
    });

    it("Should revert if beneficiary signature invalid", async function () {
      const { user1, user2, user3, inheritanceWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1), await signByBeneficiary(user3, willId, user1)];

      await expect(inheritanceWillRouter.connect(user3).activeWill(willId, signatures[0])).to.be.revertedWithCustomError(will, "SignatureInvalid");
    });

    it("Should revert if will is not active", async function () {
      const { user1, user2, user3, inheritanceWillRouter, erc20Contract1, erc20Contract2 } = await loadFixture(deployRouterFixture);

      const { willId, willAddress } = await createWill(user1, user2, user3, inheritanceWillRouter);
      const will = await getWillContract(willAddress);

      await inheritanceWillRouter.connect(user1).deleteWill(willId);

      // Signatures
      const signatures = [await signByBeneficiary(user2, willId, user1), await signByBeneficiary(user3, willId, user1)];

      await expect(inheritanceWillRouter.connect(user3).activeWill(willId, signatures[0])).to.be.revertedWithCustomError(will, "WillNotActive");
    });
  });
});
