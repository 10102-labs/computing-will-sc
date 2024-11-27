//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WillRouter} from "../common/WillRouter.sol";
import {WillFactory} from "../common/WillFactory.sol";
import {InheritanceWill} from "./InheritanceWill.sol";
import {SafeGuard} from "../SafeGuard.sol";
import {IInheritanceWill} from "../interfaces/IInheritanceWill.sol";
import {ISafeGuard} from "../interfaces/ISafeGuard.sol";
import {ISafeWallet} from "../interfaces/ISafeWallet.sol";
import {InheritanceWillStruct} from "../libraries/InheritanceWillStruct.sol";

contract InheritanceWillRouter is WillRouter, WillFactory, ReentrancyGuard {
  /* Error */
  error ExistedGuardInSafeWallet(address);
  error SignerIsNotOwnerOfSafeWallet();
  error NumBeneficiariesInvalid();
  error BeneficiariesInvalid();
  error MinRequiredSignaturesInvalid();
  error ActivationTriggerInvalid();
  error GuardSafeWalletInvalid();
  error ModuleSafeWalletInvalid();

  /* Struct */
  struct WillMainConfig {
    string name;
    string note;
    string[] nickNames;
    address[] beneficiaries;
  }

  /* Event */
  event InheritanceWillCreated(
    uint256 willId,
    address willAddress,
    address guardAddress,
    address creatorAddress,
    address safeAddress,
    WillMainConfig mainConfig,
    InheritanceWillStruct.WillExtraConfig extraConfig,
    uint256 timestamp
  );

  event InheritanceWillConfigUpdated(uint256 willId, WillMainConfig mainConfig, InheritanceWillStruct.WillExtraConfig extraConfig, uint256 timestamp);
  event InheritanceWillBeneficiariesUpdated(
    uint256 willId,
    string[] nickName,
    address[] beneficiaries,
    uint128 minRequiredSignatures,
    uint256 timestamp
  );
  event InheritanceWillActivationTriggerUpdated(uint256 willId, uint128 lackOfOutgoingTxRange, uint256 timestamp);
  event InheritanceWillNameNoteUpdated(uint256 willId, string name, string note, uint256 timestamp);
  event InheritanceWillActivated(uint256 willId, address[] newSigners, uint256 newThreshold, bool success, uint256 timestamp);

  /* Modifier */
  modifier onlySafeWallet(uint256 willId_) {
    _checkSafeWalletValid(willId_, msg.sender);
    _;
  }

  /* External function */
  /**
   * @dev Check activation conditions. This activation conditions is current time >= last transaction of safe wallet + lackOfOutgoingTxRange.
   * @param willId_ will id
   * @return bool true if eligible for activation, false otherwise
   */
  function checkActiveWill(uint256 willId_) external view returns (bool) {
    address willAddress = _checkWillExisted(willId_);
    address guardAddress = _checkGuardExisted(willId_);

    return IInheritanceWill(willAddress).checkActiveWill(guardAddress);
  }

  /* External function */
  /**
   * @dev Create new will and guard.
   * @param safeWallet safeWallet address
   * @param mainConfig_  include name, note, nickname[], beneficiaries[]
   * @param extraConfig_ include minRequireSignature, lackOfOutgoingTxRange
   * @return address will address
   * @return address guard address
   */
  function createWill(
    address safeWallet,
    WillMainConfig calldata mainConfig_,
    InheritanceWillStruct.WillExtraConfig calldata extraConfig_
  ) external nonReentrant returns (address, address) {
    //Check beneficiaries length
    if (mainConfig_.beneficiaries.length != mainConfig_.nickNames.length || mainConfig_.beneficiaries.length == 0) revert BeneficiariesInvalid();

    // Check invalid guard
    if (_checkExistGuardInSafeWallet(safeWallet)) {
      revert ExistedGuardInSafeWallet(safeWallet);
    }

    //Check invalid safe wallet
    if (!_checkSignerIsOwnerOfSafeWallet(safeWallet, msg.sender)) revert SignerIsNotOwnerOfSafeWallet();

    //Check activation trigger
    if (extraConfig_.lackOfOutgoingTxRange == 0) revert ActivationTriggerInvalid();

    // Create new will and guard
    (uint256 newWillId, address willAddress, address guardAddress) = _createWill(
      type(InheritanceWill).creationCode,
      type(SafeGuard).creationCode,
      msg.sender
    );

    // Initialize will
    uint256 numberOfBeneficiaries = IInheritanceWill(willAddress).initialize(newWillId, safeWallet, mainConfig_.beneficiaries, extraConfig_);

    //Initialize safeguard
    ISafeGuard(guardAddress).initialize(safeWallet);

    //Check min require signatures
    if (extraConfig_.minRequiredSignatures == 0 || extraConfig_.minRequiredSignatures > numberOfBeneficiaries) revert MinRequiredSignaturesInvalid();

    // Check beneficiary limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    emit InheritanceWillCreated(newWillId, willAddress, guardAddress, msg.sender, safeWallet, mainConfig_, extraConfig_, block.timestamp);

    return (willAddress, guardAddress);
  }

  /**
   * @dev Set will config include beneficiaries, minRequireSignatures, lackOfOutgoingTxRange.
   * @param willId_ will Id
   * @param mainConfig_ include name, note, nickname[], beneficiaries[]
   * @param extraConfig_ include minRequireSignature, lackOfOutgoingTxRange
   */
  function setWillConfig(
    uint256 willId_,
    WillMainConfig calldata mainConfig_,
    InheritanceWillStruct.WillExtraConfig calldata extraConfig_
  ) external onlySafeWallet(willId_) nonReentrant {
    address willAddress = _checkWillExisted(willId_);

    //Check beneficiaries length
    if (mainConfig_.beneficiaries.length != mainConfig_.nickNames.length || mainConfig_.beneficiaries.length == 0) revert BeneficiariesInvalid();

    //Check activation trigger
    if (extraConfig_.lackOfOutgoingTxRange == 0) revert ActivationTriggerInvalid();

    //Set beneficiaries
    uint256 numberOfBeneficiaries = IInheritanceWill(willAddress).setWillBeneficiaries(
      msg.sender,
      mainConfig_.beneficiaries,
      extraConfig_.minRequiredSignatures
    );

    //Check min require signatures
    if (extraConfig_.minRequiredSignatures == 0 || extraConfig_.minRequiredSignatures > numberOfBeneficiaries) revert MinRequiredSignaturesInvalid();

    //Check beneficiary limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    //Set lackOfOutgoingTxRange
    IInheritanceWill(willAddress).setActivationTrigger(msg.sender, extraConfig_.lackOfOutgoingTxRange);

    emit InheritanceWillConfigUpdated(willId_, mainConfig_, extraConfig_, block.timestamp);
  }

  /**
   * @dev Set beneficiaries[], minRequiredSignatures_ will, call this function if only modify beneficiaries[], minRequiredSignatures to save gas for user.
   * @param willId_ will id
   * @param nickName_ nick name[]
   * @param beneficiaries_ beneficiaries []
   * @param minRequiredSignatures_ minRequiredSignatures
   */

  function setWillBeneficiaries(
    uint256 willId_,
    string[] calldata nickName_,
    address[] calldata beneficiaries_,
    uint128 minRequiredSignatures_
  ) external onlySafeWallet(willId_) nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    //Check  beneficiaries length
    if (beneficiaries_.length != nickName_.length || beneficiaries_.length == 0) revert BeneficiariesInvalid();

    //Set beneficiaries[]
    uint256 numberOfBeneficiaries = IInheritanceWill(willAddress).setWillBeneficiaries(msg.sender, beneficiaries_, minRequiredSignatures_);

    //Check min require signatures
    if (minRequiredSignatures_ == 0 || minRequiredSignatures_ > numberOfBeneficiaries) revert MinRequiredSignaturesInvalid();

    //Check beneficiary limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    emit InheritanceWillBeneficiariesUpdated(willId_, nickName_, beneficiaries_, minRequiredSignatures_, block.timestamp);
  }

  /**
   * @dev Set lackOfOutgoingTxRange will, call this function if only modify lackOfOutgoingTxRange to save gas for user.
   * @param willId_ will id
   * @param lackOfOutgoingTxRange_ lackOfOutgoingTxRange
   */
  function setActivationTrigger(uint256 willId_, uint128 lackOfOutgoingTxRange_) external onlySafeWallet(willId_) nonReentrant {
    address willAddress = _checkWillExisted(willId_);

    //Check activation trigger
    if (lackOfOutgoingTxRange_ == 0) revert ActivationTriggerInvalid();

    //Set lackOfOutgoingTxRange
    IInheritanceWill(willAddress).setActivationTrigger(msg.sender, lackOfOutgoingTxRange_);

    emit InheritanceWillActivationTriggerUpdated(willId_, lackOfOutgoingTxRange_, block.timestamp);
  }

  /**
   * @dev Set name and note will, call this function if only modify name and note to save gas for user.
   * @param willId_ will id
   * @param name_ name will
   * @param note_ note will
   */
  function setNameNote(uint256 willId_, string calldata name_, string calldata note_) external onlySafeWallet(willId_) {
    _checkWillExisted(willId_);

    emit InheritanceWillNameNoteUpdated(willId_, name_, note_, block.timestamp);
  }

  /**
   * @dev Active will, call this function when the safeWallet is eligible for activation.
   * @param willId_ will id
   */
  function activeWill(uint256 willId_) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    address guardAddress = _checkGuardExisted(willId_);

    //Active will
    (address[] memory newSigners, uint256 newThreshold) = IInheritanceWill(willAddress).activeWill(guardAddress);

    emit InheritanceWillActivated(willId_, newSigners, newThreshold, true, block.timestamp);
  }

  /* Internal function */
  /**
   * @dev Check whether the safe wallet invalid. Ensure safe wallet exist guard and will was created by system.
   * @param willId_ will id
   * @param safeWallet_ safe wallet address
   */
  function _checkSafeWalletValid(uint256 willId_, address safeWallet_) internal view {
    address guardAddress = _checkGuardExisted(willId_);
    address moduleAddress = _checkWillExisted(willId_);

    //Check safe wallet exist guard created by system
    bytes memory guardSafeWalletBytes = ISafeWallet(safeWallet_).getStorageAt(uint256(GUARD_STORAGE_SLOT), 1);
    address guardSafeWalletAddress = address(uint160(uint256(bytes32(guardSafeWalletBytes))));
    if (guardAddress != guardSafeWalletAddress) revert GuardSafeWalletInvalid();

    //Check safe wallet exist will created by system
    if (ISafeWallet(safeWallet_).isModuleEnabled(moduleAddress) == false) revert ModuleSafeWalletInvalid();
  }

  /**
   * @dev Check whether safe wallet exist guard.
   * @param safeWallet_ safe wallet address
   * @return bool true if guard exist, false otherwise
   */
  function _checkExistGuardInSafeWallet(address safeWallet_) internal view returns (bool) {
    bytes memory guardSafeWalletBytes = ISafeWallet(safeWallet_).getStorageAt(uint256(GUARD_STORAGE_SLOT), 1);
    address guardSafeWalletAddress = address(uint160(uint256(bytes32(guardSafeWalletBytes))));
    if (guardSafeWalletAddress == address(0)) return false;
    return true;
  }

  /**
   * @dev Check whether signer is signer of safeWallet.
   * @param safeWallet_  safe wallet address
   * @param signer_ signer address
   */
  function _checkSignerIsOwnerOfSafeWallet(address safeWallet_, address signer_) internal view returns (bool) {
    address[] memory signers = ISafeWallet(safeWallet_).getOwners();
    for (uint256 i = 0; i < signers.length; i++) {
      if (signer_ == signers[i]) {
        return true;
      }
    }
    return false;
  }
}
