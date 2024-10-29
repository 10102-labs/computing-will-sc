// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library ForwardingWillStruct {
  struct WillExtraConfig {
    uint128 lackOfOutgoingTxRange;
  }

  struct Distribution {
    address user;
    uint8 percent;
  }
}
