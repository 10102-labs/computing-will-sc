// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/Create2.sol";

contract EOAWillFactory {
  /* Error */
  error WillNotFound();

  /* State variable */
  uint256 public _willId;
  mapping(uint256 => address) public willAddresses;
  mapping(address => bool) public isCreateWill;
  mapping(address => uint256) public nonceByUsers;

  /* Internal function */
  /**
   * @dev get next address create
   * @param bytecode_  byte code
   * @param sender_  sender
   */
  function _getNextAddress(bytes memory bytecode_, address sender_) internal view returns (address) {
    uint256 nextNonce = nonceByUsers[sender_] + 1;
    bytes32 salt = keccak256(abi.encodePacked(sender_, nextNonce));
    bytes32 bytecodeHash = keccak256(bytecode_);
    return Create2.computeAddress(salt, bytecodeHash);
  }

  /**
   * @dev create will
   * @param willBytecode_  will byte code

   * @param sender_ sender
   * @return willId
   * @return willAddress

   */
  function _createWill(bytes memory willBytecode_, address sender_) internal returns (uint256, address) {
    _willId += 1;
    nonceByUsers[sender_] += 1;
    bytes32 salt = keccak256(abi.encodePacked(sender_, nonceByUsers[sender_]));
    address willAddress = Create2.deploy(0, salt, willBytecode_);
    willAddresses[_willId] = willAddress;
    isCreateWill[sender_] = true;

    return (_willId, willAddress);
  }

  /**
   * @dev Check whether will existed
   * @param willId_  will id
   */
  function _checkWillExisted(uint256 willId_) internal view returns (address willAddress) {
    willAddress = willAddresses[willId_];
    if (willAddress == address(0)) revert WillNotFound();
  }

  function _isCreateWill(address sender_) internal view returns (bool) {
    return isCreateWill[sender_];
  }
}
