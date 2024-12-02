//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import {ISafeWallet} from "./interfaces/ISafeWallet.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/libraries/Enum.sol";
import {ITransactionGuard} from "@safe-global/safe-smart-account/contracts/base/GuardManager.sol";

contract SafeGuard is ITransactionGuard {
  /*Error */
  error SafeGuardInitialized();

  /*State */
  uint256 public lastTimestampTxs;
  address public safeWallet;

  /*Modifier */
  modifier initialized() {
    if (lastTimestampTxs != 0) revert SafeGuardInitialized();
    _;
  }

  /* Function */
  /**
   * @dev initialize last timestamp transaction
   */
  function initialize(address _safeWallet) external initialized {
    lastTimestampTxs = block.timestamp;
    safeWallet = _safeWallet;
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
   * @param refundReceiver refundReceiver
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
  ) external {
    uint256 nonce = ISafeWallet(safeWallet).nonce();
    bytes32 dataHash = ISafeWallet(safeWallet).getTransactionHash(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce++
    );
    ISafeWallet(safeWallet).checkSignatures(dataHash, signatures);
    lastTimestampTxs = block.timestamp;
  }

  /**
   * @dev check after execution
   * @param hash safe transaction hash
   * @param success true is success false otherwise
   */
  function checkAfterExecution(bytes32 hash, bool success) external {}

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
