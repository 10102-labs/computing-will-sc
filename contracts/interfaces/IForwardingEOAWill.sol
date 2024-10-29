//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ForwardingWillStruct} from "../libraries/ForwardingWillStruct.sol";

interface IForwardingEOAWill {
  function initialize(
    uint256 willId_,
    address owner_,
    ForwardingWillStruct.Distribution[] calldata distributions_,
    ForwardingWillStruct.WillExtraConfig calldata config_
  ) external returns (uint256 numberOfBeneficiaries);

  function setActivationTrigger(address sender_, uint128 lackOfOutgoingTxRange_) external;

  function setWillDistributions(
    address sender_,
    ForwardingWillStruct.Distribution[] calldata distributions_
  ) external returns (uint256 numberOfBeneficiaries);
  function activeAlive(address sender_) external;
  function activeWill(address[] calldata assets_, bool isETH_) external returns (address[] memory assets);
  function deleteWill(address sender_) external;
  function withdraw(address sender_, uint256 amount_) external;
  function checkActiveWill() external view returns (bool);
}
