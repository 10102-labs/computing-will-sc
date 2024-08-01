// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import {AccessGuard} from "../access/AccessGuard.sol";

contract WillRouter is AccessGuard {
  /* State variable */
  // guard storage slot in safe wallet
  bytes32 internal constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
  uint256 public beneficiaryLimit;

  /* Constructor */
  constructor(uint256 beneficiaryLimit_) {
    beneficiaryLimit = beneficiaryLimit_;
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /* Management function */
  /**
   * @dev Set beneficiaries limit
   * @param limit_  beneficiaryLimit
   */
  function setBeneficiaryLimit(uint256 limit_) external onlyAdmin {
    beneficiaryLimit = limit_;
  }

  /* Internal function */
  /**
   * @dev Check beneficiaries limit
   * @param numBeneficiaries_ number of beneficiaries
   */
  function _checkBeneficiaryLimit(uint256 numBeneficiaries_) internal view returns (bool) {
    if (beneficiaryLimit != 0 && numBeneficiaries_ > beneficiaryLimit) {
      return false;
    }
    return true;
  }
}
