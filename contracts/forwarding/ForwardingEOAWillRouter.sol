//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WillRouter} from "../common/WillRouter.sol";
import {EOAWillFactory} from "../common/EOAWillFactory.sol";
import {ForwardingEOAWill} from "./ForwardingEOAWill.sol";
import {IForwardingEOAWill} from "../interfaces/IForwardingEOAWill.sol";
import {ForwardingWillStruct} from "../libraries/ForwardingWillStruct.sol";

contract ForwardingEOAWillRouter is WillRouter, EOAWillFactory, ReentrancyGuard {
  /* Error */
  error NumBeneficiariesInvalid();
  error NumAssetsInvalid();
  error DistributionsInvalid();
  error ActivationTriggerInvalid();
  error SenderIsCreatedWill(address);

  /* Struct */
  struct WillMainConfig {
    string name;
    string note;
    string[] nickNames;
    ForwardingWillStruct.Distribution[] distributions;
  }

  /* Event */
  event ForwardingEOAWillCreated(
    uint256 willId,
    address willAddress,
    address creatorAddress,
    WillMainConfig mainConfig,
    ForwardingWillStruct.WillExtraConfig extraConfig,
    uint256 timestamp
  );
  event ForwardingEOAWillConfigUpdated(
    uint256 willId,
    WillMainConfig mainConfig,
    ForwardingWillStruct.WillExtraConfig extraConfig,
    uint256 timestamp
  );
  event ForwardingEOAWillDistributionUpdated(
    uint256 willId,
    string[] nickNames,
    ForwardingWillStruct.Distribution[] distributions,
    uint256 timestamp
  );
  event ForwardingEOAWillTriggerUpdated(uint256 willId, uint128 lackOfOutgoingTxRange, uint256 timestamp);
  event ForwardingEOAWillNameNoteUpdated(uint256 willId, string name, string note, uint256 timestamp);
  event ForwardingEOAWillActivated(uint256 willId, uint256 timestamp);
  event ForwardingEOAWillActivedAlive(uint256 willId, uint256 timestamp);
  event ForwardingEOAWillDeleted(uint256 willId, uint256 timestamp);
  /* External function */
  /**
   * @dev Check activation conditions. This activation conditions is current time >= last transaction of owner + lackOfOutgoingTxRange.
   * @param willId_ will id
   * @return bool true if eligible for activation, false otherwise
   */
  function checkActiveWill(uint256 willId_) external view returns (bool) {
    address willAddress = _checkWillExisted(willId_);
    return IForwardingEOAWill(willAddress).checkActiveWill();
  }

  /**
   * @dev create new will and guard
   * @param mainConfig_  include name, note, nickname [], distributions[]
   * @param extraConfig_  include lackOfOutgoingTxRange
   * @return address will address
   */
  function createWill(
    WillMainConfig calldata mainConfig_,
    ForwardingWillStruct.WillExtraConfig calldata extraConfig_
  ) external nonReentrant returns (address) {
    //Check beneficiaries length
    if (mainConfig_.distributions.length != mainConfig_.nickNames.length || mainConfig_.distributions.length == 0) revert DistributionsInvalid();

    //Check activation trigger
    if (extraConfig_.lackOfOutgoingTxRange == 0) revert ActivationTriggerInvalid();

    if (_isCreateWill(msg.sender)) revert SenderIsCreatedWill(msg.sender);

    // Create new will and guard
    (uint256 newWillId, address willAddress) = _createWill(type(ForwardingEOAWill).creationCode, msg.sender);

    // Initialize will
    uint256 numberOfBeneficiaries = IForwardingEOAWill(willAddress).initialize(newWillId, msg.sender, mainConfig_.distributions, extraConfig_);

    // Check beneficiaries limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    emit ForwardingEOAWillCreated(newWillId, willAddress, msg.sender, mainConfig_, extraConfig_, block.timestamp);

    return willAddress;
  }

  /**
   * @dev owner active alive
   * @param willId_  will id
   */
  function avtiveAlive(uint256 willId_) external {
    address willAddress = _checkWillExisted(willId_);
    IForwardingEOAWill(willAddress).activeAlive(msg.sender);
    emit ForwardingEOAWillActivedAlive(willId_, block.timestamp);
  }

  /**
   * @dev set will config include distributions, lackOfOutGoingTxRange
   * @param willId_  will id
   * @param mainConfig_ include name, note, nickname [], distributions[]
   * @param extraConfig_ include lackOfOutgoingTxRange
   */
  function setWillConfig(
    uint256 willId_,
    WillMainConfig calldata mainConfig_,
    ForwardingWillStruct.WillExtraConfig calldata extraConfig_
  ) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);

    //Check distribution length
    if (mainConfig_.distributions.length != mainConfig_.nickNames.length || mainConfig_.distributions.length == 0) revert DistributionsInvalid();

    //Check invalid activation trigger
    if (extraConfig_.lackOfOutgoingTxRange == 0) revert ActivationTriggerInvalid();

    //Set distributions
    uint256 numberBeneficiaries = IForwardingEOAWill(willAddress).setWillDistributions(msg.sender, mainConfig_.distributions);

    //Check num beneficiaries and assets
    if (!_checkNumBeneficiariesLimit(numberBeneficiaries)) revert NumBeneficiariesInvalid();

    //Set lackOfOutgoingTxRange
    IForwardingEOAWill(willAddress).setActivationTrigger(msg.sender, extraConfig_.lackOfOutgoingTxRange);

    emit ForwardingEOAWillConfigUpdated(willId_, mainConfig_, extraConfig_, block.timestamp);
  }

  /**
   * @dev Set distributions[] will, call this function if only modify beneficiaries[], minRequiredSignatures to save gas for user.
   * @param willId_ will id
   * @param nickNames_  nick name[]
   * @param distributions_ distributions[]
   */
  function setWillDistributions(uint256 willId_, string[] calldata nickNames_, ForwardingWillStruct.Distribution[] calldata distributions_) external {
    address willAddress = _checkWillExisted(willId_);
    // Check distribution length
    if (distributions_.length != nickNames_.length || distributions_.length == 0) revert DistributionsInvalid();

    // Set distribution assets
    uint256 numberOfBeneficiaries = IForwardingEOAWill(willAddress).setWillDistributions(msg.sender, distributions_);

    //Check beneficiary limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    emit ForwardingEOAWillDistributionUpdated(willId_, nickNames_, distributions_, block.timestamp);
  }

  /**
   * @dev set activation trigger time, call this function if only modify lackOfOutgoingTxRange to save gas for user.
   * @param willId_ will id
   * @param lackOfOutgoingTxRange_ lackOfOutgoingTxRange
   */
  function setActivationTrigger(uint256 willId_, uint128 lackOfOutgoingTxRange_) external {
    address willAddress = _checkWillExisted(willId_);

    //Check invalid activation trigger
    if (lackOfOutgoingTxRange_ == 0) revert ActivationTriggerInvalid();

    //Set lackOfOutgoingTxRange_
    IForwardingEOAWill(willAddress).setActivationTrigger(msg.sender, lackOfOutgoingTxRange_);

    emit ForwardingEOAWillTriggerUpdated(willId_, lackOfOutgoingTxRange_, block.timestamp);
  }

  /**
   * @dev Set name and note will, call this function if only modify name and note to save gas for user.
   * @param willId_ will id
   * @param name_ name will
   * @param note_ note will
   */
  function setNameNote(uint256 willId_, string calldata name_, string calldata note_) external {
    address willAddress = _checkWillExisted(willId_);
    IForwardingEOAWill(willAddress).activeAlive(msg.sender);
    emit ForwardingEOAWillNameNoteUpdated(willId_, name_, note_, block.timestamp);
  }

  /**
   * @dev Active will
   * @param willId_ will id
   */
  function activeWill(uint256 willId_, address[] calldata assets_, bool isETH_) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    if (isETH_ == false && assets_.length == 0) revert NumAssetsInvalid();

    //Active will
    IForwardingEOAWill(willAddress).activeWill(assets_, isETH_);
    emit ForwardingEOAWillActivated(willId_, block.timestamp);
  }

  /**
   * @dev delete will
   * @param willId_  will id
   */
  function deleteWill(uint256 willId_) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    isCreateWill[msg.sender] = false;

    IForwardingEOAWill(willAddress).deleteWill(msg.sender);

    emit ForwardingEOAWillDeleted(willId_, block.timestamp);
  }

  /**
   * @dev withdraw ETH amount
   * @param willId_  will id
   * @param amount_  ETH amount
   */
  function withdraw(uint256 willId_, uint256 amount_) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    IForwardingEOAWill(willAddress).withdraw(msg.sender, amount_);
  }
}
