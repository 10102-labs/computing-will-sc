//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {GenericWill} from "../common/GenericWill.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {ISafeGuard} from "../interfaces/ISafeGuard.sol";
import {ISafeWallet} from "../interfaces/ISafeWallet.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/libraries/Enum.sol";
import {InheritanceWillStruct} from "../libraries/InheritanceWillStruct.sol";

contract InheritanceWill is GenericWill {
  error BeneficiaryInvalid();
  error NotBeneficiary();
  error NotEnoughConditionalActive();
  error ExecTransactionFromModuleFailed();

  using EnumerableSet for EnumerableSet.AddressSet;

  /* State variable */
  uint128 public constant WILL_TYPE = 1;
  uint128 public _minRequiredSignatures = 1;
  EnumerableSet.AddressSet private _beneficiariesSet;

  /* View function */
  /**
   * @dev get beneficiaries list
   */
  function getBeneficiaries() external view returns (address[] memory) {
    return _beneficiariesSet.values();
  }

  /**
   * @dev get minRequiredSignatures
   */
  function getMinRequiredSignatures() external view returns (uint128) {
    return _minRequiredSignatures;
  }

  /**
   * @dev Check activation conditions
   * @param guardAddress_ guard
   * @return bool true if eligible for activation, false otherwise
   */
  function checkActiveWill(address guardAddress_) external view returns (bool) {
    return _checkActiveWill(guardAddress_);
  }

  /* Main function */
  /**
   * @dev Initialize info will
   * @param willId_ will id
   * @param owner_ owner of will
   * @param beneficiaries_ beneficiaries list
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
    _setWillInfo(willId_, owner_, 1, config_.lackOfOutgoingTxRange, msg.sender);

    //set minRequiredSignatures
    _setMinRequiredSignatures(config_.minRequiredSignatures);

    //set beneficiaries
    numberOfBeneficiaries = _setBeneficiaries(owner_, beneficiaries_);
  }

  /**
   * @dev Set beneficiaries[], minRequiredSignatures will
   * @param sender_  sender address
   * @param beneficiaries_ beneficiaries list
   * @param minRequiredSigs_ minRequiredSignatures
   * @return numberOfBeneficiaries numberOfBeneficiaries
   */
  function setWillBeneficiaries(
    address sender_,
    address[] calldata beneficiaries_,
    uint128 minRequiredSigs_
  ) external onlyRouter onlyOwner(sender_) isActiveWill returns (uint256 numberOfBeneficiaries) {
    //clear beneficiaries
    _clearBeneficiaries();

    //set minRequiredSignatures
    _setMinRequiredSignatures(minRequiredSigs_);

    //set beneficiaries
    numberOfBeneficiaries = _setBeneficiaries(sender_, beneficiaries_);
  }

  /**
   * @dev Set lackOfOutgoingTxRange will
   * @param sender_  sender address
   * @param lackOfOutgoingTxRange_  lackOfOutgoingTxRange
   */
  function setActivationTrigger(address sender_, uint128 lackOfOutgoingTxRange_) external onlyRouter onlyOwner(sender_) isActiveWill {
    _setActivationTrigger(lackOfOutgoingTxRange_);
  }

  /**
   * @dev Active will
   * @param guardAddress_ guard address
   * @return newSigners new threshold list
   */
  function activeWill(address guardAddress_) external onlyRouter isActiveWill returns (address[] memory newSigners, uint256 newThreshold) {
    //Active will
    if (_checkActiveWill(guardAddress_)) {
      address[] memory beneficiariesList = _beneficiariesSet.values();
      _setWillToInactive();
      _clearBeneficiaries();
      (newSigners, newThreshold) = _addOwnerWithThreshold(beneficiariesList);
    } else {
      revert NotEnoughConditionalActive();
    }
  }

  /* Utils function */
  /**
   * @dev Check activation conditions
   * @param guardAddress_ guard
   * @return bool true if eligible for activation, false otherwise
   */
  function _checkActiveWill(address guardAddress_) private view returns (bool) {
    uint256 lastTimestamp = ISafeGuard(guardAddress_).getLastTimestampTxs();
    uint256 lackOfOutgoingTxRange = uint256(getActivationTrigger());
    if (lastTimestamp + lackOfOutgoingTxRange > block.timestamp) {
      return false;
    }
    return true;
  }

  /**
   * @dev Set beneficiaries[], minRequiredSignatures will
   * @param owner_  owner will
   * @param beneficiaries_  beneficiaries[]
   */
  function _setBeneficiaries(address owner_, address[] calldata beneficiaries_) private returns (uint256 numberOfBeneficiaries) {
    address[] memory signers = ISafeWallet(owner_).getOwners();
    for (uint256 i = 0; i < beneficiaries_.length; ) {
      _checkBeneficiaries(signers, owner_, beneficiaries_[i]);
      _beneficiariesSet.add(beneficiaries_[i]);
      unchecked {
        ++i;
      }
    }
    numberOfBeneficiaries = _beneficiariesSet.length();
  }

  /**
   * @dev set minRequireSignatures
   * @param minRequiredSignatures_  minRequireSignatures
   */
  function _setMinRequiredSignatures(uint128 minRequiredSignatures_) private {
    _minRequiredSignatures = minRequiredSignatures_;
  }

  /**
   * @dev Clear beneficiaries list of will
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
   * @dev Add beneficiaries and set threshold in safe wallet
   * @param newSigners, newThreshold
   */
  function _addOwnerWithThreshold(address[] memory beneficiaries_) private returns (address[] memory newSigners, uint256 newThreshold) {
    address owner = getWillOwner();
    uint256 threshold = ISafeWallet(owner).getThreshold();
    for (uint256 i = 0; i < beneficiaries_.length; ) {
      bytes memory addOwnerData = abi.encodeWithSignature("addOwnerWithThreshold(address,uint256)", beneficiaries_[i], threshold);
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

  /**
   *
   * @param signers_  signer list
   * @param owner_  safe wallet address
   * @param beneficiary_ beneficiary address
   */
  function _checkBeneficiaries(address[] memory signers_, address owner_, address beneficiary_) private view {
    if (beneficiary_ == address(0) || beneficiary_ == owner_ || _isContract(beneficiary_)) revert BeneficiaryInvalid();

    for (uint256 j = 0; j < signers_.length; ) {
      if (beneficiary_ == signers_[j]) revert BeneficiaryInvalid();
      unchecked {
        j++;
      }
    }
  }

  /**
   * @dev check whether addr is a smart contract address or eoa address
   * @param addr  the address need to check
   */
  function _isContract(address addr) private view returns (bool) {
    uint256 size;
    assembly ("memory-safe") {
      size := extcodesize(addr)
    }
    return size > 0;
  }
}
