// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

import {AbstractEnsoShortcuts} from "./AbstractEnsoShortcuts.sol";

/// @title EnsoShortcuts
/// @notice Executes shortcuts via commands, restricted to the router contract
contract EnsoShortcuts is AbstractEnsoShortcuts {
    /// @notice The router contract that is authorized to call this contract
    address public immutable router;

    /// @notice Thrown when a caller is not the authorized router
    error NotPermitted();

    /// @notice Thrown when router address is invalid
    error InvalidRouter();

    /// @notice Emitted when a shortcut is called
    event ShortcutCalled(
        bytes32 indexed accountId,
        bytes32 indexed requestId,
        address caller,
        uint256 value
    );

    /// @notice Emitted when ETH is withdrawn
    event EthWithdrawn(address indexed to, uint256 amount);

    /// @notice Initialize the shortcuts contract with the router address
    /// @param router_ The address of the router contract
    constructor(address router_) {
        if (router_ == address(0)) revert InvalidRouter();
        router = router_;
    }

    /// @notice Check if the caller is the authorized router
    /// @dev This function is called by executeShortcut before execution
    function _checkMsgSender() internal view override {
        if (msg.sender != router) revert NotPermitted();
    }

    /// @notice Execute a shortcut with additional logging
    /// @param accountId The account identifier
    /// @param requestId The request identifier for tracking
    /// @param commands Array of commands to execute
    /// @param state Initial state array
    /// @return response Updated state array after execution
    function executeShortcut(
        bytes32 accountId,
        bytes32 requestId,
        bytes32[] calldata commands,
        bytes[] calldata state
    ) public payable override returns (bytes[] memory response) {
        // Log the call with the value being sent
        emit ShortcutCalled(accountId, requestId, msg.sender, msg.value);

        // Execute the shortcut via parent implementation
        response = super.executeShortcut(accountId, requestId, commands, state);
    }

    /// @notice Receive function to accept ETH transfers
    receive() external payable override {}

    /// @notice Get the contract's ETH balance
    /// @return The ETH balance in wei
    function getEthBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Emergency withdraw ETH (router only)
    /// @param to The address to send ETH to
    /// @param amount The amount of ETH to withdraw
    function emergencyWithdrawEth(address payable to, uint256 amount) external {
        _checkMsgSender();
        require(address(this).balance >= amount, "Insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit EthWithdrawn(to, amount);
    }

    /// @notice Emergency withdraw ERC20 tokens (router only)
    /// @param token The token contract address
    /// @param to The address to send tokens to
    /// @param amount The amount of tokens to withdraw
    function emergencyWithdrawERC20(
        address token,
        address to,
        uint256 amount
    ) external {
        _checkMsgSender();

        // Using low-level call for maximum compatibility
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );

        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "ERC20 transfer failed"
        );
    }

    /// @notice ERC1155 token receiver function
    /// @dev Required for ERC1155Holder compatibility
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AbstractEnsoShortcuts) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
