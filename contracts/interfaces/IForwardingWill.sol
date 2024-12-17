//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ForwardingWillStruct} from "../libraries/ForwardingWillStruct.sol";

interface IForwardingWill {
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

  function activeWill(address guardAddress_, address[] calldata assets_, bool isETH_) external;

  function checkActiveWill(address guardAddress_) external view returns (bool);
}
