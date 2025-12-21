// SPDX-License-Identifier: GPL-3.0-only
// 指定许可证标识符，使用GNU通用公共许可证第3版

pragma solidity ^0.8.28;
// 指定Solidity编译器版本为0.8.28及以上，但不包括0.9.0及以上版本

// 导入依赖库和接口
import {EnsoShortcuts} from "./EnsoShortcuts.sol";
// 导入EnsoShortcuts合约，这是本合约要部署的子合约

import {
    SafeERC20,
    IERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// 从OpenZeppelin导入SafeERC20库和IERC20接口，提供安全的ERC20代币操作

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
// 导入ERC721接口，用于NFT代币标准

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
// 导入ERC1155接口，用于多代币标准

// 定义TokenType枚举，表示支持的代币类型
enum TokenType {
    Native, // 原生以太币
    ERC20, // ERC20代币
    ERC721, // ERC721代币（NFT）
    ERC1155 // ERC1155代币（多代币标准）
}

// 定义Token结构体，包含代币类型和数据
struct Token {
    TokenType tokenType; // 代币类型，来自上面的枚举
    bytes data; // 编码的代币数据，根据不同代币类型结构不同
}

// 主合约：EnsoRouter
contract EnsoRouter {
    using SafeERC20 for IERC20; // 为IERC20类型启用SafeERC20库的安全函数

    // 公共不可变变量，存储EnsoShortcuts合约地址
    address public immutable shortcuts;

    // 自定义错误定义，用于更高效的错误处理
    error WrongMsgValue(uint256 value, uint256 expectedAmount);
    // 错误：发送的以太币数量不正确

    error AmountTooLow(Token token, uint256 amount, uint256 minAmount);
    // 错误：输出代币数量低于最小要求

    error DuplicateNativeAsset();
    // 错误：重复的原生资产（以太币）

    error UnsupportedTokenType(TokenType tokenType);
    // 错误：不支持的代币类型

    // 构造函数，在合约部署时执行
    constructor() {
        // 部署一个新的EnsoShortcuts合约实例，并将当前合约地址作为参数传递
        shortcuts = address(new EnsoShortcuts(address(this)));
    }

    // 单一代币路由函数 - 处理单个输入代币的交易
    function routeSingle(
        Token calldata tokenIn, // 输入代币信息（calldata节省gas）
        bytes calldata data // 要执行的调用数据
    ) public payable returns (bytes memory response) {
        // 转移输入代币，返回是否为原生资产
        bool isNativeAsset = _transfer(tokenIn);

        // 如果不是原生资产但发送了以太币，报错
        if (!isNativeAsset && msg.value != 0)
            revert WrongMsgValue(msg.value, 0);

        // 执行数据调用
        response = _execute(data);
    }

    // 多代币路由函数 - 处理多个输入代币的交易
    function routeMulti(
        Token[] calldata tokensIn, // 输入代币数组
        bytes calldata data // 要执行的调用数据
    ) public payable returns (bytes memory response) {
        bool isNativeAsset; // 标记是否包含原生资产

        // 遍历所有输入代币
        for (uint256 i; i < tokensIn.length; ++i) {
            // 转移代币，如果返回true表示是原生资产
            if (_transfer(tokensIn[i])) {
                if (isNativeAsset) revert DuplicateNativeAsset(); // 不能有多个原生资产
                isNativeAsset = true;
            }
        }

        // 检查以太币发送是否正确
        if (!isNativeAsset && msg.value != 0)
            revert WrongMsgValue(msg.value, 0);

        // 执行数据调用
        response = _execute(data);
    }

    // 安全的单代币路由 - 包含输出验证
    function safeRouteSingle(
        Token calldata tokenIn, // 输入代币
        Token calldata tokenOut, // 输出代币（包含最小输出量）
        address receiver, // 接收者地址
        bytes calldata data // 要执行的调用数据
    ) external payable returns (bytes memory response) {
        // 获取接收者当前的代币余额作为基准
        uint256 balance = _balance(tokenOut, receiver);

        // 执行路由
        response = routeSingle(tokenIn, data);

        // 检查输出量是否满足最小要求
        _checkMinAmountOut(tokenOut, receiver, balance);
    }

    // 安全的多代币路由 - 包含输出验证
    function safeRouteMulti(
        Token[] calldata tokensIn, // 输入代币数组
        Token[] calldata tokensOut, // 输出代币数组
        address receiver, // 接收者地址
        bytes calldata data // 要执行的调用数据
    ) external payable returns (bytes memory response) {
        // 创建数组存储所有输出代币的当前余额
        uint256[] memory balances = new uint256[](tokensOut.length);

        // 遍历输出代币，记录当前余额
        for (uint256 i; i < tokensOut.length; ++i) {
            balances[i] = _balance(tokensOut[i], receiver);
        }

        // 执行路由
        response = routeMulti(tokensIn, data);

        // 遍历检查每个输出代币的数量
        for (uint256 i; i < tokensOut.length; ++i) {
            _checkMinAmountOut(tokensOut[i], receiver, balances[i]);
        }
    }

    // 内部执行函数 - 调用shortcuts合约
    function _execute(
        bytes calldata data
    ) internal returns (bytes memory response) {
        bool success; // 调用是否成功

        // 调用shortcuts合约，传递所有以太币和调用数据
        (success, response) = shortcuts.call{value: msg.value}(data);

        // 如果调用失败，回滚交易并传递错误信息
        if (!success) {
            assembly {
                // 内联汇编：从响应中提取错误信息并回滚
                // add(response, 32): 跳过头32字节（长度信息）
                // mload(response): 获取响应数据的长度
                revert(add(response, 32), mload(response))
            }
        }
    }

    // 内部代币转移函数
    function _transfer(
        Token calldata token
    ) internal returns (bool isNativeAsset) {
        TokenType tokenType = token.tokenType; // 获取代币类型

        // 根据代币类型处理不同的转移逻辑
        if (tokenType == TokenType.ERC20) {
            // 解码ERC20代币数据：代币合约地址和数量
            (IERC20 erc20, uint256 amount) = abi.decode(
                token.data,
                (IERC20, uint256)
            );
            // 使用SafeERC20安全地从发送者转移到shortcuts合约
            erc20.safeTransferFrom(msg.sender, shortcuts, amount);
        } else if (tokenType == TokenType.Native) {
            // 解码原生以太币数据：数量
            (uint256 amount) = abi.decode(token.data, (uint256));
            // 验证发送的以太币数量正确
            if (msg.value != amount) revert WrongMsgValue(msg.value, amount);
            isNativeAsset = true; // 标记为原生资产
        } else if (tokenType == TokenType.ERC721) {
            // 解码ERC721代币数据：NFT合约地址和代币ID
            (IERC721 erc721, uint256 tokenId) = abi.decode(
                token.data,
                (IERC721, uint256)
            );
            // 安全转移NFT
            erc721.safeTransferFrom(msg.sender, shortcuts, tokenId);
        } else if (tokenType == TokenType.ERC1155) {
            // 解码ERC1155代币数据：合约地址、代币ID和数量
            (IERC1155 erc1155, uint256 tokenId, uint256 amount) = abi.decode(
                token.data,
                (IERC1155, uint256, uint256)
            );
            // 安全转移ERC1155代币
            erc1155.safeTransferFrom(
                msg.sender,
                shortcuts,
                tokenId,
                amount,
                "0x" // 空数据
            );
        } else {
            // 不支持的代币类型
            revert UnsupportedTokenType(tokenType);
        }
    }

    // 内部余额查询函数
    function _balance(
        Token calldata token,
        address receiver
    ) internal view returns (uint256 balance) {
        TokenType tokenType = token.tokenType;

        // 根据代币类型查询余额
        if (tokenType == TokenType.ERC20) {
            (IERC20 erc20, ) = abi.decode(token.data, (IERC20, uint256));
            balance = erc20.balanceOf(receiver);
        } else if (tokenType == TokenType.Native) {
            balance = receiver.balance; // 以太币余额
        } else if (tokenType == TokenType.ERC721) {
            (IERC721 erc721, ) = abi.decode(token.data, (IERC721, uint256));
            balance = erc721.balanceOf(receiver); // NFT持有数量
        } else if (tokenType == TokenType.ERC1155) {
            (IERC1155 erc1155, uint256 tokenId, ) = abi.decode(
                token.data,
                (IERC1155, uint256, uint256)
            );
            balance = erc1155.balanceOf(receiver, tokenId); // 特定代币ID的余额
        } else {
            revert UnsupportedTokenType(tokenType);
        }
    }

    // 内部最小输出量检查函数
    function _checkMinAmountOut(
        Token calldata token,
        address receiver,
        uint256 prevBalance
    ) internal view {
        TokenType tokenType = token.tokenType;

        uint256 balance;
        uint256 minAmountOut;

        // 解码并获取当前余额及最小输出量
        if (tokenType == TokenType.ERC20) {
            IERC20 erc20;
            (erc20, minAmountOut) = abi.decode(token.data, (IERC20, uint256));
            balance = erc20.balanceOf(receiver);
        } else if (tokenType == TokenType.Native) {
            (minAmountOut) = abi.decode(token.data, (uint256));
            balance = receiver.balance;
        } else if (tokenType == TokenType.ERC721) {
            IERC721 erc721;
            (erc721, minAmountOut) = abi.decode(token.data, (IERC721, uint256));
            balance = erc721.balanceOf(receiver);
        } else if (tokenType == TokenType.ERC1155) {
            IERC1155 erc1155;
            uint256 tokenId;
            (erc1155, tokenId, minAmountOut) = abi.decode(
                token.data,
                (IERC1155, uint256, uint256)
            );
            balance = erc1155.balanceOf(receiver, tokenId);
        } else {
            revert UnsupportedTokenType(tokenType);
        }

        // 计算实际输出量（当前余额 - 之前余额）
        uint256 amountOut = balance - prevBalance;

        // 检查输出量是否满足最小要求
        if (amountOut < minAmountOut)
            revert AmountTooLow(token, amountOut, minAmountOut);
    }
}
