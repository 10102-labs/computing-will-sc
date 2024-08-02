//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import {IERC20Whitelist} from "../interfaces/IERC20Whitelist.sol";

contract GenericWill {
  /* Error */
  error OnlyRouter();
  error OnlyOwner();
  error WillAlreadyInitialized();
  error WillNotActive();
  error NotEnoughEther();
  error OwnerInvalid();
  error BeneficiaryInvalid();
  error MinRequiredSignaturesInvalid();
  error NotBeneficiary();
  error NotEnoughContitionalActive();
  error SafeTransferFromFailed(address token, address from, address to);
  error ExecTransactionFromModuleFailed();

  /* State variable */
  uint256 private _willId;
  uint8 private _isActive;
  address public router;
  address private _owner;
  uint128 public _minRequiredSignatures;
  uint128 public _lackOfOutgoingTxRange;

  /* Modifier */
  modifier onlyRouter() {
    if (msg.sender != router) revert OnlyRouter();
    _;
  }

  modifier onlyOwner(address sender_) {
    if (sender_ != _owner) revert OnlyOwner();
    _;
  }

  modifier notInitialized() {
    if (_owner != address(0)) revert WillAlreadyInitialized();
    _;
  }

  modifier isActiveWill() {
    if (_isActive == 2) revert WillNotActive();
    _;
  }

  /* Public function */
  /**
   * @dev Get will infomation
   * @return willId
   * @return owner
   * @return isActive
   */
  function getWillInfo() public view returns (uint256, address, uint128) {
    return (_willId, _owner, _isActive);
  }

  /**
   * @dev Get will owner
   */
  function getWillOwner() public view returns (address) {
    return _owner;
  }

  /**
   * @dev Get lackOfOutgoingTxRange
   */
  function getActivationTrigger() public view returns (uint128) {
    return _lackOfOutgoingTxRange;
  }

  /**
   * @dev Get minRequiredSignatures
   */
  function getMinRequiredSignatures() public view returns (uint128) {
    return _minRequiredSignatures;
  }

  // receive() external payable {}

  /* Internal function */
  /**
   * @dev Set will info
   * @param willId_ will id
   * @param owner_ will owner
   * @param isActive_ isActive
   * @param minRequiredSignatures_ minRequiredSignatures
   * @param lackOfOutgoingTxRange_ lackOfOutgoingTxRange
   * @param router_ router
   */
  function _setWillInfo(
    uint256 willId_,
    address owner_,
    uint8 isActive_,
    uint128 minRequiredSignatures_,
    uint128 lackOfOutgoingTxRange_,
    address router_
  ) internal {
    _willId = willId_;
    _isActive = isActive_;
    _owner = owner_;
    _minRequiredSignatures = minRequiredSignatures_;
    _lackOfOutgoingTxRange = lackOfOutgoingTxRange_;
    router = router_;
  }

  /**
   * @dev Set lackOfOutgoingTxRange will
   * @param lackOfOutgoingTxRange_  lackOfOutgoingTxRange
   */
  function _setActivationTrigger(uint128 lackOfOutgoingTxRange_) internal {
    _lackOfOutgoingTxRange = lackOfOutgoingTxRange_;
  }

  /**
   * @dev Inactive will
   */
  function _setWillToInactive() internal {
    _isActive = 2;
  }

  // /**
  //  * @dev transfer token
  //  * @param token token
  //  * @param from  from
  //  * @param to  to
  //  * @param value value
  //  */
  // function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
  //   (bool success, bytes memory data) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, value));
  //   if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert SafeTransferFromFailed(token, from, to);
  // }

  // /**
  //  * @dev withdraw eth
  //  * @param sender_  sender
  //  * @param amount_  amount
  //  */
  // function withdrawEth(address sender_, uint256 amount_) external onlyRouter onlyOwner(sender_) {
  //   if (address(this).balance < amount_) revert NotEnoughEther();
  //   payable(sender_).transfer(amount_);
  // }
}
