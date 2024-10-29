//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WillRouter} from "../common/WillRouter.sol";
import {WillFactory} from "../common/WillFactory.sol";
import {ForwardingWill} from "./ForwardingWill.sol";
import {SafeGuard} from "../SafeGuard.sol";
import {IForwardingWill} from "../interfaces/IForwardingWill.sol";
import {ISafeGuard} from "../interfaces/ISafeGuard.sol";
import {ISafeWallet} from "../interfaces/ISafeWallet.sol";
import {ForwardingWillStruct} from "../libraries/ForwardingWillStruct.sol";

contract ForwardingWillRouter is WillRouter, WillFactory, ReentrancyGuard {
  /* Error */
  error ExistedGuardInSafeWallet(address);
  error SignerIsNotOwnerOfSafeWallet();
  error NumBeneficiariesInvalid();
  error NumAssetsInvalid();
  error DistributionsInvalid();
  error ActivationTriggerInvalid();
  error GuardSafeWalletInvalid();
  error ModuleSafeWalletInvalid();

  /* Struct */
  struct WillMainConfig {
    string name;
    string note;
    string[] nickNames;
    ForwardingWillStruct.Distribution[] distributions;
  }

  /* Event */
  event ForwardingWillCreated(
    uint256 willId,
    address willAddress,
    address guardAddress,
    address creatorAddress,
    address safeAddress,
    WillMainConfig mainConfig,
    ForwardingWillStruct.WillExtraConfig extraConfig,
    uint256 timestamp
  );
  event ForwardingWillConfigUpdated(uint256 willId, WillMainConfig mainConfig, ForwardingWillStruct.WillExtraConfig extraConfig, uint256 timestamp);
  event ForwardingWillDistributionUpdated(uint256 willId, string[] nickNames, ForwardingWillStruct.Distribution[] distributions, uint256 timestamp);
  event ForwardingWillTriggerUpdated(uint256 willId, uint128 lackOfOutgoingTxRange, uint256 timestamp);
  event ForwardingWillNameNoteUpdated(uint256 willId, string name, string note, uint256 timestamp);
  event ForwardingWillActivated(uint256 willId, address[] assetAddresses, bool isETH, uint256 timestamp);

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

    return IForwardingWill(willAddress).checkActiveWill(guardAddress);
  }

  /**
   * @dev create new will and guard
   * @param safeWallet   safe wallet address
   * @param mainConfig_  include name, note, nickname [], distributions[]
   * @param extraConfig_  include lackOfOutgoingTxRange
   * @return address will address
   * @return address guard address
   */
  function createWill(
    address safeWallet,
    WillMainConfig calldata mainConfig_,
    ForwardingWillStruct.WillExtraConfig calldata extraConfig_
  ) external nonReentrant returns (address, address) {
    //Check beneficiaries length
    if (mainConfig_.distributions.length != mainConfig_.nickNames.length || mainConfig_.distributions.length == 0) revert DistributionsInvalid();

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
      type(ForwardingWill).creationCode,
      type(SafeGuard).creationCode,
      msg.sender
    );

    // Initialize will
    uint256 numberOfBeneficiaries = IForwardingWill(willAddress).initialize(newWillId, safeWallet, mainConfig_.distributions, extraConfig_);

    // Initialize guard
    ISafeGuard(guardAddress).initialize();

    // Check beneficiaries limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    emit ForwardingWillCreated(newWillId, willAddress, guardAddress, msg.sender, safeWallet, mainConfig_, extraConfig_, block.timestamp);

    return (willAddress, guardAddress);
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
  ) external onlySafeWallet(willId_) nonReentrant {
    address willAddress = _checkWillExisted(willId_);

    //Check ditribution length
    if (mainConfig_.distributions.length != mainConfig_.nickNames.length || mainConfig_.distributions.length == 0) revert DistributionsInvalid();

    //Check invalid activation trigger
    if (extraConfig_.lackOfOutgoingTxRange == 0) revert ActivationTriggerInvalid();

    //Set distributions
    uint256 numberBeneficiaries = IForwardingWill(willAddress).setWillDistributions(msg.sender, mainConfig_.distributions);

    //Check num beneficiaries and assets
    if (!_checkNumBeneficiariesLimit(numberBeneficiaries)) revert NumBeneficiariesInvalid();

    //Set lackOfOutgoingTxRange
    IForwardingWill(willAddress).setActivationTrigger(msg.sender, extraConfig_.lackOfOutgoingTxRange);

    emit ForwardingWillConfigUpdated(willId_, mainConfig_, extraConfig_, block.timestamp);
  }

  /**
   * @dev Set distributions[] will, call this function if only modify beneficiaries[], minRequiredSignatures to save gas for user.
   * @param willId_ will id
   * @param nickNames_  nick name[]
   * @param distributions_ ditributions[]
   */
  function setWillDistributions(
    uint256 willId_,
    string[] calldata nickNames_,
    ForwardingWillStruct.Distribution[] calldata distributions_
  ) external onlySafeWallet(willId_) {
    address willAddress = _checkWillExisted(willId_);
    // Check distribution length
    if (distributions_.length != nickNames_.length || distributions_.length == 0) revert DistributionsInvalid();

    // Set distribution assets
    uint256 numberOfBeneficiaries = IForwardingWill(willAddress).setWillDistributions(msg.sender, distributions_);

    //Check beneficiary limit
    if (!_checkNumBeneficiariesLimit(numberOfBeneficiaries)) revert NumBeneficiariesInvalid();

    emit ForwardingWillDistributionUpdated(willId_, nickNames_, distributions_, block.timestamp);
  }

  /**
   * @dev set activation trigger time, call this function if only mofify lackOfOutgoingTxRange to save gas for user.
   * @param willId_ will id
   * @param lackOfOutgoingTxRange_ lackOfOutgoingTxRange
   */
  function setActivationTrigger(uint256 willId_, uint128 lackOfOutgoingTxRange_) external onlySafeWallet(willId_) {
    address willAddress = _checkWillExisted(willId_);

    //Check invalid activation trigger
    if (lackOfOutgoingTxRange_ == 0) revert ActivationTriggerInvalid();

    //Set lackOfOutgoingTxRange_
    IForwardingWill(willAddress).setActivationTrigger(msg.sender, lackOfOutgoingTxRange_);

    emit ForwardingWillTriggerUpdated(willId_, lackOfOutgoingTxRange_, block.timestamp);
  }

  /**
   * @dev Set name and note will, call this function if only modify name and note to save gas for user.
   * @param willId_ will id
   * @param name_ name will
   * @param note_ note will
   */
  function setNameNote(uint256 willId_, string calldata name_, string calldata note_) external onlySafeWallet(willId_) {
    _checkWillExisted(willId_);

    emit ForwardingWillNameNoteUpdated(willId_, name_, note_, block.timestamp);
  }

  /**
   * @dev Active will, call this function when the safewallet is eligible for activation.
   * @param willId_ will id
   */
  function activeWill(uint256 willId_, address[] calldata assets_, bool isETH_) external nonReentrant {
    address willAddress = _checkWillExisted(willId_);
    address guardAddress = _checkGuardExisted(willId_);
    if (isETH_ == false && assets_.length == 0) revert NumAssetsInvalid();

    //Active will
    address[] memory assets = IForwardingWill(willAddress).activeWill(guardAddress, assets_, isETH_);
    emit ForwardingWillActivated(willId_, assets, isETH_, block.timestamp);
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
