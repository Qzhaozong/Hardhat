// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

import {VM} from "./VM.sol";
import {
    ERC721Holder
} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {
    ERC1155Holder
} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

abstract contract AbstractEnsoShortcuts is VM, ERC721Holder, ERC1155Holder {
    event ShortcutExecuted(
        bytes32 indexed accountId,
        bytes32 indexed requestId
    );

    error CallerNotAuthorized();

    /// @notice Execute a shortcut with given commands and state
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
    ) public payable virtual returns (bytes[] memory response) {
        _checkMsgSender();
        if (commands.length == 0) {
            // 如果commands为空，直接返回state
            response = state;
        } else {
            // 否则执行命令
            response = _execute(commands, state);
        }

        emit ShortcutExecuted(accountId, requestId);
        return response;
    }

    /// @notice Internal function to check if the caller is authorized
    /// @dev Must be implemented by derived contracts
    function _checkMsgSender() internal view virtual;

    /// @notice Receive function to accept ETH transfers
    receive() external payable virtual {}

    /// @notice ERC1155 token receiver function
    /// @dev Required for ERC1155Holder
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155Holder) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
