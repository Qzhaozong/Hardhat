// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

contract MockShortcuts {
    address public router;
    bool public shouldRevert;
    uint256 public callCount;

    constructor(address _router) {
        router = _router;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    receive() external payable {}

    function execute() external payable returns (bytes memory) {
        callCount++;

        if (shouldRevert) {
            revert("MockShortcuts: Execution failed");
        }

        return abi.encode(callCount);
    }

    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address receiver
    ) external returns (bytes memory) {
        callCount++;

        uint256 amountOut = (amountIn * 95) / 100;

        if (tokenOut == address(0)) {
            payable(receiver).transfer(amountOut);
        }

        return abi.encode(amountOut);
    }
}
