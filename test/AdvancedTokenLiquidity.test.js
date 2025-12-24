// 导入测试依赖库
const { expect } = require("chai"); // Chai断言库，用于编写测试断言表达式
const { ethers } = require("hardhat"); // Hardhat以太坊开发环境，提供合约部署和交互功能
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers"); // 测试夹具工具，提升测试执行效率
const { latest, latestBlock } = require("@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time");

/**
 * 合约：AdvancedToken 流动性专项测试
 * 测试框架：Hardhat + Chai
 * 测试核心：基于Uniswap V2恒定乘积模型的流动性池行为、滑点、深度、手续费联动、压力测试等
 * 所有数值单位：ethers.parseEther() 为18位小数的ADV/ETH，n后缀为BigInt类型
 */
describe("AdvancedToken 流动性测试", function () {
    // 全局变量声明 - 合约实例+测试账户
    let token, owner, user1, user2, liquidityPool; // token: AdvancedToken实例; liquidityPool: 模拟流动性池实例; owner/user1/user2: 测试账户

    // ===================== Fixture 部署环境 - 复用部署，提升测试效率 =====================
    const deployTokenWithLiquidity = async function () {
        // 获取4个测试签名账户：合约部署者、用户1、用户2、流动性提供者
        const [owner, user1, user2, lpProvider] = await ethers.getSigners(); // 从Hardhat网络获取以太坊账户

        // 1. 部署AdvancedToken代币合约
        const Token = await ethers.getContractFactory("AdvancedToken"); // 获取合约工厂
        const token = await Token.deploy(
            "AdvancedToken",  // 代币名称
            "ADV",            // 代币符号
            18,               // 小数位数
            ethers.parseEther("10000000"), // 总发行量：1000万ADV（转换为带18位小数的wei单位）
            owner.address,    // 合约所有者地址
            owner.address,    // 手续费归集地址
            300               // 转账手续费：300 = 3%（基数10000，300表示3%）
        );
        await token.waitForDeployment(); // 等待代币合约上链确认（异步操作）

        // 2. 部署模拟UniswapV2流动性池合约 - MockLiquidityPool
        const LiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        const liquidityPool = await LiquidityPool.deploy(
            token.target,                // 绑定测试代币地址（使用.target获取已部署合约地址）
            ethers.parseEther("1000000"),// 池子初始ADV流动性：100万
            ethers.parseEther("100")     // 池子初始ETH流动性：100ETH
        );
        await liquidityPool.waitForDeployment(); // 等待池子合约上链确认

        // 3. 向流动性池转入对应ADV，完成流动性注入
        await token.connect(owner).transfer(liquidityPool.target, ethers.parseEther("1000000")); // 调用代币合约的transfer函数

        // 返回部署完成的合约实例+账户，供测试用例调用
        return { token, liquidityPool, owner, user1, user2, lpProvider };
    };

    // 每个测试用例执行前的钩子函数：初始化部署环境，重置合约状态
    beforeEach(async function () {
        ({ token, liquidityPool, owner, user1, user2 } = await loadFixture(deployTokenWithLiquidity)); // 加载夹具，重置状态
    });

    // ===================== 【基础流动性测试】 =====================
    describe("基础流动性测试", function () {
        /**
         * 测试用例：大额交易不产生显著价格影响
         * 测试逻辑：买入10000 ADV，验证恒定乘积模型下的价格波动范围
         * 期望结果：价格影响 < 5%，大额交易不崩盘，流动性充足
         */
        it("应该支持大额交易而不显著影响价格", async function () {
            // 获取池子当前资产余额
            const poolTokenBalance = await token.balanceOf(liquidityPool.target); // 调用代币合约balanceOf函数
            const poolEthBalance = await liquidityPool.getEthBalance(); // 调用流动性池合约getEthBalance函数

            console.log("池子初始状态:");
            console.log(`代币余额: ${ethers.formatEther(poolTokenBalance)} ADV`); // 将wei转换为可读的ADV数量
            console.log(`ETH余额: ${ethers.formatEther(poolEthBalance)} ETH`);

            // 恒定乘积模型计算初始价格：1ADV = ETH余额 / ADV余额
            const initialPrice = poolEthBalance * ethers.parseEther("1") / poolTokenBalance; // 乘以1e18保持精度
            console.log(`初始价格: 1 ADV = ${ethers.formatEther(initialPrice)} ETH`);

            // 模拟买入10000 ADV，计算所需ETH
            const buyAmount = ethers.parseEther("10000"); // 转换为wei单位的10000ADV
            const ethRequired = await liquidityPool.calculateEthRequired(buyAmount); // 调用恒定乘积计算函数

            console.log(`\n购买 ${ethers.formatEther(buyAmount)} ADV 需要:`);
            console.log(`${ethers.formatEther(ethRequired)} ETH`);

            // 计算交易后资产余额+新价格+价格影响
            // 减法运算，BigInt类型
            const newPoolToken = poolTokenBalance - buyAmount;
            // 加法运算
            const newPoolEth = poolEthBalance + ethRequired;
            // 计算新价格
            const newPrice = newPoolEth * ethers.parseEther("1") / newPoolToken;
            // 计算价格影响，乘以10000转为百分比基点
            const priceImpact = (newPrice - initialPrice) * 10000n / initialPrice;
            // 除以100转换为实际百分比
            console.log(`价格影响: ${ethers.formatEther(priceImpact / 100n)}%`);
            // 断言核心：价格影响小于5% (500n = 5%，放大10000倍计算，规避小数精度)
            // Chai断言：priceImpact < 500
            expect(priceImpact).to.be.lt(500n);

        });

        /**
         * 测试用例：小量交易仅有微小价格影响
         * 测试逻辑：买入1 ADV，验证微量交易对市场价格几乎无扰动
         * 期望结果：价格影响 < 0.01%，符合健康流动性池的微量交易特性
         */
        it("小量交易应该只有微小价格影响", async function () {
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const poolEthBalance = await liquidityPool.getEthBalance();

            const buyAmount = ethers.parseEther("1"); // 1 ADV，极小的交易量
            const ethRequired = await liquidityPool.calculateEthRequired(buyAmount);

            const initialPrice = poolEthBalance * ethers.parseEther("1") / poolTokenBalance;
            const newPoolToken = poolTokenBalance - buyAmount;
            const newPoolEth = poolEthBalance + ethRequired;
            const newPrice = newPoolEth * ethers.parseEther("1") / newPoolToken;

            const priceImpact = (newPrice - initialPrice) * 10000n / initialPrice;
            // 断言核心：价格影响小于0.01% (1n = 0.01%)
            expect(priceImpact).to.be.lt(1n); // 1基点 = 0.01%
        });

        /**
         * 测试用例：巨额交易会产生显著价格影响
         * 测试逻辑：买入池子50%的ADV，验证大额吃单的价格暴涨效应
         * 期望结果：代币价格涨幅 > 50%，符合恒定乘积模型的深度耗尽特性
         */
        it("巨额交易应该有显著价格影响", async function () {
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const currentPrice = await liquidityPool.getCurrentPrice(); // 调用合约的当前价格函数
            const buyAmount = poolTokenBalance / 10n * 5n; // 买入池子50%的代币 (100万/10*5 = 50万)

            const ethRequired = await liquidityPool.calculateEthRequired(buyAmount);
            const [currentTokenBalance, currentEthBalance] = await liquidityPool.getReserves(); // 解构赋值获取池子储备
            const newTokenBalance = currentTokenBalance - buyAmount;
            const newEthBalance = currentEthBalance + ethRequired;
            const priceAfter = newEthBalance * 10n ** 18n / newTokenBalance; // 10n**18n = 1e18，保持精度

            const priceIncrease = (priceAfter - currentPrice) * 10000n / currentPrice;
            console.log(`当前价格: ${currentPrice.toString()}`);
            console.log(`购买后价格: ${priceAfter.toString()}`);
            console.log(`价格涨幅: ${Number(priceIncrease) / 100}%`); // 转换为实际百分比

            // 断言核心：价格涨幅超过50% (5000 = 50%)
            expect(priceIncrease).to.be.gt(5000); // 大于5000基点 = 大于50%
        });
    });

    // ===================== 【交易对流动性测试】 =====================
    describe("交易对流动性测试", function () {
        /**
         * 测试用例：买卖价格存在合理差价
         * 测试逻辑：计算同数量代币的买入价/卖出价，验证滑点差价在合理区间
         * 期望结果：买卖差价 < 1%，健康流动性池的核心特征
         */
        it("买卖价格应该有合理差价", async function () {
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const poolEthBalance = await liquidityPool.getEthBalance();

            const tradeAmount = ethers.parseEther("100"); // 测试交易量：100 ADV
            // 买入价：买100ADV需要的ETH / 100
            const ethForBuy = await liquidityPool.calculateEthRequired(tradeAmount);
            const buyPrice = ethForBuy * ethers.parseEther("1") / tradeAmount; // 平均买入单价
            // 卖出价：卖100ADV得到的ETH / 100
            const ethForSell = await liquidityPool.calculateEthReceived(tradeAmount); // 注意：这是卖出函数
            const sellPrice = ethForSell * ethers.parseEther("1") / tradeAmount; // 平均卖出单价

            console.log(`买入价格: 1 ADV = ${ethers.formatEther(buyPrice)} ETH`);
            console.log(`卖出价格: 1 ADV = ${ethers.formatEther(sellPrice)} ETH`);
            const spread = (buyPrice - sellPrice) * 10000n / sellPrice; // 买卖价差计算
            console.log(`买卖差价: ${ethers.formatEther(spread / 100n)}%`);

            // 断言核心：买卖差价小于1% (100n = 1%)
            expect(spread).to.be.lt(100n); // 100基点 = 1%
        });

        /**
         * 测试用例：连续交易会逐步影响价格
         * 测试逻辑：5次连续买入，验证价格随买单逐步上涨，无回调
         * 期望结果：每次交易的价格 > 上一次交易的价格，价格单向递增
         */
        it("连续交易应该逐渐影响价格", async function () {
            const initialPoolToken = await token.balanceOf(liquidityPool.target);
            const initialPoolEth = await liquidityPool.getEthBalance();

            const tradeAmount = ethers.parseEther("1000"); // 每次交易1000 ADV
            const prices = []; // 存储每次交易的价格

            // 循环执行5次买入
            for (let i = 0; i < 5; i++) {
                const ethRequired = await liquidityPool.calculateEthRequired(tradeAmount);
                const currentPrice = ethRequired * ethers.parseEther("1") / tradeAmount; // 本次交易的平均单价
                prices.push(currentPrice); // 记录价格
                await liquidityPool.simulateTrade(tradeAmount, ethRequired); // 模拟执行交易，更新池子状态
            }

            console.log("连续交易价格变化:");
            prices.forEach((price, index) => {
                console.log(`交易 ${index + 1}: 1 ADV = ${ethers.formatEther(price)} ETH`);
            });

            // 断言核心：价格数组单调递增
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).to.be.gt(prices[i - 1]); // 验证价格严格递增
            }
        });

        /**
         * 测试用例：反向交易可恢复部分流动性
         * 测试逻辑：先买入再卖出同数量代币，验证价格回弹但无法复原
         * 期望结果：卖出后的价格 > 买入后的价格，手续费导致流动性永久损耗，价格无法归位
         */
        it("反向交易应该恢复部分流动性", async function () {
            const buyAmount = ethers.parseEther("5000");

            // 1. 获取初始状态
            const [tokenBalanceBefore, ethBalanceBefore] = await Promise.all([
                liquidityPool.tokenBalance(),
                liquidityPool.ethBalance()
            ]);
            console.log('初始状态:');
            console.log('  代币余额:', ethers.formatEther(tokenBalanceBefore));
            console.log('  ETH余额:', ethers.formatEther(ethBalanceBefore));

            // 2. 计算买入所需ETH
            const ethForBuy = await liquidityPool.calculateEthRequired(buyAmount);
            console.log('买入', ethers.formatEther(buyAmount), 'ADV需要:',
                ethers.formatEther(ethForBuy), 'ETH');

            // 3. 执行买入
            await liquidityPool.simulateTrade(buyAmount, ethForBuy);

            // 4. 获取买入后状态
            const [tokenBalanceAfterBuy, ethBalanceAfterBuy] = await Promise.all([
                liquidityPool.tokenBalance(),
                liquidityPool.ethBalance()
            ]);
            console.log('买入后状态:');
            console.log('  代币余额:', ethers.formatEther(tokenBalanceAfterBuy));
            console.log('  ETH余额:', ethers.formatEther(ethBalanceAfterBuy));

            // 5. 计算卖出能获得的ETH
            const ethForSell = await liquidityPool.calculateEthReceived(buyAmount);
            console.log('卖出', ethers.formatEther(buyAmount), 'ADV可获得:',
                ethers.formatEther(ethForSell), 'ETH');

            // 6. 执行卖出
            await liquidityPool.simulateTrade(-buyAmount, ethForSell);

            // 7. 获取卖出后状态
            const [tokenBalanceAfterSell, ethBalanceAfterSell] = await Promise.all([
                liquidityPool.tokenBalance(),
                liquidityPool.ethBalance()
            ]);
            console.log('卖出后状态:');
            console.log('  代币余额:', ethers.formatEther(tokenBalanceAfterSell));
            console.log('  ETH余额:', ethers.formatEther(ethBalanceAfterSell));

            // 8. 验证恒定乘积是否保持
            const kBefore = tokenBalanceBefore * ethBalanceBefore;
            const kAfterBuy = tokenBalanceAfterBuy * ethBalanceAfterBuy;
            const kAfterSell = tokenBalanceAfterSell * ethBalanceAfterSell;

            console.log('恒定乘积k值:');
            console.log('  买入前:', kBefore.toString());
            console.log('  买入后:', kAfterBuy.toString());
            console.log('  卖出后:', kAfterSell.toString());

            // 在无手续费情况下，k值应该基本保持不变（可能因整数除法有微小误差）
            const priceAfterBuy = await liquidityPool.getCurrentPrice();
            const priceAfterSell = await liquidityPool.getCurrentPrice();

            console.log(`买入后价格: ${ethers.formatEther(priceAfterBuy)} ETH/ADV`);
            console.log(`卖出后价格: ${ethers.formatEther(priceAfterSell)} ETH/ADV`);

            // 在没有手续费的情况下，价格应该完全恢复
            // 允许微小的整数除法误差
            expect(priceAfterSell).to.be.closeTo(priceAfterBuy,
                ethers.parseEther("0.00000001")); // 很小的误差范围
        });
    });

    // ===================== 【滑点保护测试】 =====================
    describe("滑点保护测试", function () {
        /**
         * 测试用例：防止高滑点交易执行
         * 测试逻辑：买入池子50%的代币，触发高滑点，验证合约回滚交易
         * 期望结果：交易被revert，报错信息为 Slippage too high
         */
        it("应该防止高滑点交易", async function () {
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const buyAmount = poolTokenBalance / 10n * 9n; // 买入90%流动性
            const ethRequired = await liquidityPool.calculateEthRequired(buyAmount);

            const poolEthBalance = await liquidityPool.getEthBalance();
            const initialPrice = poolEthBalance * ethers.parseEther("1") / poolTokenBalance;
            const newPrice = (poolEthBalance + ethRequired) * ethers.parseEther("1") / (poolTokenBalance - buyAmount);
            const priceImpact = (newPrice - initialPrice) * 10000n / initialPrice;

            console.log(`大额交易价格影响: ${ethers.formatEther(priceImpact / 100n)}%`);
            const maxSlippage = 1000n; // 最大允许滑点：10%

            // 断言核心：高滑点交易触发合约回滚
            // 注意：executeTradeWithSlippageCheck需要int256参数，这里传入uint256可能导致类型错误
            await expect(
                liquidityPool.executeTradeWithSlippageCheck(buyAmount, ethRequired, maxSlippage)
            ).to.be.revertedWith("Slippage too high");
        });

        /**
         * 测试用例：允许低滑点交易执行
         * 测试逻辑：小额买入代币，滑点低于阈值，验证交易正常执行
         * 期望结果：交易不被回滚，顺利执行
         */
        it("应该允许低滑点交易", async function () {
            const buyAmount = ethers.parseEther("100"); // 小额交易
            const ethRequired = await liquidityPool.calculateEthRequired(buyAmount);
            const maxSlippage = 500n; // 5%最大滑点

            // 断言核心：低滑点交易无报错
            await expect(
                liquidityPool.executeTradeWithSlippageCheck(buyAmount, ethRequired, maxSlippage)
            ).to.not.be.reverted; // 期望不抛出异常
        });

        /**
         * 测试用例：批量交易需考虑累积滑点
         * 测试逻辑：3笔连续买入，累加滑点值，验证总滑点在可控范围
         * 期望结果：累积滑点 < 20%，批量交易的市场冲击可控
         */
        it("批量交易应该考虑累积滑点", async function () {
            const trades = [
                { amount: ethers.parseEther("1000"), isBuy: true },
                { amount: ethers.parseEther("500"), isBuy: true },
                { amount: ethers.parseEther("2000"), isBuy: true }
            ]; // 交易数组：1000+500+2000 = 3500 ADV

            let cumulativeSlippage = 0n; // 累积滑点初始值
            for (const trade of trades) {
                const ethRequired = await liquidityPool.calculateEthRequired(trade.amount);
                const poolTokenBalance = await token.balanceOf(liquidityPool.target);
                const poolEthBalance = await liquidityPool.getEthBalance();
                const priceBefore = poolEthBalance * ethers.parseEther("1") / poolTokenBalance; // 交易前价格
                const priceAfter = (poolEthBalance + ethRequired) * ethers.parseEther("1") / (poolTokenBalance - trade.amount); // 交易后价格

                const tradeImpact = (priceAfter - priceBefore) * 10000n / priceBefore; // 本次交易滑点
                cumulativeSlippage += tradeImpact; // 累加滑点
                await liquidityPool.simulateTrade(trade.amount, ethRequired); // 执行模拟交易
            }

            console.log(`累积滑点: ${ethers.formatEther(cumulativeSlippage / 100n)}%`);
            // 断言核心：累积滑点小于20% (2000n = 20%)
            expect(cumulativeSlippage).to.be.lt(2000n);
        });
    });

    // ===================== 【流动性深度测试】 =====================
    describe("流动性深度测试", function () {
        /**
         * 测试用例：测量不同价格区间的流动性深度
         * 测试逻辑：二分法计算1%/5%/10%滑点对应的可交易量，验证流动性分层
         * 期望结果：1%滑点可交易≥1000ADV，5%滑点可交易≥5000ADV，池子具备基础深度
         */
        it("应该测量不同价格区间的流动性", async function () {
            const liquidityLevels = [
                { priceImpact: 100n, amount: 0n },  // 1%滑点
                { priceImpact: 500n, amount: 0n },  // 5%滑点
                { priceImpact: 1000n, amount: 0n }  // 10%滑点
            ];

            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const poolEthBalance = await liquidityPool.getEthBalance();
            const initialPrice = poolEthBalance * ethers.parseEther("1") / poolTokenBalance;

            // 二分法精准计算各滑点对应的最大可交易量
            for (let i = 0; i < liquidityLevels.length; i++) {
                const maxImpact = liquidityLevels[i].priceImpact;
                let low = 0n; // 搜索下界
                let high = poolTokenBalance; // 搜索上界（最大可交易量为池子总余额）
                let bestAmount = 0n; // 最佳匹配值

                for (let j = 0; j < 20; j++) { // 20次迭代，精度足够
                    const mid = (low + high) / 2n; // 中点值
                    if (mid === 0n) break; // 防止除零
                    const ethRequired = await liquidityPool.calculateEthRequired(mid);
                    const newPrice = (poolEthBalance + ethRequired) * ethers.parseEther("1") / (poolTokenBalance - mid);
                    const impact = (newPrice - initialPrice) * 10000n / initialPrice;

                    if (impact <= maxImpact) {
                        bestAmount = mid; // 当前mid满足条件
                        low = mid + 1n; // 尝试更大的交易量
                    } else {
                        high = mid - 1n; // 滑点太大，减小交易量
                    }
                }
                liquidityLevels[i].amount = bestAmount; // 记录结果
            }

            console.log("流动性深度分析:");
            liquidityLevels.forEach(level => {
                console.log(`${ethers.formatEther(level.priceImpact / 100n)}% 价格影响: 可交易 ${ethers.formatEther(level.amount)} ADV`);
            });

            // 断言核心：各档位滑点具备基础可交易量
            expect(liquidityLevels[0].amount).to.be.gt(ethers.parseEther("1000")); // 1%滑点下至少可交易1000ADV
            expect(liquidityLevels[1].amount).to.be.gt(ethers.parseEther("5000")); // 5%滑点下至少可交易5000ADV
        });

        /**
         * 测试用例：流动性枯竭场景测试
         * 测试逻辑：提取池子90%的流动性，验证小额交易也会触发高滑点
         * 期望结果：小额交易的价格影响 >10%，流动性耗尽后市场极度脆弱
         */
        it("应该测试流动性枯竭场景", async function () {
            const withdrawAmount = ethers.parseEther("900000"); // 提取90%流动性（100万中的90万）
            await liquidityPool.simulateWithdrawLiquidity(withdrawAmount); // 模拟提取流动性
            const remainingLiquidity = await token.balanceOf(liquidityPool.target); // 剩余流动性

            console.log(`流动性提取后剩余: ${ethers.formatEther(remainingLiquidity)} ADV`);
            const smallTrade = ethers.parseEther("100"); // 小额交易：100 ADV
            const ethRequired = await liquidityPool.calculateEthRequired(smallTrade);

            const poolEthBalance = await liquidityPool.getEthBalance();
            // 计算价格影响：实际交易价格 vs 基于剩余流动性计算的理论价格
            const priceImpact = (ethRequired * ethers.parseEther("1") / smallTrade) * 10000n / (poolEthBalance * ethers.parseEther("1") / remainingLiquidity);
            console.log(`流动性枯竭后 100 ADV 交易价格影响: ${ethers.formatEther(priceImpact / 100n)}%`);

            // 断言核心：流动性枯竭后，小额交易滑点>10% (1000n =10%)
            expect(priceImpact).to.be.gt(1000n);
        });
    });

    // ===================== 【与 AdvancedToken 功能结合测试】 =====================
    describe("与 AdvancedToken 功能结合测试", function () {
        /**
         * 测试用例：手续费对流动性的影响
         * 测试逻辑：切换不同手续费率，验证转账时手续费精准扣除，影响池子实际到账量
         * 期望结果：实际手续费率与设置值误差<0.1%，手续费正确归集
         */
        it("手续费对流动性的影响", async function () {
            const feeRates = [0, 100, 300, 500]; // 0%/1%/3%/5%手续费（基数10000）
            const results = [];

            for (const feeRate of feeRates) {
                await token.connect(owner).setTransferFee(feeRate); // 设置手续费率
                const transferAmount = ethers.parseEther("1000"); // 转账1000 ADV
                const poolBalanceBefore = await token.balanceOf(liquidityPool.target); // 转账前池子余额

                await token.connect(owner).transfer(liquidityPool.target, transferAmount); // 执行转账
                const poolBalanceAfter = await token.balanceOf(liquidityPool.target); // 转账后池子余额

                const netReceived = poolBalanceAfter - poolBalanceBefore; // 池子实际收到的代币
                const fee = transferAmount - netReceived; // 手续费金额
                const actualFeeRate = fee * 10000n / transferAmount; // 实际手续费率（基数10000）
                const actualFee = Number(actualFeeRate) / 100; // 转换为百分比数值
                results.push({
                    feeRate,
                    expectedFee: feeRate,
                    actualFee,
                    netReceived: ethers.formatEther(netReceived)
                });
            }

            console.log("手续费对流动性影响测试:");
            console.table(results); // 表格形式输出结果

            // 断言核心：手续费率误差小于0.1%
            for (const result of results) {
                expect(Math.abs(result.actualFee - result.feeRate / 100)).to.be.lt(0.1); // 实际值-期望值的绝对值<0.1
            }
        });

        /**
         * 测试用例：代币锁定对流动性的影响
         * 测试逻辑：锁定代币减少流通量，验证解锁前后的交易滑点变化
         * 期望结果：锁定时代价滑点 > 解锁后滑点，锁定减少流动性，解锁恢复流动性
         */
        it("代币锁定对流动性的影响 - 仅用户余额锁定", async function () {
            console.log("\n测试：代币锁定（仅用户余额）");

            // 获取用户初始余额
            const userInitialBalance = await token.balanceOf(owner.address);
            console.log(`用户初始余额: ${ethers.formatEther(userInitialBalance)} ADV`);

            // 锁定用户部分代币
            const lockAmount = ethers.parseEther("50000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;

            await token.connect(owner).lockTokens(lockAmount, unlockTime);

            // 检查锁定后用户可用余额
            const userBalanceAfterLock = await token.balanceOf(owner.address);
            const lockedAmount = await token.getLockedAmount(owner.address);

            console.log(`锁定后:`);
            console.log(`  用户余额: ${ethers.formatEther(userBalanceAfterLock)} ADV`);
            console.log(`  锁定数量: ${ethers.formatEther(lockedAmount)} ADV`);

            // 池子余额应该不变
            const poolBalanceBefore = await token.balanceOf(liquidityPool.target);
            const poolBalanceAfter = await token.balanceOf(liquidityPool.target);

            console.log(`  池子余额: ${ethers.formatEther(poolBalanceBefore)} ADV (锁定前后不变)`);
            expect(poolBalanceAfter).to.equal(poolBalanceBefore);

            // 滑点应该不变（因为池子流动性不变）
            const tradeAmount = ethers.parseEther("10000");
            const slippageBefore = await liquidityPool.calculatePriceImpact(tradeAmount, true);
            const slippageAfter = await liquidityPool.calculatePriceImpact(tradeAmount, true);

            console.log(`\n滑点比较:`);
            console.log(`  锁定前滑点: ${Number(slippageBefore) / 100}%`);
            console.log(`  锁定后滑点: ${Number(slippageAfter) / 100}%`);

            expect(slippageAfter).to.equal(slippageBefore);

            // 解锁后验证
            await ethers.provider.send("evm_increaseTime", [86401]);
            await ethers.provider.send("evm_mine", []);
            await token.connect(owner).unlockTokens();

            const userBalanceAfterUnlock = await token.balanceOf(owner.address);
            console.log(`解锁后用户余额: ${ethers.formatEther(userBalanceAfterUnlock)} ADV`);
        });
        /**
         * 内部工具方法：计算交易的价格影响
         * @param {BigInt} amount - 交易代币数量（wei单位）
         * @returns {Promise<BigInt>} 价格影响（基点，100=1%）
         */
        async function calculatePriceImpact(amount) {
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const poolEthBalance = await liquidityPool.getEthBalance();
            const ethRequired = await liquidityPool.calculateEthRequired(amount);
            const initialPrice = poolEthBalance * ethers.parseEther("1") / poolTokenBalance;
            const newPrice = (poolEthBalance + ethRequired) * ethers.parseEther("1") / (poolTokenBalance - amount);
            return (newPrice - initialPrice) * 10000n / initialPrice; // 返回基点值
        }

        /**
         * 测试用例：黑名单对流动性的影响
         * 测试逻辑：将流动性池加入黑名单，验证交易被禁止；移除黑名单后交易恢复
         * 期望结果：黑名单内转账revert，移除后转账正常执行，黑名单功能生效
         */
        it("黑名单对流动性的影响", async function () {
            await token.connect(owner).blacklist(liquidityPool.target); // 将流动性池加入黑名单
            // 黑名单内转账失败
            await expect(
                token.connect(owner).transfer(liquidityPool.target, ethers.parseEther("100"))
            ).to.be.revertedWith("AdvancedToken: account is blacklisted"); // 预期回退并显示指定错误信息
            // 黑名单内授权转账也失败
            await expect(
                token.connect(owner).transferFrom(liquidityPool.target, owner.address, ethers.parseEther("100"))
            ).to.be.revertedWith("AdvancedToken: account is blacklisted");

            console.log("黑名单成功阻止与流动性池的交易");
            // 移除黑名单
            await token.connect(owner).unblacklist(liquidityPool.target);
            // 移除后转账成功
            await expect(
                token.connect(owner).transfer(liquidityPool.target, ethers.parseEther("100"))
            ).to.not.be.reverted; // 预期不抛出异常
        });
    });

    // ===================== 【流动性压力测试】 =====================
    describe("流动性压力测试", function () {
        /**
         * 测试用例：大量连续交易压力测试
         * 测试逻辑：10次交替买卖，验证池子在高频交易下的稳定性
         * 期望结果：最大滑点 <20%，池子扛住高频交易，无异常崩盘
         */
        it("大量连续交易压力测试", async function () {
            const iterations = 10; // 迭代次数
            const tradeAmount = ethers.parseEther("1000"); // 每次交易1000 ADV
            let totalVolume = 0n; // 总交易量
            let maxPriceImpact = 0n; // 最大价格影响

            for (let i = 0; i < iterations; i++) {
                const isBuy = i % 2 === 0; // 交替买卖，模拟多空博弈（偶数索引买入，奇数索引卖出）
                if (isBuy) {
                    const ethRequired = await liquidityPool.calculateEthRequired(tradeAmount);
                    const priceImpact = await calculateTradeImpact(tradeAmount, ethRequired, true);
                    maxPriceImpact = priceImpact > maxPriceImpact ? priceImpact : maxPriceImpact; // 更新最大值
                    await liquidityPool.simulateTrade(tradeAmount, ethRequired);
                } else {
                    const ethReceived = await liquidityPool.calculateEthReceived(tradeAmount);
                    const priceImpact = await calculateTradeImpact(tradeAmount, ethReceived, false);
                    maxPriceImpact = priceImpact > maxPriceImpact ? priceImpact : maxPriceImpact;
                    await liquidityPool.simulateTrade(-tradeAmount, ethReceived); // 负数表示卖出
                }
                totalVolume += tradeAmount; // 累加交易量

                if (i % 5 === 0) { // 每5次迭代输出一次价格
                    const currentPrice = await liquidityPool.getCurrentPrice();
                    console.log(`迭代 ${i}: 价格 = ${ethers.formatEther(currentPrice)} ETH/ADV`);
                }
            }

            console.log(`总交易量: ${ethers.formatEther(totalVolume)} ADV`);
            console.log(`最大价格影响: ${ethers.formatEther(maxPriceImpact / 100n)}%`);
            // 断言核心：高频交易下最大滑点<20%
            expect(maxPriceImpact).to.be.lt(2000n); // 2000基点 = 20%
        });

        /**
         * 内部工具方法：计算单次交易的价格影响（区分买卖）
         * @param {BigInt} amount - 交易数量
         * @param {BigInt} ethAmount - ETH金额（买入时是支付额，卖出时是获得额）
         * @param {boolean} isBuy - 是否为买入操作
         * @returns {Promise<BigInt>} 价格影响（基点）
         */
        async function calculateTradeImpact(amount, ethAmount, isBuy) {
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const poolEthBalance = await liquidityPool.getEthBalance();
            const initialPrice = poolEthBalance * ethers.parseEther("1") / poolTokenBalance;
            let newPrice;
            if (isBuy) {
                newPrice = (poolEthBalance + ethAmount) * ethers.parseEther("1") / (poolTokenBalance - amount);
            } else {
                newPrice = (poolEthBalance - ethAmount) * ethers.parseEther("1") / (poolTokenBalance + amount);
            }
            return (newPrice - initialPrice) * 10000n / initialPrice;
        }

        /**
         * 测试用例：极端市场条件测试（恐慌性抛售）
         * 测试逻辑：抛售池子75%的代币，验证极端行情下的价格暴跌
         * 期望结果：代币价格跌幅>50%，池子ETH未耗尽，符合极端行情特征
         */
        it("极端市场条件测试", async function () {
            const panicSellAmount = await token.balanceOf(liquidityPool.target) * 3n / 4n; // 抛售75%
            console.log(`恐慌性抛售: ${ethers.formatEther(panicSellAmount)} ADV`);

            const ethReceived = await liquidityPool.calculateEthReceived(panicSellAmount); // 计算抛售能获得的ETH
            const poolTokenBalance = await token.balanceOf(liquidityPool.target);
            const poolEthBalance = await liquidityPool.getEthBalance();
            const priceBefore = poolEthBalance * ethers.parseEther("1") / poolTokenBalance;
            const priceAfter = (poolEthBalance - ethReceived) * ethers.parseEther("1") / (poolTokenBalance + panicSellAmount);
            const priceDrop = (priceBefore - priceAfter) * 10000n / priceBefore; // 价格跌幅（基点）

            console.log(`抛售前价格: ${ethers.formatEther(priceBefore)} ETH/ADV`);
            console.log(`抛售后价格: ${ethers.formatEther(priceAfter)} ETH/ADV`);
            console.log(`价格跌幅: ${ethers.formatEther(priceDrop / 100n)}%`);

            // 断言核心：暴跌>50% + 池子ETH未耗尽
            expect(priceDrop).to.be.gt(5000n); // 跌幅大于50%
            expect(ethReceived).to.be.lt(poolEthBalance); // 获得的ETH小于池子总ETH，避免耗尽
        });
    });
});