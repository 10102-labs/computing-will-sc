//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IERC20Whitelist {
  function isAcceptedERC20(address erc20Address_) external view returns (bool);
}
