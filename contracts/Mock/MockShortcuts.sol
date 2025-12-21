// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

contract MockShortcuts {
    address public router;
    uint256 public callCount;

    event Executed(uint256 callCount, uint256 value);

    constructor(address _router) {
        router = _router;
    }

    // 接收以太币
    receive() external payable {}

    // 执行调用
    function execute() external payable returns (bytes memory) {
        callCount++;
        emit Executed(callCount, msg.value);
        return abi.encode(callCount, msg.value);
    }

    // 简单的回退函数，总是成功
    fallback() external payable {
        callCount++;
        emit Executed(callCount, msg.value);
        // 返回一些数据避免空返回
        bytes memory data = abi.encode(callCount, msg.value);
        assembly {
            return(add(data, 32), mload(data))
        }
    }
}
