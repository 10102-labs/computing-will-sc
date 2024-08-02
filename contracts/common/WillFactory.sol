// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/Create2.sol";

contract WillFactory {
  /* Error */
  error WillNotFound();
  error GuardNotFound();

  /* State variable */
  uint256 public willId;
  mapping(uint256 => address) public willAddresses;
  mapping(uint256 => address) public guardAddresses;
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
   * @dev create will and guard
   * @param willBytecode_  will byte code
   * @param guardByteCode_ guard byte code
   * @param sender_ sender
   * @return willId
   * @return willAddress
   * @return guardAddress
   */
  function _createWill(bytes memory willBytecode_, bytes memory guardByteCode_, address sender_) internal returns (uint256, address, address) {
    willId += 1;
    nonceByUsers[sender_] += 1;
    bytes32 salt = keccak256(abi.encodePacked(sender_, nonceByUsers[sender_]));
    address willAddress = Create2.deploy(0, salt, willBytecode_);
    address guardAddress = Create2.deploy(0, salt, guardByteCode_);
    willAddresses[willId] = willAddress;
    guardAddresses[willId] = guardAddress;
    return (willId, willAddress, guardAddress);
  }

  /**
   * @dev Check whether will existed
   * @param willId_  will id
   */
  function _checkWillExisted(uint256 willId_) internal view returns (address willAddress) {
    willAddress = willAddresses[willId_];
    if (willAddress == address(0)) revert WillNotFound();
  }

  /**
   * @dev Check whether guard existed
   * @param willId_ will id
   */
  function _checkGuardExisted(uint256 willId_) internal view returns (address guardAddress) {
    guardAddress = guardAddresses[willId_];
    if (guardAddress == address(0)) revert WillNotFound();
  }
}
