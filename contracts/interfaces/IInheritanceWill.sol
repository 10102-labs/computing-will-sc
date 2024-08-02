//SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {InheritanceWillStruct} from "../libraries/InheritanceWillStruct.sol";

interface IInheritanceWill {
  function initialize(
    uint256 willId_,
    address owner_,
    address[] calldata beneficiaries_,
    InheritanceWillStruct.WillExtraConfig calldata config_
  ) external payable returns (uint256 numberOfBeneficiaries);

  function deleteWill(address sender_) external;

  function setWillBeneficiaries(
    address sender_,
    address[] calldata beneficiaries_,
    uint128 minRequiredSigs_
  ) external returns (uint256 numberOfBeneficiaries);

  function setWillAssets(address sender_, address[] calldata assets_) external;

  function setActivationTrigger(address sender_, uint128 lackOfOutgoingTxRange_) external;

  function activeWill(address sender_, address guardAddress_) external returns (address[] memory newSigners, uint256 newThreshold);

  function withdrawEth(address sender_, uint256 amount_) external;

  function checkActiveWill(address guardAddress_) external view returns (bool);
}
