// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

contract WillRouter {
  /* State variable */
  // guard storage slot in safe wallet
  bytes32 internal constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
  uint256 public constant BENEFICIARIES_LIMIT = 10;

  /* Internal function */
  /**
   * @dev Check beneficiaries limit
   * @param numBeneficiaries_ number of beneficiaries
   */
  function _checkNumBeneficiariesLimit(uint256 numBeneficiaries_) internal pure returns (bool) {
    if (numBeneficiaries_ == 0 || numBeneficiaries_ > BENEFICIARIES_LIMIT) {
      return false;
    }
    return true;
  }
}
