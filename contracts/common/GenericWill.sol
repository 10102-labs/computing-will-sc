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
  error OwnerInvalid();

  /* State variable */
  uint256 private _willId;
  address private _owner;
  uint128 private _isActive;
  uint128 private _lackOfOutgoingTxRange;
  address public router;

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
   * @dev Get is active will
   */
  function getIsActiveWill() public view returns (uint128) {
    return _isActive;
  }

  /**
   * @dev Get lackOfOutgoingTxRange
   */
  function getActivationTrigger() public view returns (uint128) {
    return _lackOfOutgoingTxRange;
  }

  /* Internal function */
  /**
   * @dev Set will info
   * @param willId_ will id
   * @param owner_ will owner
   * @param isActive_ isActive
   * @param lackOfOutgoingTxRange_ lackOfOutgoingTxRange
   * @param router_ router
   */
  function _setWillInfo(uint256 willId_, address owner_, uint128 isActive_, uint128 lackOfOutgoingTxRange_, address router_) internal {
    _willId = willId_;
    _owner = owner_;
    _isActive = isActive_;
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
}
