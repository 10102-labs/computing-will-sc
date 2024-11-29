//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {GenericWill} from "../common/GenericWill.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {ForwardingWillStruct} from "../libraries/ForwardingWillStruct.sol";

contract ForwardingEOAWill is GenericWill {
  using EnumerableSet for EnumerableSet.AddressSet;

  /* Error */
  error NotBeneficiary();
  error DistributionUserInvalid();
  error DistributionAssetInvalid();
  error AssetInvalid();
  error PercentInvalid();
  error TotalPercentInvalid();
  error NotEnoughConditionalActive();
  error ExecTransactionFromModuleFailed();
  error BeneficiariesIsClaimed();
  error WillIsDeleted();
  error SafeTransferFromFailed(address, address, address);
  error NotEnoughETH();

  /* State variable */
  uint128 public constant WILL_TYPE = 3;
  uint128 public constant MAX_TRANSFER = 100;
  uint256 public _lastTimestamp;
  uint256 public _isLive = 1;

  EnumerableSet.AddressSet private _beneficiariesSet;
  mapping(address beneficiaries => uint256) public _distributions;

  modifier onlyLive() {
    if (_isLive != 1) {
      revert WillIsDeleted();
    }
    _;
  }
  /* View function */
  /**
   * @dev get beneficiaries list
   */
  function getBeneficiaries() external view returns (address[] memory) {
    return _beneficiariesSet.values();
  }

  /**
   * @dev Check activation conditions
   * @return bool true if eligible for activation, false otherwise
   */
  function checkActiveWill() external view returns (bool) {
    return _checkActiveWill();
  }

  /* Main function */
  /**
   * @dev Initialize info will
   * @param willId_ will id
   * @param owner_ owner of will
   * @param distributions_ distributions list
   * @param config_ include lackOfOutgoingTxRange
   */
  function initialize(
    uint256 willId_,
    address owner_,
    ForwardingWillStruct.Distribution[] calldata distributions_,
    ForwardingWillStruct.WillExtraConfig calldata config_
  ) external notInitialized returns (uint256 numberOfBeneficiaries) {
    if (owner_ == address(0)) revert OwnerInvalid();

    //set info will
    _setWillInfo(willId_, owner_, 1, config_.lackOfOutgoingTxRange, msg.sender);
    numberOfBeneficiaries = _setDistributions(owner_, distributions_);

    _lastTimestamp = block.timestamp;
  }

  /**
   * @dev set distributions[]
   * @param sender_  sender address
   * @param distributions_ distributions
   */
  function setWillDistributions(
    address sender_,
    ForwardingWillStruct.Distribution[] calldata distributions_
  ) external onlyRouter onlyLive onlyOwner(sender_) isActiveWill returns (uint256 numberOfBeneficiaries) {
    _clearDistributions();
    numberOfBeneficiaries = _setDistributions(sender_, distributions_);

    _lastTimestamp = block.timestamp;
  }

  /**
   * @dev Set lackOfOutgoingTxRange will
   * @param sender_  sender
   * @param lackOfOutgoingTxRange_  lackOfOutgoingTxRange
   */
  function setActivationTrigger(address sender_, uint128 lackOfOutgoingTxRange_) external onlyRouter onlyLive onlyOwner(sender_) isActiveWill {
    _setActivationTrigger(lackOfOutgoingTxRange_);

    _lastTimestamp = block.timestamp;
  }

  /**
   * @dev mark to the owner is still alive
   * @param sender_ sender
   */
  function activeAlive(address sender_) external onlyRouter onlyLive onlyOwner(sender_) isActiveWill {
    _lastTimestamp = block.timestamp;
  }

  function deleteWill(address sender_) external onlyRouter onlyLive onlyOwner(sender_) isActiveWill {
    _isLive = 2;
    _lastTimestamp = block.timestamp;

    payable(sender_).transfer(address(this).balance);
  }

  receive() external payable onlyLive {
    if (msg.sender == getWillOwner()) {
      _lastTimestamp = block.timestamp;
    }
  }

  /**
   * @dev withdraw ETH
   * @param amount_ amount contract
   */
  function withdraw(address sender_, uint256 amount_) external onlyRouter onlyLive onlyOwner(sender_) {
    if (address(this).balance < amount_) {
      revert NotEnoughETH();
    }
    _lastTimestamp = block.timestamp;
    payable(sender_).transfer(amount_);
  }

  /**
   * @param assets erc20 token list
   * @param isETH_ check is native token
   */
  function activeWill(address[] calldata assets_, bool isETH_) external onlyRouter onlyLive returns (address[] memory assets) {
    if (_checkActiveWill()) {
      if (getIsActiveWill() == 1) {
        _setWillToInactive();
      }
      assets = _transferAssetToBeneficiaries(assets_, isETH_);
    } else {
      revert NotEnoughConditionalActive();
    }
  }

  /* Utils function */

  /**
   * @dev Check activation conditions
   * @return bool true if eligible for activation, false otherwise
   */
  function _checkActiveWill() private view returns (bool) {
    uint256 lackOfOutgoingTxRange = getActivationTrigger();
    if (_lastTimestamp + lackOfOutgoingTxRange > block.timestamp) {
      return false;
    }
    return true;
  }

  /**
   * @dev set distribution list
   * @param owner_ address
   * @param distributions_  distributions list
   * @return numberOfBeneficiaries number of beneficiaries
   */
  function _setDistributions(
    address owner_,
    ForwardingWillStruct.Distribution[] calldata distributions_
  ) internal returns (uint256 numberOfBeneficiaries) {
    uint256 totalPercent = 0;

    for (uint256 i = 0; i < distributions_.length; ) {
      _checkDistribution(owner_, distributions_[i]);
      _beneficiariesSet.add(distributions_[i].user);
      _distributions[distributions_[i].user] = distributions_[i].percent;
      totalPercent += distributions_[i].percent;
      unchecked {
        i++;
      }
    }
    if (totalPercent != 100) revert TotalPercentInvalid();

    numberOfBeneficiaries = _beneficiariesSet.length();
  }

  /**
   * @dev clear distributions list
   */
  function _clearDistributions() internal {
    address[] memory beneficiaries = _beneficiariesSet.values();
    for (uint256 i = 0; i < beneficiaries.length; ) {
      _beneficiariesSet.remove(beneficiaries[i]);
      _distributions[beneficiaries[i]] = 0;
      unchecked {
        i++;
      }
    }
  }

  /**
   * @dev check distribution
   * @param owner_ owner will
   * @param distribution_ distribution
   */
  function _checkDistribution(address owner_, ForwardingWillStruct.Distribution calldata distribution_) private view {
    if (distribution_.percent == 0 || distribution_.percent > 100) revert DistributionAssetInvalid();
    if (distribution_.user == address(0) || distribution_.user == owner_ || _isContract(distribution_.user)) revert DistributionAssetInvalid();
  }

  /**
   * @dev transfer asset to beneficiaries
   */
  function _transferAssetToBeneficiaries(address[] calldata assets_, bool isETH_) private returns (address[] memory assets) {
    address ownerAddress = getWillOwner();
    address[] memory beneficiaries = _beneficiariesSet.values();
    uint256 n = assets_.length;
    uint256 maxTransfer = MAX_TRANSFER;
    if (isETH_) {
      maxTransfer = maxTransfer - beneficiaries.length;
      uint256 totalAmountEth = address(this).balance;
      for (uint256 i = 0; i < beneficiaries.length; ) {
        uint256 amount = (totalAmountEth * _distributions[beneficiaries[i]]) / 100;
        if (amount > 0) {
          _transferEthToBeneficiary(beneficiaries[i], amount);
        }
        unchecked {
          i++;
        }
      }
    }

    if (n * beneficiaries.length > maxTransfer) {
      n = maxTransfer / beneficiaries.length;
    }

    assets = new address[](n);
    for (uint256 i = 0; i < n; ) {
      uint256 allowanceAmountErc20 = IERC20(assets_[i]).allowance(ownerAddress, address(this));
      uint256 balanceAmountErc20 = IERC20(assets_[i]).balanceOf(ownerAddress);
      uint256 totalAmountErc20 = balanceAmountErc20 > allowanceAmountErc20 ? allowanceAmountErc20 : balanceAmountErc20;
      assets[i] = assets_[i];
      for (uint256 j = 0; j < beneficiaries.length; ) {
        uint256 amount = (totalAmountErc20 * _distributions[beneficiaries[j]]) / 100;
        if (amount > 0) {
          _transferErc20ToBeneficiary(assets_[i], ownerAddress, beneficiaries[j], amount);
        }
        unchecked {
          j++;
        }
      }
      unchecked {
        i++;
      }
    }
  }

  /**
   * @dev transfer erc20 token to beneficiaries
   * @param erc20Address_  erc20 token address
   * @param from_ safe wallet address
   * @param to_ beneficiary address
   */
  function _transferErc20ToBeneficiary(address erc20Address_, address from_, address to_, uint256 amount_) private {
    (bool success, bytes memory data) = erc20Address_.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from_, to_, amount_));
    if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert SafeTransferFromFailed(erc20Address_, from_, to_);
  }

  /**
   * @dev transfer eth to beneficiaries
   * @param to_ beneficiary address
   */
  function _transferEthToBeneficiary(address to_, uint256 amount_) private {
    payable(to_).transfer(amount_);
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
