// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.16;

import "./CommandBuilder.sol";

abstract contract VM {
    using CommandBuilder for bytes[];

    uint256 constant FLAG_CT_DELEGATECALL = 0x00; // Delegate call not currently supported
    uint256 constant FLAG_CT_CALL = 0x01;
    uint256 constant FLAG_CT_STATICCALL = 0x02;
    uint256 constant FLAG_CT_VALUECALL = 0x03;
    uint256 constant FLAG_CT_MASK = 0x03;
    uint256 constant FLAG_DATA = 0x20;
    uint256 constant FLAG_EXTENDED_COMMAND = 0x40;
    uint256 constant FLAG_TUPLE_RETURN = 0x80;

    uint256 constant SHORT_COMMAND_FILL =
        0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    error ExecutionFailed(
        uint256 command_index,
        address target,
        string message
    );

    function _execute(
        bytes32[] calldata commands,
        bytes[] memory state
    ) internal returns (bytes[] memory) {
        bytes32 command;
        uint256 flags;
        bytes32 indices;

        bool success;
        bytes memory outData;

        uint256 commandsLength = commands.length;
        uint256 indicesLength;
        for (uint256 i; i < commandsLength; i = _uncheckedIncrement(i)) {
            command = commands[i];
            flags = uint256(uint8(bytes1(command << 32)));

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                i = _uncheckedIncrement(i);
                indices = commands[i];
                indicesLength = 32;
            } else {
                indices = bytes32(uint256(command << 40) | SHORT_COMMAND_FILL);
                indicesLength = 6;
            }

            if (flags & FLAG_CT_MASK == FLAG_CT_CALL) {
                (success, outData) = address(uint160(uint256(command))).call(
                    flags & FLAG_DATA == 0
                        ? state.buildInputs(
                            bytes4(command),
                            indices,
                            indicesLength
                        )
                        : state[
                            uint8(bytes1(indices)) &
                                CommandBuilder.IDX_VALUE_MASK
                        ]
                );
            } else if (flags & FLAG_CT_MASK == FLAG_CT_STATICCALL) {
                (success, outData) = address(uint160(uint256(command)))
                    .staticcall(
                        flags & FLAG_DATA == 0
                            ? state.buildInputs(
                                bytes4(command),
                                indices,
                                indicesLength
                            )
                            : state[
                                uint8(bytes1(indices)) &
                                    CommandBuilder.IDX_VALUE_MASK
                            ]
                    );
            } else if (flags & FLAG_CT_MASK == FLAG_CT_VALUECALL) {
                bytes memory v = state[
                    uint8(bytes1(indices)) & CommandBuilder.IDX_VALUE_MASK
                ];
                require(v.length == 32, "Value must be 32 bytes");
                uint256 callEth = uint256(bytes32(v));
                (success, outData) = address(uint160(uint256(command))).call{
                    value: callEth
                }(
                    flags & FLAG_DATA == 0
                        ? state.buildInputs(
                            bytes4(command),
                            indices << 8,
                            indicesLength - 1
                        )
                        : state[
                            uint8(bytes1(indices << 8)) &
                                CommandBuilder.IDX_VALUE_MASK
                        ]
                );
            } else {
                revert("Invalid calltype");
            }

            if (!success) {
                string memory message = "Unknown";
                if (outData.length > 68) {
                    uint256 estimatedLength = _estimateBytesLength(outData, 68);
                    assembly {
                        outData := add(outData, 4)
                    }
                    uint256 pointer = uint256(bytes32(outData));
                    if (pointer == 32) {
                        assembly {
                            outData := add(outData, 32)
                        }
                        uint256 size = uint256(bytes32(outData));
                        if (size == estimatedLength) {
                            assembly {
                                outData := add(outData, 32)
                            }
                            message = string(outData);
                        }
                    }
                }
                revert ExecutionFailed({
                    command_index: flags & FLAG_EXTENDED_COMMAND == 0
                        ? i
                        : i - 1,
                    target: address(uint160(uint256(command))),
                    message: message
                });
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 88), outData);
            } else {
                state = state.writeOutputs(bytes1(command << 88), outData);
            }
        }
        return state;
    }

    function _estimateBytesLength(
        bytes memory data,
        uint256 pos
    ) internal pure returns (uint256 estimate) {
        uint256 length = data.length;
        estimate = length - pos;
        for (uint256 i = pos; i < length; ) {
            if (data[i] == 0) {
                estimate = i - pos;
                break;
            }
            unchecked {
                ++i;
            }
        }
    }

    function _uncheckedIncrement(uint256 i) private pure returns (uint256) {
        unchecked {
            ++i;
        }
        return i;
    }
}
