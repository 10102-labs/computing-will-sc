//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WillRouter} from "./common/WillRouter.sol";
import {WillFactory} from "./common/WillFactory.sol";
import {InheritanceWill} from "./InheritanceWill.sol";
import {SafeGuard} from "./SafeGuard.sol";
import {IInheritanceWill} from "./interfaces/IInheritanceWill.sol";
import {ISafeGuard} from "./interfaces/ISafeGuard.sol";
import {InheritanceWillStruct} from "./libraries/InheritanceWillStruct.sol";
import {ISafeWallet} from "./interfaces/ISafeWallet.sol";

contract InheritanceWillRouter is WillRouter, WillFactory, ReentrancyGuard {
  /* Error */
  error ExistedGuardInSafeWallet(address);
  error SignerIsNotOwnerOfSafeWallet();
  error NotEnoughEther();
  error BeneficiaryLimitExceeded();
  error EmptyArray();
  error WillLimitExceeded(address user);
  error TwoArraysLengthMismatch();
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
    address owner,
    address safeWallet,
    WillMainConfig mainConfig,
    InheritanceWillStruct.WillExtraConfig extraConfig,
    uint256 timestamp
  );
  event InheritanceWillDeleted(uint256 willId, address owner, uint256 timestamp);
  event InheritanceWillConfigUpdated(uint256 willId, WillMainConfig mainConfig, InheritanceWillStruct.WillExtraConfig extraConfig, uint256 timestamp);
  event InheritanceWillBeneficiesUpdated(
    uint256 willId,
    string[] nickName,
    address[] beneficiaries,
    uint128 minRequiredSignatures,
    uint256 timestamp
  );
  event InheritanceWillActivationTriggerUpdated(uint256 willId, uint128 lackOfOutgoingTxRange, uint256 timestamp);
  event InheritanceWillNameNoteUpdated(uint256 willId, string name, string note, uint256 timestamp);
  event InheritanceWillActivated(uint256 willId, address[] newSigners, uint256 newThreshold, bool success, uint256 timestamp);

  /* Constructor */
  constructor(uint256 beneficiaryLimit_) WillRouter(beneficiaryLimit_) {}

  /* Modifier */
  modifier onlySafeWallet(uint256 willId_) {
    _checkSafeWalletValid(willId_, msg.sender);
    _;
  }

  /* Public function */
  /**
   * @dev Get next will address
   * @param sender_ sender address
   * @return address will address
   */
  function getNextWillAddress(address sender_) public view returns (address) {
    bytes memory bytecode = type(InheritanceWill).creationCode;
    return _getNextAddress(bytecode, sender_);
  }

  /**
   * @dev Get next guard address
   * @param sender_ sender address
   * @return address guard address
   */

  function getNextGuardAddress(address sender_) public view returns (address) {
    bytes memory bytecode = type(SafeGuard).creationCode;
    return _getNextAddress(bytecode, sender_);
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
    if (mainConfig_.beneficiaries.length != mainConfig_.nickNames.length) revert TwoArraysLengthMismatch();
    if (mainConfig_.beneficiaries.length == 0) revert EmptyArray();
    if (_checkExistGuardInSafeWallet(safeWallet)) {
      revert ExistedGuardInSafeWallet(safeWallet);
    }
    if (!_checkSignerIsOwnerOfSafeWallet(safeWallet, msg.sender)) revert SignerIsNotOwnerOfSafeWallet();

    // Create new will and guard
    (uint256 newWillId, address willAddress, address guardAddress) = _createWill(
      type(InheritanceWill).creationCode,
      type(SafeGuard).creationCode,
      msg.sender
    );

    // Initialize will
    uint256 numberOfBeneficiaries = IInheritanceWill(willAddress).initialize(newWillId, safeWallet, mainConfig_.beneficiaries, extraConfig_);

    //Initialize safeguard
    ISafeGuard(guardAddress).initialize();

    // Check beneficiary limit
    if (!_checkBeneficiaryLimit(numberOfBeneficiaries)) revert BeneficiaryLimitExceeded();

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
    //Check length beneficiaries[]
    if (mainConfig_.beneficiaries.length != mainConfig_.nickNames.length) revert TwoArraysLengthMismatch();
    if (mainConfig_.beneficiaries.length == 0) revert EmptyArray();

    address willAddress = _checkWillExisted(willId_);

    //Set beneficiaries[]
    uint256 numberOfBeneficiaries = IInheritanceWill(willAddress).setWillBeneficiaries(
      msg.sender,
      mainConfig_.beneficiaries,
      extraConfig_.minRequiredSignatures
    );

    //Check beneficiary limit
    if (!_checkBeneficiaryLimit(numberOfBeneficiaries)) revert BeneficiaryLimitExceeded();

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
    //Check length beneficiaries[]
    if (beneficiaries_.length != nickName_.length) revert TwoArraysLengthMismatch();
    if (beneficiaries_.length == 0) revert EmptyArray();

    address willAddress = _checkWillExisted(willId_);

    //Set beneficiaries[]
    uint256 numberOfBeneficiaries = IInheritanceWill(willAddress).setWillBeneficiaries(msg.sender, beneficiaries_, minRequiredSignatures_);

    //Check beneficiary limit
    if (!_checkBeneficiaryLimit(numberOfBeneficiaries)) revert BeneficiaryLimitExceeded();

    emit InheritanceWillBeneficiesUpdated(willId_, nickName_, beneficiaries_, minRequiredSignatures_, block.timestamp);
  }

  /**
   * @dev Set lackOfOutgoingTxRange will, call this function if only mofify lackOfOutgoingTxRange to save gas for user.
   * @param willId_ will id
   * @param lackOfOutgoingTxRange_ lackOfOutgoingTxRange
   */
  function setActivationTrigger(uint256 willId_, uint128 lackOfOutgoingTxRange_) external onlySafeWallet(willId_) nonReentrant {
    address willAddress = _checkWillExisted(willId_);

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
  function setNameNote(uint256 willId_, string calldata name_, string calldata note_) external {
    _checkWillExisted(willId_);
    emit InheritanceWillNameNoteUpdated(willId_, name_, note_, block.timestamp);
  }

  /**
   * @dev Active will, call this function when the safewallet is eligible for activation.
   * @param willId_ will id
   */
  function activeWill(uint256 willId_) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    address guardAddress = _checkGuardExisted(willId_);

    //Active will
    (address[] memory newSigners, uint256 newThreshold) = IInheritanceWill(willAddress).activeWill(msg.sender, guardAddress);

    emit InheritanceWillActivated(willId_, newSigners, newThreshold, true, block.timestamp);
  }

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
   * @dev Check whether signer is signer of safewallet.
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
