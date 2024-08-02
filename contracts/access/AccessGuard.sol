// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract AccessGuard is AccessControl {
  bytes32 public constant OPERATOR = keccak256("OPERATOR");

  modifier onlyAdmin() {
    _checkRole(DEFAULT_ADMIN_ROLE);
    _;
  }

  modifier onlyOperator() {
    _checkRole(OPERATOR);
    _;
  }

  function addOperator(address operator) external onlyAdmin {
    _grantRole(OPERATOR, operator);
  }

  function removeOperator(address operator) external onlyAdmin {
    _revokeRole(OPERATOR, operator);
  }
}
