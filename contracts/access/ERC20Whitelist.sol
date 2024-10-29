// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v5.x
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Whitelist is Ownable {
  mapping(address => bool) private _whitelist;

  constructor() Ownable(_msgSender()) {}

  function updateWhitelist(address[] calldata erc20Addresses_, bool isAccepted_) external onlyOwner {
    for (uint256 i = 0; i < erc20Addresses_.length; ) {
      _whitelist[erc20Addresses_[i]] = isAccepted_;
      unchecked {
        ++i;
      }
    }
  }

  function isAcceptedERC20(address erc20Address_) external view returns (bool) {
    return _whitelist[erc20Address_];
  }
}
