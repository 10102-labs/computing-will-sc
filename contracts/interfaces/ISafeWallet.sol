//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;
import {ISafe} from "@safe-global/safe-smart-account/contracts/interfaces/ISafe.sol";

interface ISafeWallet is ISafe {
  function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
}
