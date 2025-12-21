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
    event ShortcutExecuted(bytes32 accountId, bytes32 requestId);
    function executeShortcut(
        bytes32 accountId,
        bytes32 requestId,
        bytes32[] calldata commands,
        bytes[] calldata state
    ) public payable virtual returns (bytes[] memory response) {
        _checkMsgSender();
        response = _execute(commands, state);
        emit ShortcutExecuted(accountId, requestId);
    }
    function _checkMsgSender() internal view virtual;

    receive() external payable virtual {}
}
