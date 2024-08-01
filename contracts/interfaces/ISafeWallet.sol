//SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import {Enum} from "../libraries/Enum.sol";

interface ISafeWallet {
  function execTransactionFromModule(address to, uint256 value, bytes memory data, Enum.Operation operation) external returns (bool success);
  function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
  function getOwners() external view returns (address[] memory);
  function getThreshold() external view returns (uint256);
  function isModuleEnabled(address module) external view returns (bool);
  function disableModule(address prevModule, address module) external;
  function setGuard(address guard) external;
}
