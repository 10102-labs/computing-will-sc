//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import {Enum} from "@safe-global/safe-smart-account/contracts/common/Enum.sol";

interface ISafeWallet {
  /**
   * @notice Reads `length` bytes of storage in the currents contract
   * @param offset - the offset in the current contract's storage in words to start reading from
   * @param length - the number of words (32 bytes) of data to read
   * @return the bytes that were read.
   */
  function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);

  //======================================== ISafe ================================================

  /**
   * @notice Sets an initial storage of the Safe contract.
   * @dev This method can only be called once.
   *      If a proxy was created without setting up, anyone can call setup and claim the proxy.
   * @param _owners List of Safe owners.
   * @param _threshold Number of required confirmations for a Safe transaction.
   * @param to Contract address for optional delegate call.
   * @param data Data payload for optional delegate call.
   * @param fallbackHandler Handler for fallback calls to this contract
   * @param paymentToken Token that should be used for the payment (0 is ETH)
   * @param payment Value that should be paid
   * @param paymentReceiver Address that should receive the payment (or 0 if tx.origin)
   */
  function setup(
    address[] calldata _owners,
    uint256 _threshold,
    address to,
    bytes calldata data,
    address fallbackHandler,
    address paymentToken,
    uint256 payment,
    address payable paymentReceiver
  ) external;

  /** @notice Executes a `operation` {0: Call, 1: DelegateCall}} transaction to `to` with `value` (Native Currency)
   *          and pays `gasPrice` * `gasLimit` in `gasToken` token to `refundReceiver`.
   * @dev The fees are always transferred, even if the user transaction fails.
   *      This method doesn't perform any sanity check of the transaction, such as:
   *      - if the contract at `to` address has code or not
   *      - if the `gasToken` is a contract or not
   *      It is the responsibility of the caller to perform such checks.
   * @param to Destination address of Safe transaction.
   * @param value Ether value of Safe transaction.
   * @param data Data payload of Safe transaction.
   * @param operation Operation type of Safe transaction.
   * @param safeTxGas Gas that should be used for the Safe transaction.
   * @param baseGas Gas costs that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
   * @param gasPrice Gas price that should be used for the payment calculation.
   * @param gasToken Token address (or 0 if ETH) that is used for the payment.
   * @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
   * @param signatures Signature data that should be verified.
   *                   Can be packed ECDSA signature ({bytes32 r}{bytes32 s}{uint8 v}), contract signature (EIP-1271) or approved hash.
   * @return success Boolean indicating transaction's success.
   */
  function execTransaction(
    address to,
    uint256 value,
    bytes calldata data,
    Enum.Operation operation,
    uint256 safeTxGas,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address payable refundReceiver,
    bytes memory signatures
  ) external payable returns (bool success);

  /**
   * @notice Checks whether the signature provided is valid for the provided data and hash. Reverts otherwise.
   * @param dataHash Hash of the data (could be either a message hash or transaction hash)
   * @param data That should be signed (this is passed to an external validator contract)
   * @param signatures Signature data that should be verified.
   *                   Can be packed ECDSA signature ({bytes32 r}{bytes32 s}{uint8 v}), contract signature (EIP-1271) or approved hash.
   */
  function checkSignatures(bytes32 dataHash, bytes memory data, bytes memory signatures) external view;

  /**
   * @notice Checks whether the signature provided is valid for the provided data and hash. Reverts otherwise.
   * @dev Since the EIP-1271 does an external call, be mindful of reentrancy attacks.
   * @param dataHash Hash of the data (could be either a message hash or transaction hash)
   * @param data That should be signed (this is passed to an external validator contract)
   * @param signatures Signature data that should be verified.
   *                   Can be packed ECDSA signature ({bytes32 r}{bytes32 s}{uint8 v}), contract signature (EIP-1271) or approved hash.
   * @param requiredSignatures Amount of required valid signatures.
   */
  function checkNSignatures(bytes32 dataHash, bytes memory data, bytes memory signatures, uint256 requiredSignatures) external view;

  /**
   * @notice Marks hash `hashToApprove` as approved.
   * @dev This can be used with a pre-approved hash transaction signature.
   *      IMPORTANT: The approved hash stays approved forever. There's no revocation mechanism, so it behaves similarly to ECDSA signatures
   * @param hashToApprove The hash to mark as approved for signatures that are verified by this contract.
   */
  function approveHash(bytes32 hashToApprove) external;

  /**
   * @dev Returns the domain separator for this contract, as defined in the EIP-712 standard.
   * @return bytes32 The domain separator hash.
   */
  function domainSeparator() external view returns (bytes32);

  /**
   * @notice Returns transaction hash to be signed by owners.
   * @param to Destination address.
   * @param value Ether value.
   * @param data Data payload.
   * @param operation Operation type.
   * @param safeTxGas Gas that should be used for the safe transaction.
   * @param baseGas Gas costs for data used to trigger the safe transaction.
   * @param gasPrice Maximum gas price that should be used for this transaction.
   * @param gasToken Token address (or 0 if ETH) that is used for the payment.
   * @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
   * @param _nonce Transaction nonce.
   * @return Transaction hash.
   */
  function getTransactionHash(
    address to,
    uint256 value,
    bytes calldata data,
    Enum.Operation operation,
    uint256 safeTxGas,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address refundReceiver,
    uint256 _nonce
  ) external view returns (bytes32);

  /**
   * @notice Returns the pre-image of the transaction hash (see getTransactionHash).
   * @param to Destination address.
   * @param value Ether value.
   * @param data Data payload.
   * @param operation Operation type.
   * @param safeTxGas Gas that should be used for the safe transaction.
   * @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
   * @param gasPrice Maximum gas price that should be used for this transaction.
   * @param gasToken Token address (or 0 if ETH) that is used for the payment.
   * @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
   * @param _nonce Transaction nonce.
   * @return Transaction hash bytes.
   */
  function encodeTransactionData(
    address to,
    uint256 value,
    bytes calldata data,
    Enum.Operation operation,
    uint256 safeTxGas,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address refundReceiver,
    uint256 _nonce
  ) external view returns (bytes memory);

  /**
   * External getter function for state variables.
   */

  /**
   * @notice Returns the version of the Safe contract.
   * @return Version string.
   */
  // solhint-disable-next-line
  function VERSION() external view returns (string memory);

  /**
   * @notice Returns the nonce of the Safe contract.
   * @return Nonce.
   */
  function nonce() external view returns (uint256);

  /**
   * @notice Returns a uint if the messageHash is signed by the owner.
   * @param messageHash Hash of message that should be checked.
   * @return Number denoting if an owner signed the hash.
   */
  function signedMessages(bytes32 messageHash) external view returns (uint256);

  /**
   * @notice Returns a uint if the messageHash is approved by the owner.
   * @param owner Owner address that should be checked.
   * @param messageHash Hash of message that should be checked.
   * @return Number denoting if an owner approved the hash.
   */
  function approvedHashes(address owner, bytes32 messageHash) external view returns (uint256);

  //======================================== IModuleManager =======================================

  /**
   * @notice Enables the module `module` for the Safe.
   * @dev This can only be done via a Safe transaction.
   * @param module Module to be whitelisted.
   */
  function enableModule(address module) external;

  /**
   * @notice Disables the module `module` for the Safe.
   * @dev This can only be done via a Safe transaction.
   * @param prevModule Previous module in the modules linked list.
   * @param module Module to be removed.
   */
  function disableModule(address prevModule, address module) external;

  /**
   * @notice Execute `operation` (0: Call, 1: DelegateCall) to `to` with `value` (Native Token)
   * @param to Destination address of module transaction.
   * @param value Ether value of module transaction.
   * @param data Data payload of module transaction.
   * @param operation Operation type of module transaction.
   * @return success Boolean flag indicating if the call succeeded.
   */
  function execTransactionFromModule(address to, uint256 value, bytes memory data, Enum.Operation operation) external returns (bool success);

  /**
   * @notice Execute `operation` (0: Call, 1: DelegateCall) to `to` with `value` (Native Token) and return data
   * @param to Destination address of module transaction.
   * @param value Ether value of module transaction.
   * @param data Data payload of module transaction.
   * @param operation Operation type of module transaction.
   * @return success Boolean flag indicating if the call succeeded.
   * @return returnData Data returned by the call.
   */
  function execTransactionFromModuleReturnData(
    address to,
    uint256 value,
    bytes memory data,
    Enum.Operation operation
  ) external returns (bool success, bytes memory returnData);

  /**
   * @notice Returns if a module is enabled
   * @return True if the module is enabled
   */
  function isModuleEnabled(address module) external view returns (bool);

  /**
   * @notice Returns an array of modules.
   *         If all entries fit into a single page, the next pointer will be 0x1.
   *         If another page is present, next will be the last element of the returned array.
   * @param start Start of the page. Has to be a module or start pointer (0x1 address)
   * @param pageSize Maximum number of modules that should be returned. Has to be > 0
   * @return array Array of modules.
   * @return next Start of the next page.
   */
  function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory array, address next);

  //======================================== IGuardManager ========================================

  /**
   * @dev Set a guard that checks transactions before execution
   *      This can only be done via a Safe transaction.
   *      ⚠️ IMPORTANT: Since a guard has full power to block Safe transaction execution,
   *        a broken guard can cause a denial of service for the Safe. Make sure to carefully
   *        audit the guard code and design recovery mechanisms.
   * @notice Set Transaction Guard `guard` for the Safe. Make sure you trust the guard.
   * @param guard The address of the guard to be used or the 0 address to disable the guard
   */
  function setGuard(address guard) external;

  //======================================== IOwnerManager ========================================

  /**
   * @notice Adds the owner `owner` to the Safe and updates the threshold to `_threshold`.
   * @dev This can only be done via a Safe transaction.
   * @param owner New owner address.
   * @param _threshold New threshold.
   */
  function addOwnerWithThreshold(address owner, uint256 _threshold) external;

  /**
   * @notice Removes the owner `owner` from the Safe and updates the threshold to `_threshold`.
   * @dev This can only be done via a Safe transaction.
   * @param prevOwner Owner that pointed to the owner to be removed in the linked list
   * @param owner Owner address to be removed.
   * @param _threshold New threshold.
   */
  function removeOwner(address prevOwner, address owner, uint256 _threshold) external;

  /**
   * @notice Replaces the owner `oldOwner` in the Safe with `newOwner`.
   * @dev This can only be done via a Safe transaction.
   * @param prevOwner Owner that pointed to the owner to be replaced in the linked list
   * @param oldOwner Owner address to be replaced.
   * @param newOwner New owner address.
   */
  function swapOwner(address prevOwner, address oldOwner, address newOwner) external;

  /**
   * @notice Changes the threshold of the Safe to `_threshold`.
   * @dev This can only be done via a Safe transaction.
   * @param _threshold New threshold.
   */
  function changeThreshold(uint256 _threshold) external;

  /**
   * @notice Returns the number of required confirmations for a Safe transaction aka the threshold.
   * @return Threshold number.
   */
  function getThreshold() external view returns (uint256);

  /**
   * @notice Returns if `owner` is an owner of the Safe.
   * @return Boolean if `owner` is an owner of the Safe.
   */
  function isOwner(address owner) external view returns (bool);

  /**
   * @notice Returns a list of Safe owners.
   * @return Array of Safe owners.
   */
  function getOwners() external view returns (address[] memory);

  //======================================== IFallbackManager =====================================

  /**
   * @notice Set Fallback Handler to `handler` for the Safe.
   * @dev Only fallback calls without value and with data will be forwarded.
   *      This can only be done via a Safe transaction.
   *      Cannot be set to the Safe itself.
   * @param handler contract to handle fallback calls.
   */
  function setFallbackHandler(address handler) external;
}
