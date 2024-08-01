//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {GenericWill} from "./common/GenericWill.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {ISafeGuard} from "./interfaces/ISafeGuard.sol";
import {ISafeWallet} from "./interfaces/ISafeWallet.sol";
import {InheritanceWillStruct} from "./libraries/InheritanceWillStruct.sol";
import {Enum} from "./libraries/Enum.sol";

contract InheritanceWill is GenericWill {
  using EnumerableSet for EnumerableSet.AddressSet;

  /* State variable */
  uint256 public constant WILL_TYPE = 1;
  EnumerableSet.AddressSet private _beneficiariesSet;

  /* Public function */
  /**
   * @dev get beneficiaries list
   */
  function getBeneficiaries() external view returns (address[] memory) {
    return _beneficiariesSet.values();
  }

  /* External function */

  /**
   * @dev Initialize info will
   * @param willId_ will id
   * @param owner_ owner of will
   * @param beneficiaries_ beneficiaries []
   * @param config_ include minRequiredSignatures, lackOfOutgoingTxRange
   */
  function initialize(
    uint256 willId_,
    address owner_,
    address[] calldata beneficiaries_,
    InheritanceWillStruct.WillExtraConfig calldata config_
  ) external notInitialized returns (uint256 numberOfBeneficiaries) {
    if (owner_ == address(0)) revert OwnerInvalid();

    //set info will
    _setWillInfo(willId_, owner_, 1, config_.minRequiredSignatures, config_.lackOfOutgoingTxRange, msg.sender);
    numberOfBeneficiaries = _setBeneficiaries(owner_, beneficiaries_, config_.minRequiredSignatures);
  }

  /**
   * @dev Set beneficiaries[], minRequiredSignatures will
   * @param sender_  sender
   * @param beneficiaries_ beneficiaries[]
   * @param minRequiredSigs_ minRequiredSignatures
   * @return numberOfBeneficiaries numberOfBeneficiares
   */
  function setWillBeneficiaries(
    address sender_,
    address[] calldata beneficiaries_,
    uint128 minRequiredSigs_
  ) external onlyRouter onlyOwner(sender_) isActiveWill returns (uint256 numberOfBeneficiaries) {
    //clear beneficiaries
    _clearBeneficiaries();

    //set beneficiaries
    numberOfBeneficiaries = _setBeneficiaries(sender_, beneficiaries_, minRequiredSigs_);
    _minRequiredSignatures = minRequiredSigs_;
  }

  /**
   * @dev Set lackOfOutgoingTxRange will
   * @param sender_  sender
   * @param lackOfOutgoingTxRange_  lackOfOutgoingTxRange
   */
  function setActivationTrigger(address sender_, uint128 lackOfOutgoingTxRange_) external onlyRouter onlyOwner(sender_) isActiveWill {
    _setActivationTrigger(lackOfOutgoingTxRange_);
  }

  /**
   * @dev Active will
   * @param sender_  sender
   * @param guardAddress_ guard
   * @return newSigners newThreshold
   */
  function activeWill(
    address sender_,
    address guardAddress_
  ) external onlyRouter isActiveWill returns (address[] memory newSigners, uint256 newThreshold) {
    //Check sender contain beneficiaries list
    if (!_beneficiariesSet.contains(sender_)) revert NotBeneficiary();

    //Active will
    if (_checkActiveWill(guardAddress_)) {
      address[] memory benficiariesList = _beneficiariesSet.values();
      _setWillToInactive();
      _clearBeneficiaries();
      (newSigners, newThreshold) = _addOwnerWithThreshold(benficiariesList);
    } else {
      revert NotEnoughContitionalActive();
    }
  }

  /**
   * @dev Check activation conditions
   * @param guardAddress_ guard
   * @return bool true if eligible for activation, false otherwise
   */
  function checkActiveWill(address guardAddress_) external view onlyRouter returns (bool) {
    return _checkActiveWill(guardAddress_);
  }

  /* Private function */

  /**
   * @dev Set beneficiaries[], minRequiredSignatures will
   * @param owner_  owner will
   * @param beneficiaries_  beneficiaries[]
   * @param minRequiredSignatures_ minRequiredSignatures
   */
  function _setBeneficiaries(
    address owner_,
    address[] calldata beneficiaries_,
    uint256 minRequiredSignatures_
  ) private returns (uint256 numberOfBeneficiaries) {
    for (uint256 i = 0; i < beneficiaries_.length; ) {
      address beneficiary = beneficiaries_[i];
      if (beneficiary == address(0) || beneficiary == owner_) revert BeneficiaryInvalid();
      _beneficiariesSet.add(beneficiary);
      unchecked {
        ++i;
      }
    }
    numberOfBeneficiaries = _beneficiariesSet.length();
    if (minRequiredSignatures_ > numberOfBeneficiaries) revert MinRequiredSignaturesInvalid();
  }

  /**
   * @dev Clear benecifiaries list of will
   */
  function _clearBeneficiaries() private {
    uint256 length = _beneficiariesSet.length();
    for (uint256 i = 0; i < length; ) {
      _beneficiariesSet.remove(_beneficiariesSet.at(0));
      unchecked {
        ++i;
      }
    }
  }

  /**
   * @dev Check activation conditions
   * @param guardAddress_ guard
   * @return bool true if eligible for activation, false otherwise
   */
  function _checkActiveWill(address guardAddress_) private view returns (bool) {
    uint256 lastTimestamp = ISafeGuard(guardAddress_).getLastTimestampTxs();
    if (lastTimestamp + _lackOfOutgoingTxRange >= block.timestamp) {
      return false;
    }
    return true;
  }

  /**
   * @dev Add beneficiaries and set threshold in safe wallet
   * @param newSigners, newThreshold
   */
  function _addOwnerWithThreshold(address[] memory beneficiries_) private returns (address[] memory newSigners, uint256 newThreshold) {
    address owner = getWillOwner();
    uint256 threshold = ISafeWallet(owner).getThreshold();
    for (uint256 i = 0; i < beneficiries_.length; ) {
      bytes memory addOwnerData = abi.encodeWithSignature("addOwnerWithThreshold(address,uint256)", beneficiries_[i], threshold);
      unchecked {
        ++i;
      }
      bool successAddOwner = ISafeWallet(owner).execTransactionFromModule(owner, 0, addOwnerData, Enum.Operation.Call);
      if (!successAddOwner) revert ExecTransactionFromModuleFailed();
    }
    if (threshold != _minRequiredSignatures) {
      bytes memory changeThresholdData = abi.encodeWithSignature("changeThreshold(uint256)", _minRequiredSignatures);
      bool successChangeThreshold = ISafeWallet(owner).execTransactionFromModule(owner, 0, changeThresholdData, Enum.Operation.Call);
      if (!successChangeThreshold) revert ExecTransactionFromModuleFailed();
    }
    newSigners = ISafeWallet(owner).getOwners();
    newThreshold = ISafeWallet(owner).getThreshold();
  }
}
