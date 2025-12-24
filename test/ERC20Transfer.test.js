// 导入Chai断言库的expect函数，用于编写测试断言
const { expect } = require("chai");
// 导入Hardhat的ethers模块，用于与以太坊区块链交互
const { ethers } = require("hardhat");

// 定义测试套件，测试AdvancedToken合约的功能
describe("AdvancedToken 测试", function () {
    // 声明变量，用于存储合约工厂、合约实例和账户
    let AdvancedToken;    // 合约工厂，用于部署新合约
    let advancedToken;    // 已部署的合约实例
    let owner;            // 合约所有者账户
    let user1;            // 测试用户1
    let user2;            // 测试用户2

    // 定义测试中使用的常量参数
    const NAME = "Web3 Token";          // 代币名称
    const SYMBOL = "WEB3";              // 代币符号
    const DECIMALS = 18;                // 代币小数位数
    const INITIAL_SUPPLY = 1000000;     // 初始供应量，直接使用数字，合约会自动乘以10^decimals
    const TRANSFER_FEE = 100;           // 转账手续费比例，100表示1%

    // 每个测试用例执行前都会运行的准备工作
    beforeEach(async function () {
        // 获取Hardhat测试网络中的账户列表
        [owner, user1, user2] = await ethers.getSigners();

        // 获取AdvancedToken合约工厂
        AdvancedToken = await ethers.getContractFactory("AdvancedToken");
        // 部署AdvancedToken合约，传入所需参数
        advancedToken = await AdvancedToken.deploy(
            NAME,           // 代币名称
            SYMBOL,         // 代币符号
            DECIMALS,       // 小数位数
            INITIAL_SUPPLY, // 初始供应量
            owner.address,  // 合约所有者地址
            owner.address,  // 手续费接收地址
            TRANSFER_FEE    // 转账手续费比例
        );

        // 给测试用户分配一些代币，方便后续测试
        const userAmount = ethers.parseEther("1000"); // 解析1000个代币（考虑小数位数）
        await advancedToken.connect(owner).transfer(user1.address, userAmount); // 从所有者转1000代币给user1
        await advancedToken.connect(owner).transfer(user2.address, userAmount); // 从所有者转1000代币给user2
    });

    // 测试合约的基础功能
    describe("基础功能", function () {
        // 测试合约属性是否正确设置
        it("应该正确设置合约属性", async function () {
            // 验证代币名称
            expect(await advancedToken.name()).to.equal(NAME);
            // 验证代币符号
            expect(await advancedToken.symbol()).to.equal(SYMBOL);
            // 验证小数位数
            expect(await advancedToken.decimals()).to.equal(DECIMALS);
            // 验证总供应量（使用parseEther确保格式正确）
            expect(await advancedToken.totalSupply()).to.equal(ethers.parseEther(INITIAL_SUPPLY.toString()));
            // 验证合约所有者
            expect(await advancedToken.owner()).to.equal(owner.address);
        });

        // 测试代币转账功能
        it("应该正确转账", async function () {
            // 设置转账金额为100代币
            const amount = ethers.parseEther("100");

            // 获取转账前的余额
            const senderBalanceBefore = await advancedToken.balanceOf(user1.address); // user1转账前余额
            const receiverBalanceBefore = await advancedToken.balanceOf(user2.address); // user2转账前余额

            // 执行转账操作，从user1转100代币给user2
            await expect(advancedToken.connect(user1).transfer(user2.address, amount))
                .to.emit(advancedToken, "Transfer") // 验证转账事件是否触发
                .withArgs(user1.address, user2.address, amount * 99n / 100n); // 验证转账金额扣除了1%手续费

            // 获取转账后的余额
            const senderBalanceAfter = await advancedToken.balanceOf(user1.address); // user1转账后余额
            const receiverBalanceAfter = await advancedToken.balanceOf(user2.address); // user2转账后余额

            // 计算手续费和实际到账金额
            const fee = amount * BigInt(TRANSFER_FEE) / 10000n; // 计算手续费（TRANSFER_FEE/10000）
            const netAmount = amount - fee; // 实际到账金额

            // 验证转账后余额是否正确
            expect(senderBalanceAfter).to.equal(senderBalanceBefore - amount); // 发送方扣除全额
            expect(receiverBalanceAfter).to.equal(receiverBalanceBefore + netAmount); // 接收方收到扣除手续费后的金额
        });
    });

    // 测试批量转账功能
    describe("批量转账", function () {
        // 测试批量转账是否成功执行
        it("应该成功执行批量转账", async function () {
            // 定义批量转账的接收者列表
            const recipients = [
                { to: user2.address, amount: ethers.parseEther("10") }, // 转给user2 10个代币
                { to: owner.address, amount: ethers.parseEther("20") }  // 转给owner 20个代币
            ];

            // 计算总转账金额
            const totalAmount = recipients[0].amount + recipients[1].amount;
            // 获取转账前发送方的余额
            const senderBalanceBefore = await advancedToken.balanceOf(user1.address);

            // 执行批量转账操作
            await expect(advancedToken.connect(user1).batchTransfer(recipients))
                .to.emit(advancedToken, "BatchTransfer") // 验证批量转账事件是否触发
                .withArgs(user1.address, totalAmount, 2); // 验证事件参数是否正确

            // 获取转账后发送方的余额
            const senderBalanceAfter = await advancedToken.balanceOf(user1.address);
            // 计算总手续费和预计扣除金额
            const fee = totalAmount * BigInt(TRANSFER_FEE) / 10000n;
            const expectedDeduction = totalAmount + fee;

            // 验证发送方余额是否正确扣除
            expect(senderBalanceAfter).to.equal(senderBalanceBefore - expectedDeduction);
        });
    });

    // 测试代币锁定功能
    describe("代币锁定", function () {
        // 测试锁定代币功能是否正常工作
        it("应该成功锁定代币", async function () {
            // 获取原始余额
            const totalBalance = await advancedToken.balanceOf(user1.address);
            // 设置锁定金额为100代币
            const lockAmount = totalBalance / 10n; // 锁定10%
            // 设置解锁时间为当前时间+24小时
            const latestBlock = await ethers.provider.getBlock("latest");
            const unlockTime = latestBlock.timestamp + 86400; // 24小时后
            // 执行锁定代币操作
            await expect(advancedToken.connect(user1).lockTokens(lockAmount, unlockTime))
                .to.emit(advancedToken, "TokensLocked") // 验证锁定事件是否触发
                .withArgs(user1.address, lockAmount, unlockTime); // 验证事件参数是否正确

            // 验证锁定的金额是否正确
            const lockedAmount = await advancedToken.getLockedAmount(user1.address);
            expect(lockedAmount).to.equal(lockAmount);

            // 验证可用余额是否减少
            const availableBalance = await advancedToken.availableBalance(user1.address); // 获取可用余额
            expect(availableBalance).to.equal(totalBalance - lockAmount); // 可用余额 = 总余额 - 锁定金额

        });
    });
});