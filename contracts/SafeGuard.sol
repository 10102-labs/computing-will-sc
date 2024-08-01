//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@safe-global/safe-smart-account/contracts/base/GuardManager.sol";
import {ISafeWallet} from "./interfaces/ISafeWallet.sol";

contract SafeGuard is ITransactionGuard {
  /*Error */
  error SafeGuardIntialized();

  /*State */
  uint256 public lastTimestampTxs;

  /*Modifier */
  modifier intialized() {
    if (lastTimestampTxs != 0) revert SafeGuardIntialized();
    _;
  }

  /* Function */
  /**
   * @dev initialize last timestamp transaction
   */
  function initialize() external intialized {
    lastTimestampTxs = block.timestamp;
  }

  /**
   * @dev check transaction
   * @param to  target address
   * @param value value
   * @param data data
   * @param operation call or delegateCall
   * @param safeTxGas safeTxGas
   * @param baseGas baseGas
   * @param gasPrice gasPrice
   * @param gasToken gasToken
   * @param refundReceiver refybdReceiver
   * @param signatures signatures
   * @param msgSender sender
   */
  function checkTransaction(
    address to,
    uint256 value,
    bytes memory data,
    Enum.Operation operation,
    uint256 safeTxGas,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address payable refundReceiver,
    bytes memory signatures,
    address msgSender
  ) external {}

  /**
   * @dev check after execution
   * @param hash safe transaction hash
   * @param success true is success false otherwise
   */
  function checkAfterExecution(bytes32 hash, bool success) external {
    if (success) {
      lastTimestampTxs = block.timestamp;
    }
  }

  /**
   * @dev support interface
   * @param interfaceId interface id
   */
  function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
    return type(ITransactionGuard).interfaceId == interfaceId;
  }
  /**
   * @dev get last timestamp transaction
   */
  function getLastTimestampTxs() external view returns (uint256) {
    return lastTimestampTxs;
  }
}
