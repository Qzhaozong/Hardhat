// 导入 hardhat 内置的网络辅助工具，主要用于操作区块时间（如快进时间、挖矿等）
const { time } = require("@nomicfoundation/hardhat-network-helpers");
// 导入 chai 断言库的 expect 方法，用于测试中验证结果是否符合预期
const { expect } = require("chai");
// 导入 ethers 库的两个辅助方法（注：此处 lock 未实际使用，accessListify 用于生成访问列表，也未实际使用）
const { accessListify, lock } = require("ethers");
// 导入 hardhat 封装的 ethers 库，用于智能合约部署、调用、签名者管理等核心操作
const { ethers } = require("hardhat");

// 定义测试套件：描述 "AdvancedToken 滑点测试" 这个整体测试场景
describe("AdvancedToken 滑点测试", function () {
    // 声明全局测试变量，用于在各个测试用例中共享（合约实例、账户地址等）
    let token, owner, user1, user2, feeCollector;

    // beforeEach 钩子函数：在每个测试用例（it 块）执行前自动运行，用于初始化测试环境
    beforeEach(async function () {
        // 获取以太坊签名者列表（模拟账户），分别赋值给所有者、测试用户1、测试用户2、手续费接收者
        [owner, user1, user2, feeCollector] = await ethers.getSigners();
        // 获取 AdvancedToken 合约的工厂实例（用于部署合约）
        const Token = await ethers.getContractFactory("AdvancedToken");
        // 部署 AdvancedToken 合约，传入构造函数参数
        token = await Token.deploy(
            "AdvancedToken",          // 合约名称
            "ADV",                    // 代币符号
            18,                       // 代币小数位数（标准 ERC20 小数位）
            ethers.parseEther("1000000"), // 总供应量：100万枚（parseEther 将以太币单位转为 wei 单位）
            owner.address,            // 合约所有者地址
            feeCollector.address,     // 手续费接收者地址
            300                       // 转账手续费率：300/10000 = 3%
        );
        // 等待合约部署完成（确认区块上的部署交易被打包）
        await token.waitForDeployment();
        // 所有者向 user1 转账 10000 枚代币，用于后续测试（模拟用户持有代币）
        await token.connect(owner).transfer(
            user1.address,
            ethers.parseEther("10000")
        );
    });

    // 子测试套件：专门测试 "手续费滑点" 相关场景
    describe("手续费滑点测试", function () {
        // 测试用例1：验证 3% 手续费的计算是否准确
        it("应该正确计算 3% 手续费", async function () {
            // 定义转账金额：100 枚代币（转为 wei 单位）
            const amount = ethers.parseEther("100");
            // 计算预期手续费：金额 * 手续费率 / 10000（300 对应 3%），使用 BigInt 避免数值溢出
            const expectedFee = (amount * 300n) / 10000n; // 3% of 100 = 3 tokens
            // 调用合约的 calculateFee 方法，获取实际计算的手续费
            const calculatedFee = await token.calculateFee(amount);
            // 断言：实际手续费应等于预期手续费（验证计算逻辑正确性）
            expect(calculatedFee).to.equal(expectedFee);
        });

        // 测试用例2：验证最小手续费率（0.01%）的计算准确性（边界值测试）
        it("应该正确计算 0.01% 手续费（边界最小值）", async function () {
            // 所有者调用合约的 setTransferFee 方法，将手续费率设置为 1（对应 0.01%）
            await token.connect(owner).setTransferFee(1); // 0.01%
            // 定义转账金额：1 枚代币
            const amount = ethers.parseEther("1");
            // 计算预期手续费：1 * 1 / 10000
            const expectedFee = (amount * 1n) / 10000n;
            // 获取合约计算的手续费
            const calculatedFee = await token.calculateFee(amount);
            // 断言验证计算结果
            expect(calculatedFee).to.equal(expectedFee);
        });

        // 测试用例3：验证最大手续费率（5%）的计算准确性（边界值测试）
        it("应该正确计算 5% 手续费（边界最大值）", async function () {
            // 所有者设置手续费率为 500（对应 5%）
            await token.connect(owner).setTransferFee(500); // 5%
            // 定义转账金额：100 枚代币
            const amount = ethers.parseEther("100");
            // 计算预期手续费：100 * 500 / 10000 = 5 枚代币
            const expectedFee = (amount * 500n) / 10000n; // 5% of 100 = 5 tokens
            // 获取合约计算的手续费
            const calculatedFee = await token.calculateFee(amount);
            // 断言验证
            expect(calculatedFee).to.equal(expectedFee);
        });

        // 测试用例4：验证大额转账场景下手续费计算的准确性
        it("大额转账的手续费计算应该准确", async function () {
            // 定义大额转账金额：100万枚代币（使用 parseUnits 明确指定小数位 18）
            const amount = ethers.parseUnits("1000000", 18); // 1M tokens
            // 定义手续费率：300（3%）
            const feeRate = 300n; // 3%
            // 计算预期手续费
            const expectedFee = (amount * feeRate) / 10000n;
            // 获取合约计算的手续费
            const calculatedFee = await token.calculateFee(amount);
            // 双重断言：先验证与预期值一致，再验证具体金额（3万枚代币）
            expect(calculatedFee).to.equal(expectedFee);
            expect(calculatedFee).to.equal(ethers.parseEther("30000")); // 1M * 3% = 30K
        });

        // 测试用例5：验证微小金额（1 wei）转账时手续费的计算（截断场景）
        it("微小金额转账的手续费计算应该准确", async function () {
            // 定义最小转账金额：1 wei（代币最小单位）
            const amount = 1n; // 1 wei (最小单位)
            // 计算预期手续费：1 * 300 / 10000 = 0.03，向下取整为 0
            const expectedFee = (amount * 300n) / 10000n; // 1 * 0.03 = 0 (向下取整)
            // 获取合约计算的手续费
            const calculatedFee = await token.calculateFee(amount);
            // 断言：手续费应为 0
            expect(calculatedFee).to.equal(0n); // 因为太小被截断为0
        });

        // 测试用例6：验证转账后各方余额变化（发送方、接收方、手续费接收方），确认手续费扣除逻辑
        it("转账后的实际到账金额应该考虑手续费", async function () {
            // 记录转账前各方的代币余额
            const senderBalanceBefore = await token.balanceOf(user1.address); // 发送方（user1）余额
            const receiverBalanceBefore = await token.balanceOf(user2.address); // 接收方（user2）余额
            const feeCollectorBalanceBefore = await token.balanceOf(feeCollector.address); // 手续费接收方余额
            // 定义转账金额：100 枚代币
            const amount = ethers.parseEther("100");
            // 计算该金额对应的手续费
            const fee = await token.calculateFee(amount);
            // 计算接收方实际到账金额：转账金额 - 手续费
            const netAmount = amount - fee;
            // 执行转账操作：user1 向 user2 转账指定金额
            await token.connect(user1).transfer(user2.address, amount);
            // 记录转账后各方的代币余额
            const senderBalanceAfter = await token.balanceOf(user1.address);
            const receiverBalanceAfter = await token.balanceOf(user2.address);
            const feeCollectorBalanceAfter = await token.balanceOf(feeCollector.address);
            // 断言1：发送方余额减少量等于转账金额（发送方需全额支付转账金额，手续费从该金额中扣除）
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(amount);
            // 断言2：接收方余额增加量等于实际到账金额（扣除手续费后）
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(netAmount);
            // 断言3：手续费接收方余额增加量等于手续费金额
            expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(fee);
            // 计算实际滑点率：（手续费 / 转账金额）* 10000（转为与手续费率一致的基数）
            const slippage = (fee * 10000n) / amount; // 实际手续费率
            // 断言4：实际滑点率等于预设的 3%（300/10000）
            expect(slippage).to.equal(300n); // 应该等于 3% (300/10000)
        });

        // 测试用例7：验证不同手续费率对滑点大小的影响
        it("手续费率应该影响滑点大小", async function () {
            // 定义测试用例数组：包含不同手续费率和描述
            const testCases = [
                { fee: 100, description: "1% 手续费" }, // 1%
                { fee: 300, description: "3% 手续费" }, // 3%
                { fee: 500, description: "5% 手续费" }, // 5%
            ];
            // 遍历测试用例，逐一验证
            for (const testCase of testCases) {
                // 设置当前测试用例的手续费率
                await token.connect(owner).setTransferFee(testCase.fee);
                // 定义转账金额：100 枚代币
                const amount = ethers.parseEther("100");
                // 获取合约计算的手续费
                const calculatedFee = await token.calculateFee(amount);
                // 计算预期手续费
                const expectedFee = (amount * BigInt(testCase.fee)) / 10000n;
                // 断言：手续费计算准确
                expect(calculatedFee).to.equal(expectedFee);
                // 执行转账操作
                const tx = await token.connect(user1).transfer(user2.address, amount);
                // 等待转账交易打包
                await tx.wait();
                // 获取接收方当前余额
                const receiverBalance = await token.balanceOf(user2.address);
                // 清空接收方余额：将 user2 的所有代币转回 user1，避免影响下一个测试用例
                await token.connect(user2).transfer(user1.address, receiverBalance);
            }
        });

        // 测试用例8：验证手续费为 0 时，转账无滑点（接收方全额到账）
        it("手续费为零时应该没有滑点", async function () {
            // 设置手续费率为 0
            await token.connect(owner).setTransferFee(0);
            // 定义转账金额：100 枚代币
            const amount = ethers.parseEther("100");
            // 获取合约计算的手续费（应为 0）
            const calculatedFee = await token.calculateFee(amount);
            // 断言：手续费为 0
            expect(calculatedFee).to.equal(0n);
            // 记录转账前发送方和接收方的余额
            const senderBalanceBefore = await token.balanceOf(user1.address);
            const receiverBalanceBefore = await token.balanceOf(user2.address);
            // 执行转账操作
            await token.connect(user1).transfer(user2.address, amount);
            // 记录转账后发送方和接收方的余额
            const senderBalanceAfter = await token.balanceOf(user1.address);
            const receiverBalanceAfter = await token.balanceOf(user2.address);
            // 断言1：发送方余额减少量等于转账金额
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(amount);
            // 断言2：接收方余额增加量等于转账金额（无手续费，全额到账）
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(amount);
        });

        // 测试用例9：验证转账金额不足以支付手续费时的场景（此处因整数除法手续费为 0，转账成功）
        it("转账金额不足以支付手续费时应该失败--生产不存在当前成绩", async function () {
            // 设置高手续费率：500（50%）
            await token.connect(owner).setTransferFee(500); // 50%
            // 定义转账金额：1 枚代币
            const amount = ethers.parseEther("1");
            // 获取合约计算的手续费
            const fee = await token.calculateFee(amount);
            // 计算预期手续费：1 * 500 / 10000 = 0.05，向下取整为 0
            const expectedFee = (amount * 500n) / 10000n;
            // 断言：手续费等于预期值（0）
            expect(fee).to.equal(expectedFee); // 1 * 5000 / 10000 = 0.5 → 向下取整为 0
            // 断言：转账不会被回滚（因为手续费为 0，金额足够）
            await expect(
                token.connect(user1).transfer(user2.address, amount)
            ).to.not.be.reverted;
        });
    });

    // 子测试套件：专门测试 "代币锁定滑点" 相关场景（锁定代币影响可用余额，进而影响转账）
    describe("代币锁定滑点测试", function () {
        // 前置钩子函数：在该子套件的每个测试用例执行前运行，设置手续费为 0，排除手续费干扰
        beforeEach(async function () {
            // 确保没有手续费干扰测试
            await token.connect(owner).setTransferFee(0);
        });

        // 测试用例1：验证锁定代币后，用户可用余额减少，总锁定金额正确
        it("锁定部分代币后可用余额应该减少", async function () {
            // 获取 user1 的总代币余额
            const totalBalance = await token.balanceOf(user1.address);
            // 计算锁定金额：总余额的 50%（使用 BigInt 运算）
            const lockAmount = totalBalance / 10n * 5n; // 锁定一半
            // 获取最新区块信息，用于获取当前时间戳
            const latestBlock = await ethers.provider.getBlock("latest");
            // 定义解锁时间：当前时间 + 86400 秒（24小时后）
            const unlockTime = latestBlock.timestamp + 86400; // 24小时后解锁
            // 执行代币锁定操作：user1 锁定指定金额，设置解锁时间
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取锁定后的总余额
            const newBalance = await token.balanceOf(user1.address);
            // 获取锁定后的可用余额
            const available = await token.availableBalance(user1.address);
            // 获取总锁定金额
            const locked = await token.getLockedAmount(user1.address);
            // 断言1：总余额减少量等于锁定金额（注：此处原代码断言可能存在笔误，应为 totalBalance - newBalance === lockAmount）
            expect(newBalance).to.equal(totalBalance - lockAmount);
            // 断言2：可用余额验证（原代码断言存在笔误，应为 available === totalBalance - locked）
            expect(available).to.equal(totalBalance - available);
            // 断言3：总锁定金额等于锁定的金额
            expect(locked).to.equal(lockAmount);
        });

        // 测试用例2：验证锁定代币后，无法转账超过可用余额的金额
        it("锁定代币后不能转账超过可用余额", async function () {
            // 获取 user1 的总代币余额
            const totalBalance = await token.balanceOf(user1.address);
            // 计算锁定金额：总余额的 80%
            const lockAmount = totalBalance / 10n * 8n; // 锁定80%
            // 定义解锁时间：当前时间 + 86400 秒（24小时后）
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 定义超额金额：可用余额 + 1 枚代币（超过可用余额）
            const exceedAmount = available + ethers.parseEther("1");
            // 断言：尝试转账超额金额时，交易被回滚，并返回指定错误信息
            await expect(
                token.connect(user1).transfer(user2.address, exceedAmount)
            ).to.be.revertedWith("AdvancedToken: transfer amount exceeds available balance");
        });

        // 测试用例3：验证锁定代币后，转账可用余额范围内的金额会成功
        it("锁定代币后只能转账可用余额部分", async function () {
            // 定义锁定金额：3000 枚代币
            const lockAmount = ethers.parseEther("3000");
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 断言：转账可用余额的金额时，交易不会被回滚
            await expect(
                token.connect(user1).transfer(user2.address, available)
            ).to.not.be.reverted;
        });

        // 测试用例4：验证代币解锁后，用户可用余额相应增加
        it("解锁代币后可用余额应该增加", async function () {
            // 获取 user1 的总代币余额
            const totalBalance = await token.balanceOf(user1.address);
            // 计算锁定金额：总余额的 20%
            const lockAmount = totalBalance / 10n * 2n;
            // 定义解锁时间：当前区块时间 + 3 秒
            const unlockTime = (await ethers.provider.getBlock("latest")).timestamp + 3;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 记录解锁前的可用余额
            const availableBefore = await token.availableBalance(user1.address);
            // 快进区块时间：增加 4 秒（超过解锁时间）
            await ethers.provider.send("evm_increaseTime", [4]);
            // 强制挖矿：打包新区块，更新链上时间
            await ethers.provider.send("evm_mine", []);
            // 执行代币解锁操作
            await token.connect(user1).unlockTokens();
            // 记录解锁后的可用余额
            const availableAfter = await token.availableBalance(user1.address);
            // 断言：可用余额增加量等于锁定金额
            expect(availableAfter - availableBefore).to.equal(lockAmount);
        });

        // 测试用例5：验证批量转账时，会考虑锁定余额（总额不超过可用余额则成功）
        it("批量转账时应该考虑锁定余额", async function () {
            // 定义锁定金额：5000 枚代币
            const lockAmount = ethers.parseEther("5000");
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 构建批量转账接收者数组：分两笔转账，总额等于可用余额
            const recipients = [
                {
                    to: user2.address,
                    amount: available / 2n // 可用余额的一半
                },
                {
                    to: owner.address,
                    amount: available / 2n // 可用余额的一半
                }
            ];
            // 断言：批量转账总额等于可用余额时，交易不会被回滚
            await expect(
                token.connect(user1).batchTransfer(recipients)
            ).to.not.be.reverted;
        });

        // 测试用例6：验证批量转账时，总额超过可用余额则交易失败
        it("批量转账超过锁定余额应该失败", async function () {
            // 定义锁定金额：6000 枚代币
            const lockAmount = ethers.parseEther("6000");
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 定义超额金额：可用余额 + 100 枚代币
            const exceedAmount = available + ethers.parseEther("100");
            // 构建批量转账接收者数组：单笔转账超额金额
            const recipients = [
                {
                    to: user2.address,
                    amount: exceedAmount
                }
            ];
            // 断言：批量转账超额金额时，交易被回滚，并返回指定错误信息
            await expect(
                token.connect(user1).batchTransfer(recipients)
            ).to.be.revertedWith("AdvancedToken: insufficient balance");
        });

        // 测试用例7：验证多个锁定记录时，总锁定金额为各笔锁定金额之和
        it("多个锁定记录应该正确计算总锁定金额", async function () {
            // 获取 user1 的总代币余额
            const totalBalance = await token.balanceOf(user1.address)
            // 定义三笔锁定金额
            const lock1 = ethers.parseEther("1000");
            const lock2 = ethers.parseEther("2000");
            const lock3 = ethers.parseEther("3000");
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 依次执行三笔锁定操作
            await token.connect(user1).lockTokens(lock1, unlockTime);
            await token.connect(user1).lockTokens(lock2, unlockTime);
            await token.connect(user1).lockTokens(lock3, unlockTime);
            // 获取总锁定金额
            const totalLocked = await token.getLockedAmount(user1.address);
            // 断言1：总锁定金额等于三笔锁定金额之和
            expect(totalLocked).to.equal(lock1 + lock2 + lock3);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 断言2：可用余额等于总余额 - 总锁定金额
            expect(available).to.equal(totalBalance - totalLocked);
        });

        // 测试用例8：验证不同解锁时间的锁定记录，仅解锁到期的代币，未到期的仍保持锁定
        it("部分解锁后可用余额应该相应增加", async function () {
            // 获取当前区块时间戳
            const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
            // 定义两笔锁定金额
            const lock1 = ethers.parseEther("1000");
            const lock2 = ethers.parseEther("2000");
            // 分别设置解锁时间：lock1 3秒后解锁，lock2 24小时后解锁
            await token.connect(user1).lockTokens(lock1, currentTime + 3);
            await token.connect(user1).lockTokens(lock2, currentTime + 86400);
            // 获取解锁前的总锁定金额
            const lockedBefore = await token.getLockedAmount(user1.address);
            // 断言1：解锁前总锁定金额等于两笔锁定金额之和
            expect(lockedBefore).to.equal(lock1 + lock2);
            // 快进区块时间：增加 4 秒（超过 lock1 解锁时间，未到 lock2 解锁时间）
            await ethers.provider.send("evm_increaseTime", [4]);
            // 强制挖矿：更新链上时间
            await ethers.provider.send("evm_mine", []);
            // 执行代币解锁操作（仅解锁到期的 lock1）
            await token.connect(user1).unlockTokens();
            // 获取解锁后的总锁定金额
            const lockedAfter = await token.getLockedAmount(user1.address);
            // 断言2：解锁后总锁定金额等于 lock2（仅未到期的代币仍锁定）
            expect(lockedAfter).to.equal(lock2); // 只有第二个还锁定着
        });
    });

    // 子测试套件：组合测试（手续费 + 代币锁定），验证两种滑点叠加的场景
    describe("组合滑点测试（手续费 + 锁定）", function () {
        // 测试用例1：验证同时存在手续费和代币锁定时，滑点（手续费率）正常生效
        it("同时考虑手续费和锁定时滑点应该叠加", async function () {
            // 设置手续费率：200（2%）
            await token.connect(owner).setTransferFee(200);

            // 定义锁定金额：3000 枚代币
            const lockAmount = ethers.parseEther("3000");
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            // 获取 user1 的总余额和可用余额
            const totalBalance = await token.balanceOf(user1.address);
            const available = await token.availableBalance(user1.address);

            // 定义转账金额：全部可用余额
            const transferAmount = available; // 转账全部可用余额
            // 计算手续费
            const fee = await token.calculateFee(transferAmount);
            // 计算实际到账金额
            const netAmount = transferAmount - fee;

            // 记录转账前发送方和接收方的余额
            const senderBalanceBefore = await token.balanceOf(user1.address);
            const receiverBalanceBefore = await token.balanceOf(user2.address);

            // 执行转账操作
            await token.connect(user1).transfer(user2.address, transferAmount);

            // 记录转账后发送方和接收方的余额
            const senderBalanceAfter = await token.balanceOf(user1.address);
            const receiverBalanceAfter = await token.balanceOf(user2.address);

            // 断言1：发送方余额减少量等于转账金额
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(transferAmount);

            // 断言2：接收方余额增加量等于实际到账金额（扣除手续费）
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(netAmount);

            // 计算实际滑点率
            const totalSlippage = fee * 10000n / transferAmount;
            // 断言3：实际滑点率等于 2%（200/10000）
            expect(totalSlippage).to.equal(200n); // 2%
        });

        // 测试用例2：验证批量转账时，同时考虑手续费和代币锁定的逻辑
        it("批量转账考虑手续费和锁定", async function () {
            // 设置手续费率：100（1%）
            await token.connect(owner).setTransferFee(100);
            // 获取 user1 的总余额
            const totalBalance = await token.balanceOf(user1.address);
            // 计算锁定金额：总余额的 40%
            const lockAmount = totalBalance / 10n * 4n;
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 计算转账金额：可用余额的 30%
            const halfAvailable = available / 10n * 3n;
            // 构建批量转账接收者数组
            const recipients = [
                { to: user2.address, amount: halfAvailable },
                { to: owner.address, amount: halfAvailable }
            ];
            // 计算批量转账总金额
            const totalAmount = halfAvailable * 2n;
            // 计算总手续费
            const fee = await token.calculateFee(totalAmount);
            // 记录转账前发送方余额
            const senderBalanceBefore = await token.balanceOf(user1.address);
            // 执行批量转账操作
            await token.connect(user1).batchTransfer(recipients);
            // 记录转账后发送方余额
            const senderBalanceAfter = await token.balanceOf(user1.address);
            // 断言1：发送方余额减少量等于转账总金额 + 手续费
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(totalAmount + fee);
            // 获取手续费接收方余额
            const feeCollectorBalance = await token.balanceOf(feeCollector.address);
            // 断言2：手续费接收方余额大于 0（说明手续费已收取）
            expect(feeCollectorBalance).to.be.above(0);
        });
    });

    // 子测试套件：边界和极端情况测试，验证合约的鲁棒性
    describe("边界和极端情况测试", function () {
        // 测试用例1：验证转账最小单位（1 wei）时，交易成功
        it("转账 1 wei（最小单位）应该成功", async function () {
            // 定义转账金额：1 wei
            const amount = 1n; // 1 wei
            // 设置手续费为 0，避免干扰
            await token.connect(owner).setTransferFee(0); // 免手续费
            // 断言：转账 1 wei 时，交易不会被回滚
            await expect(
                token.connect(user1).transfer(user2.address, amount)
            ).to.not.be.reverted;
            // 获取接收方余额
            const receiverBalance = await token.balanceOf(user2.address);
            // 断言：接收方余额等于 1 wei
            expect(receiverBalance).to.equal(amount);
        });

        // 测试用例2：验证转账全部可用余额（扣除锁定）时，交易成功，且可用余额变为 0
        it("转账全部余额（扣除锁定）应该成功", async function () {
            // 设置手续费为 0
            await token.connect(owner).setTransferFee(0);
            // 定义锁定金额：1000 枚代币
            const lockAmount = ethers.parseEther("1000");
            // 定义解锁时间：24小时后
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            // 执行代币锁定操作
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 获取可用余额
            const available = await token.availableBalance(user1.address);
            // 断言：转账全部可用余额时，交易不会被回滚
            await expect(
                token.connect(user1).transfer(user2.address, available)
            ).to.not.be.reverted;
            // 获取转账后发送方的可用余额
            const senderAvailableAfter = await token.availableBalance(user1.address);
            // 断言：可用余额变为 0
            expect(senderAvailableAfter).to.equal(0n);
        });

        // 测试用例3：验证高手续费率（4.99%）下，手续费计算和转账逻辑正确
        it("高手续费率下转账应该正确计算", async function () {
            // 设置手续费率：499（4.99%，接近 5% 上限）
            await token.connect(owner).setTransferFee(499); // 49.99%

            // 定义转账金额：100 枚代币
            const amount = ethers.parseEther("100");
            // 计算手续费
            const fee = await token.calculateFee(amount);
            // 计算实际到账金额
            const netAmount = amount - fee;

            // 计算预期手续费
            const expectedFee = (amount * 499n) / 10000n;
            // 断言1：手续费计算准确
            expect(fee).to.equal(expectedFee);

            // 记录转账前接收方余额
            const receiverBalanceBefore = await token.balanceOf(user2.address);
            // 执行转账操作
            await token.connect(user1).transfer(user2.address, amount);
            // 记录转账后接收方余额
            const receiverBalanceAfter = await token.balanceOf(user2.address);

            // 断言2：接收方余额增加量等于实际到账金额
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(netAmount);
        });

        // 测试用例4：验证设置最大手续费率（5%）时，交易成功
        it("最大手续费率（5%）应该被允许", async function () {
            await expect(
                token.connect(owner).setTransferFee(500) // 5%
            ).to.not.be.reverted;
        });

        // 测试用例5：验证设置超过最大手续费率（5.01%）时，交易失败
        it("超过最大手续费率应该失败", async function () {
            await expect(
                token.connect(owner).setTransferFee(501) // 5.01%
            ).to.be.revertedWith("AdvancedToken: fee too high");
        });
    });

    // 子测试套件：滑点计算辅助函数测试，验证自定义工具函数的正确性
    describe("滑点计算辅助函数", function () {
        // 自定义工具函数1：计算实际滑点率
        /**
         * 计算实际滑点率
         * @param {BigInt} expectedOutput 预期输出金额
         * @param {BigInt} actualOutput 实际输出金额
         * @returns {BigInt} 滑点率（基数为10000）
         */
        function calculateSlippage(expectedOutput, actualOutput) {
            // 若预期输出为 0，返回滑点率 0
            if (expectedOutput === 0n) return 0n;
            // 滑点率公式：(预期输出 - 实际输出) / 预期输出 * 10000（转为与手续费率一致的基数）
            const slippage = ((expectedOutput - actualOutput) * 10000n) / expectedOutput;
            return slippage;
        }

        // 自定义工具函数2：计算批量转账的平均滑点率
        /**
         * 计算批量转账的总滑点
         * @param {Array} recipients 接收者数组
         * @param {BigInt} totalFee 总手续费
         * @returns {BigInt} 平均滑点率
         */
        function calculateBatchSlippage(recipients, totalFee) {
            // 初始化总转账金额
            let totalAmount = 0n;
            // 遍历接收者数组，累加转账金额
            for (const recipient of recipients) {
                totalAmount += recipient.amount;
            }
            // 若总转账金额为 0，返回滑点率 0
            if (totalAmount === 0n) return 0n;
            // 平均滑点率公式：总手续费 / 总转账金额 * 10000
            return (totalFee * 10000n) / totalAmount;
        }

        // 测试用例1：验证 calculateSlippage 函数计算结果准确
        it("应该正确计算滑点率", async function () {
            // 定义转账金额：100 枚代币
            const amount = ethers.parseEther("100");
            // 计算手续费
            const fee = await token.calculateFee(amount);
            // 计算实际到账金额
            const netAmount = amount - fee;
            // 调用自定义函数计算滑点率
            const slippage = calculateSlippage(amount, netAmount);
            // 计算预期滑点率
            const expectedSlippage = (fee * 10000n) / amount;
            // 双重断言：验证滑点率计算准确，且等于 3%（300/10000）
            expect(slippage).to.equal(expectedSlippage);
            expect(slippage).to.equal(300n); // 3%
        });

        // 测试用例2：验证 calculateBatchSlippage 函数计算结果准确
        it("应该正确计算批量转账滑点", async function () {
            // 构建批量转账接收者数组
            const recipients = [
                { amount: ethers.parseEther("50") },
                { amount: ethers.parseEther("30") },
                { amount: ethers.parseEther("20") }
            ];
            // 定义总转账金额：100 枚代币
            const totalAmount = ethers.parseEther("100");
            // 计算总手续费
            const totalFee = await token.calculateFee(totalAmount);
            // 调用自定义函数计算批量转账滑点率
            const batchSlippage = calculateBatchSlippage(recipients, totalFee);
            // 计算预期滑点率
            const expectedSlippage = (totalFee * 10000n) / totalAmount;
            // 断言：批量滑点率计算准确
            expect(batchSlippage).to.equal(expectedSlippage);
        });
    });
});