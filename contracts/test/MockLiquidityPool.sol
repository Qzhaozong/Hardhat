// 指定合约许可证为MIT（开源可商用，无版权限制）
// SPDX-License-Identifier: MIT
// 声明Solidity编译器版本：兼容0.8.19及以上的0.8.x版本（^表示兼容后续小版本）
pragma solidity ^0.8.19;

// 导入上级目录的SimpleTransfer.sol合约（用于关联代币逻辑，需确保路径正确）
import "../SimpleTransfer.sol";

// 定义模拟流动性池合约：MockLiquidityPool（仅用于测试，非生产环境可用）
contract MockLiquidityPool {
    // 公开状态变量：关联的AdvancedToken代币合约实例（AdvancedToken来自SimpleTransfer.sol）
    AdvancedToken public token;
    // 公开状态变量：流动性池中代币的余额（模拟代币储备）
    uint256 public tokenBalance;
    // 公开状态变量：流动性池中ETH的余额（模拟ETH储备，注：此处为模拟余额，非实际合约ETH余额）
    uint256 public ethBalance;

    // 定义交易事件：当用户完成代币/ETH交易时触发，方便前端监听和链上日志查询
    // indexed关键字：标记可索引字段，方便后续按该字段过滤事件（最多3个indexed字段）
    event Trade(
        address indexed trader, // 交易者地址（可索引）
        uint256 tokenAmount, // 交易的代币数量
        uint256 ethAmount, // 交易的ETH数量
        bool isBuy // 是否为买入操作（true=买入代币，false=卖出代币）
    );

    // 定义添加流动性事件：当流动性提供者添加代币+ETH储备时触发
    event LiquidityAdded(
        address indexed provider, // 流动性提供者地址（可索引）
        uint256 tokenAmount, // 添加的代币数量
        uint256 ethAmount // 添加的ETH数量
    );

    // 定义移除流动性事件：当流动性提供者移除代币+ETH储备时触发
    event LiquidityRemoved(
        address indexed provider, // 流动性提供者地址（可索引）
        uint256 tokenAmount, // 移除的代币数量
        uint256 ethAmount // 移除的ETH数量
    );

    // 自定义错误：流动性不足（相比require，自定义错误更省Gas，且语义更清晰）
    error InsufficientLiquidity();
    // 自定义错误：滑点过高（交易滑点超过设定的最大阈值时触发）
    error SlippageTooHigh();

    // 合约构造函数：部署合约时执行，用于初始化流动性池参数
    // 参数说明：
    // _token：关联的AdvancedToken代币合约地址
    // _initialTokenBalance：流动性池初始代币余额
    // _initialEthBalance：流动性池初始ETH余额
    constructor(
        address _token,
        uint256 _initialTokenBalance,
        uint256 _initialEthBalance
    ) {
        // 将传入的代币地址转为AdvancedToken合约实例，赋值给token状态变量
        token = AdvancedToken(_token);
        // 初始化流动性池代币余额
        tokenBalance = _initialTokenBalance;
        // 初始化流动性池ETH余额
        ethBalance = _initialEthBalance;
    }

    // ============ 交易功能（核心计算逻辑，模仿AMM恒定乘积公式） ============

    // 计算买入指定数量代币所需的ETH数量（恒定乘积公式：x*y=k）
    // 函数修饰符：public（外部可调用）、view（只读，不修改合约状态）
    function calculateEthRequired(
        uint256 tokenAmount // 要买入的代币数量
    ) public view returns (uint256) {
        // 返回值：所需ETH数量
        // 若代币余额或ETH余额为0，触发流动性不足错误
        if (tokenBalance == 0 || ethBalance == 0)
            revert InsufficientLiquidity();
        // 检查：要买入的代币数量必须小于池中的代币余额（确保有足够流动性）
        require(tokenAmount < tokenBalance, "Insufficient token liquidity");

        // 买入代币后，池中的代币余额会减少（新代币余额 = 原余额 - 买入数量）
        uint256 newTokenBalance = tokenBalance - tokenAmount;
        // 恒定乘积k值：原代币余额 * 原ETH余额（AMM核心，保证交易前后k值近似不变）
        uint256 k = tokenBalance * ethBalance;
        // 买入代币后，为保持k值不变，新的ETH余额 = k / 新代币余额
        uint256 newEthBalance = k / newTokenBalance;
        // 所需ETH数量 = 新ETH余额 - 原ETH余额（即需要向池中添加的ETH数量）
        return newEthBalance - ethBalance;
    }

    // 计算卖出指定数量代币可获得的ETH数量（恒定乘积公式：x*y=k）
    // 函数修饰符：public、view（只读不修改状态）
    function calculateEthReceived(
        uint256 tokenAmount // 要卖出的代币数量
    ) public view returns (uint256) {
        // 返回值：可获得的ETH数量
        // 若代币余额或ETH余额为0，触发流动性不足错误
        if (tokenBalance == 0 || ethBalance == 0)
            revert InsufficientLiquidity();

        // 卖出代币后，池中的代币余额会增加（新代币余额 = 原余额 + 卖出数量）
        uint256 newTokenBalance = tokenBalance + tokenAmount;
        // 恒定乘积k值：原代币余额 * 原ETH余额
        uint256 k = tokenBalance * ethBalance;
        // 卖出代币后，为保持k值不变，新的ETH余额 = k / 新代币余额
        uint256 newEthBalance = k / newTokenBalance;
        // 可获得的ETH数量 = 原ETH余额 - 新ETH余额（即从池中提取的ETH数量）
        uint256 ethReceived = ethBalance - newEthBalance;

        // 检查：可获得的ETH数量不能超过池中的ETH余额（确保有足够ETH流动性）
        require(ethReceived <= ethBalance, "Insufficient ETH liquidity");
        return ethReceived;
    }

    // 获取当前代币的ETH价格（1个代币 = 多少ETH，单位：wei）
    // 函数修饰符：public、view（只读不修改状态）
    function getCurrentPrice() public view returns (uint256) {
        // 若代币余额为0，返回0（无价格参考）
        if (tokenBalance == 0) return 0;
        // 价格计算公式：(ETH余额 * 1e18) / 代币余额
        // 乘以1e18是为了保证精度（避免小数截断，对应ERC20代币的18位小数）
        return (ethBalance * 1e18) / tokenBalance;
    }

    // ============ 模拟功能（仅用于测试，不涉及实际代币/ETH转账） ============

    // 模拟交易操作（买入/卖出代币，仅修改池内余额，无实际转账）
    // 函数修饰符：public（外部可调用）
    function simulateTrade(int256 tokenAmount, uint256 ethAmount) public {
        // int256类型支持正负值：正值=买入代币，负值=卖出代币
        if (tokenAmount > 0) {
            // 买入操作：将正值tokenAmount转为无符号整数uint256
            uint256 buyAmount = uint256(tokenAmount);
            // 检查：买入数量不能超过池中的代币余额
            require(buyAmount <= tokenBalance, "Insufficient token liquidity");
            // 模拟买入：池内代币余额减少（被交易者买入）
            tokenBalance -= buyAmount;
            // 模拟买入：池内ETH余额增加（交易者转入ETH）
            ethBalance += ethAmount;
            // 触发Trade事件，记录买入交易
            emit Trade(msg.sender, buyAmount, ethAmount, true);
        } else if (tokenAmount < 0) {
            // 卖出操作：将负值tokenAmount转为正的无符号整数uint256
            uint256 sellAmount = uint256(-tokenAmount);
            // 检查：要提取的ETH数量不能超过池中的ETH余额
            require(ethAmount <= ethBalance, "Insufficient ETH liquidity");
            // 模拟卖出：池内代币余额增加（交易者卖出代币）
            tokenBalance += sellAmount;
            // 模拟卖出：池内ETH余额减少（交易者提取ETH）
            ethBalance -= ethAmount;
            // 触发Trade事件，记录卖出交易
            emit Trade(msg.sender, sellAmount, ethAmount, false);
        }
        // 若tokenAmount=0，不执行任何操作
    }

    // 模拟提取流动性（仅减少池内代币余额，无实际转账，用于测试）
    // 函数修饰符：public（外部可调用）
    function simulateWithdrawLiquidity(uint256 tokenAmount) public {
        // 检查：提取的代币数量不能超过池中的代币余额
        require(tokenAmount <= tokenBalance, "Insufficient liquidity");
        // 模拟提取：池内代币余额减少
        tokenBalance -= tokenAmount;
    }

    // 执行带滑点检查的交易（核心测试函数，防止交易因价格波动导致损失）
    // 参数说明：
    // tokenAmount：交易代币数量（正值=买入，负值=卖出）
    // ethAmount：交易ETH数量
    // maxSlippage：最大允许滑点（基数10000，如300=3%）
    function executeTradeWithSlippageCheck(
        int256 tokenAmount,
        uint256 ethAmount,
        uint256 maxSlippageBps // 最大允许滑点，单位：基点（1/10000）
    ) external {
        if (tokenAmount > 0) {
            // 买入操作
            uint256 absTokenAmount = uint256(tokenAmount);
            require(
                absTokenAmount <= tokenBalance,
                "Insufficient token liquidity"
            );

            // 计算理论所需ETH
            uint256 expectedEth = calculateEthRequired(absTokenAmount);

            // 计算滑点（基于价格变化）
            // 1. 计算交易前的价格
            uint256 priceBefore = (ethBalance * 1e18) / tokenBalance;

            // 2. 计算交易后的理论价格
            uint256 newTokenBalance = tokenBalance - absTokenAmount;
            uint256 newEthBalance = ethBalance + expectedEth;
            uint256 priceAfter = (newEthBalance * 1e18) / newTokenBalance;

            // 3. 计算价格变化百分比（滑点）
            uint256 slippage;
            if (priceAfter > priceBefore) {
                // 价格上涨，买入推高价格
                slippage = ((priceAfter - priceBefore) * 10000) / priceBefore;
            } else {
                // 价格下跌（理论上不会发生，除非计算错误）
                slippage = 0;
            }

            // console.log("滑点检查:");
            // console.log("  价格前:", priceBefore);
            // console.log("  价格后:", priceAfter);
            // console.log("  滑点(bps):", slippage);
            // console.log("  最大允许滑点(bps):", maxSlippageBps);

            // 检查滑点
            require(slippage <= maxSlippageBps, "Slippage too high");

            // 检查用户支付的ETH是否足够
            require(ethAmount >= expectedEth, "Insufficient ETH provided");

            // 执行交易
            tokenBalance -= absTokenAmount;
            ethBalance += ethAmount;

            emit Trade(msg.sender, absTokenAmount, ethAmount, true);
        } else if (tokenAmount < 0) {
            // 卖出操作
            uint256 absTokenAmount = uint256(-tokenAmount);
            uint256 expectedEth = calculateEthReceived(absTokenAmount);
            require(ethAmount <= ethBalance, "Insufficient ETH liquidity");

            // 计算滑点（卖出导致价格下跌）
            uint256 priceBefore = (ethBalance * 1e18) / tokenBalance;

            uint256 newTokenBalance = tokenBalance + absTokenAmount;
            uint256 newEthBalance = ethBalance - expectedEth;
            uint256 priceAfter = (newEthBalance * 1e18) / newTokenBalance;

            uint256 slippage;
            if (priceBefore > priceAfter) {
                // 价格下跌，卖出压价
                slippage = ((priceBefore - priceAfter) * 10000) / priceBefore;
            } else {
                slippage = 0;
            }

            require(slippage <= maxSlippageBps, "Slippage too high");
            require(ethAmount <= expectedEth, "Too much ETH requested");

            tokenBalance += absTokenAmount;
            ethBalance -= ethAmount;

            emit Trade(msg.sender, absTokenAmount, ethAmount, false);
        }
    }

    // ============ 视图函数（仅查询状态，不修改合约数据） ============

    // 查询池内ETH余额（与public状态变量ethBalance功能一致，兼容外部调用习惯）
    function getEthBalance() public view returns (uint256) {
        return ethBalance;
    }

    // 查询池内代币余额（与public状态变量tokenBalance功能一致，兼容外部调用习惯）
    function getTokenBalance() public view returns (uint256) {
        return tokenBalance;
    }

    // 查询池内代币和ETH的储备余额（一次性返回两个值，方便外部调用）
    function getReserves() public view returns (uint256, uint256) {
        return (tokenBalance, ethBalance);
    }

    // 计算考虑滑点后的买入代币所需最大ETH数量（用于前端预估最高成本）
    // 参数：tokenAmount=买入代币数量，maxSlippage=最大允许滑点
    function calculateEthRequiredWithSlippage(
        uint256 tokenAmount,
        uint256 maxSlippage
    ) public view returns (uint256) {
        // 先计算基础所需ETH数量（无滑点）
        uint256 baseEth = calculateEthRequired(tokenAmount);
        // 考虑滑点后的最大ETH数量 = 基础ETH * (10000 + 最大滑点) / 10000
        // 例如：基础ETH=100，滑点300（3%），则最大ETH=100*(10000+300)/10000=103
        return (baseEth * (10000 + maxSlippage)) / 10000;
    }

    // ============ 流动性管理（模拟添加/移除流动性，无实际转账） ============

    // 模拟添加流动性（向池内添加代币+ETH，仅更新余额）
    // 参数：tokenAmount=添加的代币数量，ethAmount=添加的ETH数量
    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) public {
        // 更新池内代币余额（增加）
        tokenBalance += tokenAmount;
        // 更新池内ETH余额（增加）
        ethBalance += ethAmount;
        // 触发LiquidityAdded事件，记录添加流动性操作
        emit LiquidityAdded(msg.sender, tokenAmount, ethAmount);
    }

    // 模拟移除流动性（从池内提取代币+ETH，仅更新余额）
    // 参数：tokenAmount=移除的代币数量，ethAmount=移除的ETH数量
    function removeLiquidity(uint256 tokenAmount, uint256 ethAmount) public {
        // 检查：移除的代币数量不超过池内代币余额
        require(tokenAmount <= tokenBalance, "Insufficient token liquidity");
        // 检查：移除的ETH数量不超过池内ETH余额
        require(ethAmount <= ethBalance, "Insufficient ETH liquidity");
        // 更新池内代币余额（减少）
        tokenBalance -= tokenAmount;
        // 更新池内ETH余额（减少）
        ethBalance -= ethAmount;
        // 触发LiquidityRemoved事件，记录移除流动性操作
        emit LiquidityRemoved(msg.sender, tokenAmount, ethAmount);
    }

    // 计算交易的价格影响（即交易导致的代币价格波动幅度，基数10000）
    // 参数：tokenAmount=交易代币数量，isBuy=是否为买入操作
    function calculatePriceImpact(
        uint256 tokenAmount,
        bool isBuy
    ) public view returns (uint256) {
        // 获取交易前的代币价格
        uint256 priceBefore = getCurrentPrice();
        // 若交易前价格为0，返回0（无价格影响参考）
        if (priceBefore == 0) return 0;

        // 声明局部变量：交易后的代币价格
        uint256 priceAfter;
        if (isBuy) {
            // 买入操作：计算交易后的价格
            // 1. 计算买入所需ETH数量
            uint256 ethRequired = calculateEthRequired(tokenAmount);
            // 2. 计算买入后的代币余额
            uint256 newTokenBalance = tokenBalance - tokenAmount;
            // 3. 计算买入后的ETH余额
            uint256 newEthBalance = ethBalance + ethRequired;
            // 4. 计算买入后的代币价格
            priceAfter = (newEthBalance * 1e18) / newTokenBalance;
        } else {
            // 卖出操作：计算交易后的价格
            // 1. 计算卖出可获得的ETH数量
            uint256 ethReceived = calculateEthReceived(tokenAmount);
            // 2. 计算卖出后的代币余额
            uint256 newTokenBalance = tokenBalance + tokenAmount;
            // 3. 计算卖出后的ETH余额
            uint256 newEthBalance = ethBalance - ethReceived;
            // 4. 计算卖出后的代币价格
            priceAfter = (newEthBalance * 1e18) / newTokenBalance;
        }

        // 计算价格影响幅度：|交易后价格 - 交易前价格| / 交易前价格 * 10000
        if (priceAfter >= priceBefore) {
            // 交易后价格 >= 交易前价格：价格上涨幅度
            return ((priceAfter - priceBefore) * 10000) / priceBefore;
        } else {
            // 交易后价格 < 交易前价格：价格下跌幅度
            return ((priceBefore - priceAfter) * 10000) / priceBefore;
        }
    }
}
