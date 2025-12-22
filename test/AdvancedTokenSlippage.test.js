const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { accessListify, lock } = require("ethers");
const { ethers } = require("hardhat");

describe("AdvancedToken 滑点测试", function () {
    let token, owner, user1, user2, feeCollector;

    beforeEach(async function () {
        [owner, user1, user2, feeCollector] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("AdvancedToken");
        token = await Token.deploy(
            "AdvancedToken",
            "ADV",
            18, // decimals
            ethers.parseEther("1000000"), // 1M tokens
            owner.address,
            feeCollector.address,
            300 // 3% transfer fee (300 = 3%, denominator = 10000)
        );

        await token.waitForDeployment();

        // 给测试用户分配代币
        await token.connect(owner).transfer(
            user1.address,
            ethers.parseEther("10000")
        );
    });

    // ============ 手续费滑点测试 ============
    describe("手续费滑点测试", function () {
        it("应该正确计算 3% 手续费", async function () {
            const amount = ethers.parseEther("100");
            const expectedFee = (amount * 300n) / 10000n; // 3% of 100 = 3 tokens

            const calculatedFee = await token.calculateFee(amount);
            expect(calculatedFee).to.equal(expectedFee);
        });

        it("应该正确计算 0.01% 手续费（边界最小值）", async function () {
            // 设置最低手续费
            await token.connect(owner).setTransferFee(1); // 0.01%

            const amount = ethers.parseEther("1");
            const expectedFee = (amount * 1n) / 10000n;

            const calculatedFee = await token.calculateFee(amount);
            expect(calculatedFee).to.equal(expectedFee);
        });

        it("应该正确计算 5% 手续费（边界最大值）", async function () {
            // 设置最高手续费
            await token.connect(owner).setTransferFee(500); // 5%

            const amount = ethers.parseEther("100");
            const expectedFee = (amount * 500n) / 10000n; // 5% of 100 = 5 tokens

            const calculatedFee = await token.calculateFee(amount);
            expect(calculatedFee).to.equal(expectedFee);
        });

        it("大额转账的手续费计算应该准确", async function () {
            const amount = ethers.parseUnits("1000000", 18); // 1M tokens
            const feeRate = 300n; // 3%
            const expectedFee = (amount * feeRate) / 10000n;

            const calculatedFee = await token.calculateFee(amount);
            expect(calculatedFee).to.equal(expectedFee);
            expect(calculatedFee).to.equal(ethers.parseEther("30000")); // 1M * 3% = 30K
        });

        it("微小金额转账的手续费计算应该准确", async function () {
            const amount = 1n; // 1 wei (最小单位)
            const expectedFee = (amount * 300n) / 10000n; // 1 * 0.03 = 0 (向下取整)

            const calculatedFee = await token.calculateFee(amount);
            expect(calculatedFee).to.equal(0n); // 因为太小被截断为0
        });

        it("转账后的实际到账金额应该考虑手续费", async function () {
            const senderBalanceBefore = await token.balanceOf(user1.address);
            const receiverBalanceBefore = await token.balanceOf(user2.address);
            const feeCollectorBalanceBefore = await token.balanceOf(feeCollector.address);

            const amount = ethers.parseEther("100");
            const fee = await token.calculateFee(amount);
            const netAmount = amount - fee;

            // 执行转账
            await token.connect(user1).transfer(user2.address, amount);

            // 验证余额变化
            const senderBalanceAfter = await token.balanceOf(user1.address);
            const receiverBalanceAfter = await token.balanceOf(user2.address);
            const feeCollectorBalanceAfter = await token.balanceOf(feeCollector.address);

            // 发送方减少 amount
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(amount);

            // 接收方增加 netAmount
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(netAmount);

            // 手续费接收方增加 fee
            expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(fee);

            // 验证滑点：实际到账比例
            const slippage = (fee * 10000n) / amount; // 实际手续费率
            expect(slippage).to.equal(300n); // 应该等于 3% (300/10000)
        });

        it("手续费率应该影响滑点大小", async function () {
            // 测试不同手续费率下的滑点
            const testCases = [
                { fee: 100, description: "1% 手续费" }, // 1%
                { fee: 300, description: "3% 手续费" }, // 3%
                { fee: 500, description: "5% 手续费" }, // 5%
            ];

            for (const testCase of testCases) {
                await token.connect(owner).setTransferFee(testCase.fee);

                const amount = ethers.parseEther("100");
                const calculatedFee = await token.calculateFee(amount);
                const expectedFee = (amount * BigInt(testCase.fee)) / 10000n;

                expect(calculatedFee).to.equal(expectedFee);

                // 验证转账
                const tx = await token.connect(user1).transfer(user2.address, amount);
                await tx.wait();

                const receiverBalance = await token.balanceOf(user2.address);
                const netAmount = amount - calculatedFee;

                // 清空接收方余额以便下次测试
                await token.connect(user2).transfer(user1.address, receiverBalance);
            }
        });

        it("手续费为零时应该没有滑点", async function () {
            await token.connect(owner).setTransferFee(0);

            const amount = ethers.parseEther("100");
            const calculatedFee = await token.calculateFee(amount);
            expect(calculatedFee).to.equal(0n);

            const senderBalanceBefore = await token.balanceOf(user1.address);
            const receiverBalanceBefore = await token.balanceOf(user2.address);

            await token.connect(user1).transfer(user2.address, amount);

            const senderBalanceAfter = await token.balanceOf(user1.address);
            const receiverBalanceAfter = await token.balanceOf(user2.address);

            // 发送方减少 amount
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(amount);
            // 接收方增加 amount（没有手续费）
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(amount);
        });

        it("转账金额不足以支付手续费时应该失败--生产不存在当前成绩", async function () {
            // 设置高手续费率
            await token.connect(owner).setTransferFee(500); // 50%
            const amount = ethers.parseEther("1");
            const fee = await token.calculateFee(amount);
            // 因为 1 token 的 50% 是 0.5，但整数除法会得到 0
            // 
            const expectedFee = (amount * 500n) / 10000n;
            expect(fee).to.equal(expectedFee); // 1 * 5000 / 10000 = 0.5 → 向下取整为 0

            // 转账应该成功，因为手续费为0
            await expect(
                token.connect(user1).transfer(user2.address, amount)
            ).to.not.be.reverted;
        });
    });

    // ============ 代币锁定滑点测试 ============
    describe("代币锁定滑点测试", function () {
        beforeEach(async function () {
            // 确保没有手续费干扰测试
            await token.connect(owner).setTransferFee(0);
        });

        it("锁定部分代币后可用余额应该减少", async function () {
            // 先查询用户实际余额
            const totalBalance = await token.balanceOf(user1.address);
            const lockAmount = totalBalance / 10n * 5n; // 锁定一半
            // 获取当前区块时间戳
            const latestBlock = await ethers.provider.getBlock("latest");
            const unlockTime = latestBlock.timestamp + 86400; // 24小时后解锁
            // 锁定前检查
            console.log("锁定前余额：", totalBalance.toString());
            console.log("锁定金额：", lockAmount.toString());
            // 锁定代币
            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            // 锁定后检查
            const newBalance = await token.balanceOf(user1.address);
            const available = await token.availableBalance(user1.address);
            const locked = await token.getLockedAmount(user1.address);

            console.log("锁定后余额：", newBalance.toString());
            console.log("可用余额：", available.toString());
            console.log("锁定金额：", locked.toString());
            expect(newBalance).to.equal(totalBalance - lockAmount);
            expect(available).to.equal(totalBalance - available);
            expect(locked).to.equal(lockAmount);
        });

        it("锁定代币后不能转账超过可用余额", async function () {
            const totalBalance = await token.balanceOf(user1.address);
            const lockAmount = totalBalance / 10n * 8n; // 锁定80%
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;

            await token.connect(user1).lockTokens(lockAmount, unlockTime);
            const newBalance = await token.balanceOf(user1.address);
            // const availables = await token.availableBalance(user1.address);
            const locked = await token.getLockedAmount(user1.address);
            console.log("锁定后余额：", newBalance.toString());
            // console.log("可用余额：", availables.toString());
            console.log("锁定金额：", locked.toString());

            const available = await token.availableBalance(user1.address);
            const exceedAmount = available + ethers.parseEther("1");

            // 尝试转账超过可用余额
            await expect(
                token.connect(user1).transfer(user2.address, exceedAmount)
            ).to.be.revertedWith("AdvancedToken: transfer amount exceeds available balance");
        });

        it("锁定代币后只能转账可用余额部分", async function () {
            const lockAmount = ethers.parseEther("3000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;

            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const available = await token.availableBalance(user1.address);

            // 尝试转账正好可用余额
            await expect(
                token.connect(user1).transfer(user2.address, available)
            ).to.not.be.reverted;
        });

        it("解锁代币后可用余额应该增加", async function () {
            const lockAmount = ethers.parseEther("2000");
            const unlockTime = Math.floor(Date.now() / 1000) + 1; // 1秒后解锁

            await waitForDeployment(1);

            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const availableBefore = await token.availableBalance(user1.address);

            // 等待解锁
            await ethers.provider.send("evm_increaseTime", [2]);
            await ethers.provider.send("evm_mine", []);

            await token.connect(user1).unlockTokens();

            const availableAfter = await token.availableBalance(user1.address);

            expect(availableAfter - availableBefore).to.equal(lockAmount);
        });

        it("批量转账时应该考虑锁定余额", async function () {
            const lockAmount = ethers.parseEther("5000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;

            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const available = await token.availableBalance(user1.address);

            // 创建批量转账请求
            const recipients = [
                {
                    to: user2.address,
                    amount: available / 2n
                },
                {
                    to: owner.address,
                    amount: available / 2n
                }
            ];

            // 应该成功，因为总额等于可用余额
            await expect(
                token.connect(user1).batchTransfer(recipients)
            ).to.not.be.reverted;
        });

        it("批量转账超过锁定余额应该失败", async function () {
            const lockAmount = ethers.parseEther("6000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;

            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const available = await token.availableBalance(user1.address);
            const exceedAmount = available + ethers.parseEther("100");

            const recipients = [
                {
                    to: user2.address,
                    amount: exceedAmount
                }
            ];

            await expect(
                token.connect(user1).batchTransfer(recipients)
            ).to.be.revertedWith("AdvancedToken: insufficient balance");
        });

        it("多个锁定记录应该正确计算总锁定金额", async function () {
            // 先查询用户实际余额
            const totalBalance = await token.balanceOf(user1.address)
            // 创建多个锁定记录
            const lock1 = ethers.parseEther("1000");
            const lock2 = ethers.parseEther("2000");
            const lock3 = ethers.parseEther("3000");

            const unlockTime = Math.floor(Date.now() / 1000) + 86400;

            await token.connect(user1).lockTokens(lock1, unlockTime);
            await token.connect(user1).lockTokens(lock2, unlockTime);
            await token.connect(user1).lockTokens(lock3, unlockTime);

            const totalLocked = await token.getLockedAmount(user1.address);
            expect(totalLocked).to.equal(lock1 + lock2 + lock3);

            const available = await token.availableBalance(user1.address);
            const newBalance = await token.balanceOf(user1.address);

            expect(available).to.equal(totalBalance - totalLocked);
        });

        it("部分解锁后可用余额应该相应增加", async function () {
            // 创建两个不同时间解锁的记录
            const currentTime = Math.floor(Date.now() / 1000);
            const lock1 = ethers.parseEther("1000");
            const lock2 = ethers.parseEther("2000");

            // 第一个立即解锁，第二个24小时后解锁
            await token.connect(user1).lockTokens(lock1, currentTime + 1);
            await token.connect(user1).lockTokens(lock2, currentTime + 86400);

            const lockedBefore = await token.getLockedAmount(user1.address);
            expect(lockedBefore).to.equal(lock1 + lock2);

            // 时间前进到第一个解锁时间之后
            await ethers.provider.send("evm_increaseTime", [2]);
            await ethers.provider.send("evm_mine", []);

            // 解锁（应该只解锁第一个）
            await token.connect(user1).unlockTokens();

            const lockedAfter = await token.getLockedAmount(user1.address);
            expect(lockedAfter).to.equal(lock2); // 只有第二个还锁定着
        });
    });

    // ============ 组合滑点测试 ============
    describe("组合滑点测试（手续费 + 锁定）", function () {
        it("同时考虑手续费和锁定时滑点应该叠加", async function () {
            // 设置 2% 手续费
            await token.connect(owner).setTransferFee(200);

            // 锁定部分代币
            const lockAmount = ethers.parseEther("3000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const totalBalance = await token.balanceOf(user1.address);
            const available = await token.availableBalance(user1.address);

            const transferAmount = available; // 转账全部可用余额
            const fee = await token.calculateFee(transferAmount);
            const netAmount = transferAmount - fee;

            const senderBalanceBefore = await token.balanceOf(user1.address);
            const receiverBalanceBefore = await token.balanceOf(user2.address);

            await token.connect(user1).transfer(user2.address, transferAmount);

            const senderBalanceAfter = await token.balanceOf(user1.address);
            const receiverBalanceAfter = await token.balanceOf(user2.address);

            // 验证发送方减少金额
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(transferAmount);

            // 验证接收方增加金额（扣除手续费）
            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(netAmount);

            // 计算实际滑点率
            const totalSlippage = fee * 10000n / transferAmount;
            expect(totalSlippage).to.equal(200n); // 2%
        });

        it("批量转账考虑手续费和锁定", async function () {
            // 设置 1% 手续费
            await token.connect(owner).setTransferFee(100);

            // 锁定部分代币
            const lockAmount = ethers.parseEther("4000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const available = await token.availableBalance(user1.address);
            const halfAvailable = available / 2n;

            const recipients = [
                { to: user2.address, amount: halfAvailable },
                { to: owner.address, amount: halfAvailable }
            ];

            const totalAmount = halfAvailable * 2n;
            const fee = await token.calculateFee(totalAmount);

            const senderBalanceBefore = await token.balanceOf(user1.address);

            // 执行批量转账
            await token.connect(user1).batchTransfer(recipients);

            const senderBalanceAfter = await token.balanceOf(user1.address);

            // 验证发送方减少金额（包含手续费）
            expect(senderBalanceBefore - senderBalanceAfter).to.equal(totalAmount + fee);

            // 验证手续费被收取
            const feeCollectorBalance = await token.balanceOf(feeCollector.address);
            expect(feeCollectorBalance).to.be.above(0);
        });
    });

    // ============ 边界和极端情况测试 ============
    describe("边界和极端情况测试", function () {
        it("转账 1 wei（最小单位）应该成功", async function () {
            const amount = 1n; // 1 wei
            await token.connect(owner).setTransferFee(0); // 免手续费

            await expect(
                token.connect(user1).transfer(user2.address, amount)
            ).to.not.be.reverted;

            const receiverBalance = await token.balanceOf(user2.address);
            expect(receiverBalance).to.equal(amount);
        });

        it("转账全部余额（扣除锁定）应该成功", async function () {
            await token.connect(owner).setTransferFee(0);

            // 锁定部分代币
            const lockAmount = ethers.parseEther("1000");
            const unlockTime = Math.floor(Date.now() / 1000) + 86400;
            await token.connect(user1).lockTokens(lockAmount, unlockTime);

            const available = await token.availableBalance(user1.address);

            await expect(
                token.connect(user1).transfer(user2.address, available)
            ).to.not.be.reverted;

            // 发送方应该只剩锁定代币
            const senderAvailableAfter = await token.availableBalance(user1.address);
            expect(senderAvailableAfter).to.equal(0n);
        });

        it("高手续费率下转账应该正确计算", async function () {
            // 设置接近上限的手续费率
            await token.connect(owner).setTransferFee(499); // 49.99%

            const amount = ethers.parseEther("100");
            const fee = await token.calculateFee(amount);
            const netAmount = amount - fee;

            // 验证手续费计算正确
            const expectedFee = (amount * 499n) / 10000n;
            expect(fee).to.equal(expectedFee);

            // 验证转账
            const receiverBalanceBefore = await token.balanceOf(user2.address);
            await token.connect(user1).transfer(user2.address, amount);
            const receiverBalanceAfter = await token.balanceOf(user2.address);

            expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(netAmount);
        });

        it("最大手续费率（5%）应该被允许", async function () {
            await expect(
                token.connect(owner).setTransferFee(500) // 5%
            ).to.not.be.reverted;
        });

        it("超过最大手续费率应该失败", async function () {
            await expect(
                token.connect(owner).setTransferFee(501) // 5.01%
            ).to.be.revertedWith("AdvancedToken: fee too high");
        });
    });

    // ============ 滑点计算工具函数 ============
    describe("滑点计算辅助函数", function () {
        // 这些是测试辅助函数，可以在测试中使用

        /**
         * 计算实际滑点率
         * @param {BigInt} expectedOutput 预期输出金额
         * @param {BigInt} actualOutput 实际输出金额
         * @returns {BigInt} 滑点率（基数为10000）
         */
        function calculateSlippage(expectedOutput, actualOutput) {
            if (expectedOutput === 0n) return 0n;
            const slippage = ((expectedOutput - actualOutput) * 10000n) / expectedOutput;
            return slippage;
        }

        /**
         * 计算批量转账的总滑点
         * @param {Array} recipients 接收者数组
         * @param {BigInt} totalFee 总手续费
         * @returns {BigInt} 平均滑点率
         */
        function calculateBatchSlippage(recipients, totalFee) {
            let totalAmount = 0n;
            for (const recipient of recipients) {
                totalAmount += recipient.amount;
            }
            if (totalAmount === 0n) return 0n;
            return (totalFee * 10000n) / totalAmount;
        }

        it("应该正确计算滑点率", async function () {
            const amount = ethers.parseEther("100");
            const fee = await token.calculateFee(amount);
            const netAmount = amount - fee;

            const slippage = calculateSlippage(amount, netAmount);
            const expectedSlippage = (fee * 10000n) / amount;

            expect(slippage).to.equal(expectedSlippage);
            expect(slippage).to.equal(300n); // 3%
        });

        it("应该正确计算批量转账滑点", async function () {
            const recipients = [
                { amount: ethers.parseEther("50") },
                { amount: ethers.parseEther("30") },
                { amount: ethers.parseEther("20") }
            ];

            const totalAmount = ethers.parseEther("100");
            const totalFee = await token.calculateFee(totalAmount);

            const batchSlippage = calculateBatchSlippage(recipients, totalFee);
            const expectedSlippage = (totalFee * 10000n) / totalAmount;

            expect(batchSlippage).to.equal(expectedSlippage);
        });
    });
});