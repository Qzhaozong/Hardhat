// test/AdvancedToken.test.js
// 测试文件：AdvancedToken合约的自动化测试脚本

// 导入测试所需的库
const { expect } = require("chai"); // Chai断言库，用于编写测试断言
const { ethers } = require("hardhat"); // Hardhat的以太坊工具包
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
// loadFixture: 用于加载测试夹具，复用部署状态，提高测试性能
// time: 用于模拟区块链时间操作，如时间推进

// 描述测试套件：AdvancedToken 合约测试
describe("AdvancedToken 合约测试", function () {
    // 部署夹具 - 用于在每个测试前部署合约并设置初始状态
    async function deployTokenFixture() {
        // 获取测试账户：owner(所有者), user1-3(普通用户), feeCollector(手续费接收者)
        const [owner, user1, user2, user3, feeCollector] = await ethers.getSigners();

        // 获取合约工厂并部署AdvancedToken合约
        const AdvancedToken = await ethers.getContractFactory("AdvancedToken");
        // 构造函数参数：名称，符号，小数位数，初始供应量，所有者，手续费接收者，手续费率(100=1%)
        const token = await AdvancedToken.deploy(
            "Advanced Test Token", // 代币名称
            "ATT",                 // 代币符号
            18,                    // 小数位数（标准ERC20通常是18）
            1000000,               // 100万代币（会自动乘以10^decimals）
            owner.address,         // 合约所有者地址
            feeCollector.address,  // 手续费接收地址
            100                    // 1% 手续费（100/10000 = 1%）
        );

        // 等待合约部署完成
        await token.waitForDeployment();

        // 给测试用户转账：从所有者账户向user1和user2各转1000个代币
        await token.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
        await token.connect(owner).transfer(user2.address, ethers.parseEther("1000"));
        const user1Balance = await token.balanceOf(user1.address);
        const user2Balance = await token.balanceOf(user2.address);
        const user3Balance = await token.balanceOf(user3.address);
        console.log(`User1 初始余额: ${user1Balance} wei`);
        console.log(`User2 初始余额: ${user2Balance} wei`);
        console.log(`User3 初始余额: ${user3Balance} wei`);


        // 返回测试所需的合约实例和账户
        return {
            token,          // AdvancedToken合约实例
            owner,          // 合约所有者
            user1, user2, user3, // 测试用户
            feeCollector,
            user1Balance    // 手续费接收者
        };
    }

    // 测试组1：基础功能测试
    describe("基础功能测试", function () {
        // 测试用例1：验证合约参数是否正确设置
        it("应该正确设置合约参数", async function () {
            // 加载夹具，获取部署好的合约和账户
            const { token, owner, feeCollector } = await loadFixture(deployTokenFixture);

            // 断言合约参数是否符合预期
            expect(await token.name()).to.equal("Advanced Test Token"); // 代币名称
            expect(await token.symbol()).to.equal("ATT"); // 代币符号
            expect(await token.decimals()).to.equal(18); // 小数位数
            expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000")); // 总供应量
            expect(await token.owner()).to.equal(owner.address); // 所有者地址
            expect(await token.feeCollector()).to.equal(feeCollector.address); // 手续费接收地址
            expect(await token.transferFee()).to.equal(100); // 手续费率
        });

        // 测试用例2：验证余额查询功能
        it("应该正确返回余额", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            // 查询余额
            const ownerBalance = await token.balanceOf(owner.address);
            const user1Balance = await token.balanceOf(user1.address);
            // 断言：owner余额应接近998000（100万减2000转账）
            // 使用closeTo允许微小误差（如手续费影响）
            expect(ownerBalance).to.be.closeTo(
                ethers.parseEther("998000"), // 预期值
                ethers.parseEther("10")     // 允许10个代币误差（手续费影响）
            );
            expect(user1Balance).to.be.closeTo(
                ethers.parseEther("1000"), // 预期值
                ethers.parseEther("100")    // 允许100个代币误差（手续费影响）
            );
            // expect(user1Balance).to.equal(ethers.parseEther("1000"));
        });
    });

    // 测试组2：ERC20标准功能测试
    describe("ERC20 标准功能测试", function () {
        // 测试用例1：验证基本转账功能
        it("应该允许转账", async function () {
            const { token, user1, user2 } = await loadFixture(deployTokenFixture);

            const amount = ethers.parseEther("100"); // 转账金额：100个代币
            const tx = await token.connect(user1).transfer(user2.address, amount); // user1转账给user2
            await tx.wait(); // 等待交易确认

            // 查询转账后余额
            const user1Balance = await token.balanceOf(user1.address);
            const user2Balance = await token.balanceOf(user2.address);

            // 计算手续费：100 * 1% = 1个代币
            const fee = ethers.parseEther("1");
            const netAmount = amount - fee; // 实际到账金额

            // 断言：user1余额 = 初始990 - 转账100 - 手续费1 = 799
            expect(user1Balance).to.equal(ethers.parseEther("890"));
            // user2余额 = 初始990 + 实际到账99 = 1088
            expect(user2Balance).to.equal(ethers.parseEther("990") + netAmount);
        });

        // 测试用例2：验证批准和transferFrom功能
        it("应该允许批准和 transferFrom", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            const amount = ethers.parseEther("500");


            // 批准步骤：owner批准user1可以转移500个代币
            const approveTx = await token.connect(owner).approve(user1.address, amount);
            await approveTx.wait();


            // 验证批准额度是否正确设置
            const allowance = await token.allowance(owner.address, user1.address);
            expect(allowance).to.equal(amount);

            // 使用transferFrom：user1从owner账户向自己转账
            const transferTx = await token.connect(user1).transferFrom(
                owner.address, // 转出账户
                user1.address, // 转入账户
                amount         // 转账金额
            );
            await transferTx.wait();

            // 验证余额变化
            const user1Balance = await token.balanceOf(user1.address);
            // 计算手续费
            const fee = ethers.parseEther("5"); // 500 * 1% = 5个代币手续费

            const netAmount = amount - fee; // 实际到账金额
            // user1余额 = 初始1000 + 实际到账495 = 1495
            expect(user1Balance).to.equal(ethers.parseEther("990") + netAmount);
            // 验证批准额度已清零
            const newAllowance = await token.allowance(owner.address, user1.address);
            expect(newAllowance).to.equal(0);
        });

        // 测试用例3：验证增加和减少批准额度功能
        it("应该允许增加和减少批准额度", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            // 定义测试金额
            const initialAmount = ethers.parseEther("100"); // 初始批准
            const addedAmount = ethers.parseEther("50");    // 增加额度
            const subtractedAmount = ethers.parseEther("30"); // 减少额度

            // 设置初始批准额度
            await token.connect(owner).approve(user1.address, initialAmount);

            // 增加批准额度
            await token.connect(owner).increaseAllowance(user1.address, addedAmount);
            let allowance = await token.allowance(owner.address, user1.address);
            expect(allowance).to.equal(initialAmount + addedAmount); // 150

            // 减少批准额度
            await token.connect(owner).decreaseAllowance(user1.address, subtractedAmount);
            allowance = await token.allowance(owner.address, user1.address);
            expect(allowance).to.equal(initialAmount + addedAmount - subtractedAmount); // 120
        });
    });

    // 测试组3：手续费功能测试
    describe("手续费功能测试", function () {
        // 测试用例1：验证手续费计算
        it("应该正确计算手续费", async function () {
            const { token } = await loadFixture(deployTokenFixture);

            const amount = ethers.parseEther("1000");
            const fee = await token.calculateFee(amount); // 调用合约计算手续费

            // 1000 * 1% = 10个代币
            expect(fee).to.equal(ethers.parseEther("10"));
        });

        // 测试用例2：验证转账时实际收取手续费
        it("转账时应该收取手续费", async function () {
            const { token, user1, user2, feeCollector } = await loadFixture(deployTokenFixture);

            const amount = ethers.parseEther("200");
            const feeCollectorBalanceBefore = await token.balanceOf(feeCollector.address);

            // 执行转账
            const tx = await token.connect(user1).transfer(user2.address, amount);
            await tx.wait();

            // 查询手续费接收者余额变化
            const feeCollectorBalanceAfter = await token.balanceOf(feeCollector.address);
            const fee = await token.calculateFee(amount); // 计算应收手续费

            // 验证手续费接收者余额增加等于应收手续费
            expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(fee);
        });

        // 测试用例3：验证管理员更新手续费功能
        it("应该允许管理员更新手续费", async function () {
            const { token, owner } = await loadFixture(deployTokenFixture);

            const newFee = 200; // 2%
            const tx = await token.connect(owner).setTransferFee(newFee);
            await tx.wait();

            // 验证手续费已更新
            expect(await token.transferFee()).to.equal(newFee);

            // 验证事件触发
            await expect(tx)
                .to.emit(token, "FeeUpdated") // 预期触发FeeUpdated事件
                .withArgs(100, newFee);      // 事件参数：旧费率，新费率
        });

        // 测试用例4：验证管理员更新手续费接收地址功能
        it("应该允许管理员更新手续费接收地址", async function () {
            const { token, owner, user1, feeCollector } = await loadFixture(deployTokenFixture);

            const tx = await token.connect(owner).setFeeCollector(user1.address);
            await tx.wait();

            // 验证地址已更新
            expect(await token.feeCollector()).to.equal(user1.address);

            // 验证事件触发
            await expect(tx)
                .to.emit(token, "FeeCollectorUpdated") // 预期触发FeeCollectorUpdated事件
                .withArgs(feeCollector.address, user1.address); // 旧地址，新地址
        });

        // 测试用例5：验证非管理员不能更新手续费设置
        it("非管理员不能更新手续费设置", async function () {
            const { token, user1 } = await loadFixture(deployTokenFixture);

            // 预期这些调用会被拒绝
            await expect(
                token.connect(user1).setTransferFee(200)
            ).to.be.revertedWith("AdvancedToken: caller is not the owner");

            await expect(
                token.connect(user1).setFeeCollector(user1.address)
            ).to.be.revertedWith("AdvancedToken: caller is not the owner");
        });
    });

    // 测试组4：批量转账功能测试
    describe("批量转账功能测试", function () {
        it("应该允许批量转账", async function () {
            const { token, user1, user2, user3 } = await loadFixture(deployTokenFixture);

            const recipients = [
                { to: user2.address, amount: ethers.parseEther("100") },
                { to: user3.address, amount: ethers.parseEther("200") }
            ];

            const user1BalanceBefore = await token.balanceOf(user1.address);
            const totalAmount = ethers.parseEther("300");
            const fee = await token.calculateFee(totalAmount);

            const tx = await token.connect(user1).batchTransfer(recipients);
            await tx.wait();

            const user1BalanceAfter = await token.balanceOf(user1.address);
            const user2Balance = await token.balanceOf(user2.address);
            const user3Balance = await token.balanceOf(user3.address);

            // 验证扣款
            expect(user1BalanceBefore - user1BalanceAfter).to.equal(totalAmount + fee);

            // 验证收款（扣除手续费后的净额）
            // const feePerRecipient = fee / 2n;
            expect(user2Balance).to.equal(
                ethers.parseEther("990") + ethers.parseEther("100")
            );
            expect(user3Balance).to.equal(ethers.parseEther("200"));

            // 验证事件
            await expect(tx)
                .to.emit(token, "BatchTransfer")
                .withArgs(user1.address, totalAmount, 2);
        });

        it("批量转账应拒绝空接收者列表", async function () {
            const { token, user1 } = await loadFixture(deployTokenFixture);

            await expect(
                token.connect(user1).batchTransfer([])
            ).to.be.revertedWith("AdvancedToken: no recipients");
        });

        it("批量转账应限制接收者数量", async function () {
            const { token, user1 } = await loadFixture(deployTokenFixture);

            const recipients = [];
            for (let i = 0; i < 101; i++) {
                recipients.push({
                    to: ethers.Wallet.createRandom().address,
                    amount: ethers.parseEther("1")
                });
            }

            await expect(
                token.connect(user1).batchTransfer(recipients)
            ).to.be.revertedWith("AdvancedToken: too many recipients");
        });

        it("批量转账应拒绝零地址接收者", async function () {
            const { token, user1, user2 } = await loadFixture(deployTokenFixture);

            const recipients = [
                { to: user2.address, amount: ethers.parseEther("100") },
                { to: ethers.ZeroAddress, amount: ethers.parseEther("100") }
            ];

            await expect(
                token.connect(user1).batchTransfer(recipients)
            ).to.be.revertedWith("AdvancedToken: zero address in recipients");
        });
    });

    // 测试组5：代币锁定功能测试
    it("应该允许锁定代币", async function () {
        const { token, user1 } = await loadFixture(deployTokenFixture);
        // 1. 先查询用户实际余额
        const balanceBefore = await token.balanceOf(user1.address);
        console.log("用户实际余额:", ethers.formatEther(balanceBefore)); // 990
        // 2. 锁定合理金额（不超过余额的一半）
        const lockAmount = balanceBefore / 10n * 8n; // 锁定一半，即 495
        const unlockTime = (await time.latest()) + 86400;
        console.log("锁定金额:", ethers.formatEther(lockAmount));
        // 3. 执行锁定
        const tx = await token.connect(user1).lockTokens(lockAmount, unlockTime);
        await tx.wait();
        // 4. 验证
        const balanceAfter = await token.balanceOf(user1.address);
        const availableAfter = await token.availableBalance(user1.address);
        const lockedAmount = await token.getLockedAmount(user1.address);
        // 验证锁定金额正确
        expect(lockedAmount).to.equal(lockAmount);
        // 验证可用余额正确
        expect(availableAfter).to.equal(balanceBefore - lockedAmount);
        // 验证事件
        await expect(tx)
            .to.emit(token, "TokensLocked")
            .withArgs(user1.address, lockAmount, unlockTime);
    });

    // 测试用例2：验证不能锁定超过余额的代币
    it("不能锁定超过可用余额的代币", async function () {
        const { token, user1 } = await loadFixture(deployTokenFixture);

        const lockAmount = ethers.parseEther("2000"); // 超过用户余额
        const unlockTime = (await time.latest()) + 86400;

        await expect(
            token.connect(user1).lockTokens(lockAmount, unlockTime)
        ).to.be.revertedWith("AdvancedToken: insufficient balance");
    });

    // 测试用例3：验证解锁到期的代币
    it("应该允许解锁到期的代币", async function () {
        const { token, user1 } = await loadFixture(deployTokenFixture);

        const lockAmount = ethers.parseEther("300");
        const unlockTime = (await time.latest()) + 3600; // 1小时后解锁

        // 锁定代币
        await token.connect(user1).lockTokens(lockAmount, unlockTime);

        const balanceBefore = await token.balanceOf(user1.address);
        const lockedBefore = await token.getLockedAmount(user1.address);

        // 时间旅行：将区块链时间向前推进3601秒，超过解锁时间
        await time.increase(3601);

        // 解锁代币
        const tx = await token.connect(user1).unlockTokens();
        await tx.wait();

        const balanceAfter = await token.balanceOf(user1.address);
        const lockedAfter = await token.getLockedAmount(user1.address);

        // 验证解锁成功
        expect(balanceAfter).to.equal(balanceBefore + lockAmount); // 余额恢复
        expect(lockedAfter).to.equal(0); // 锁定金额清零

        // 验证事件触发
        await expect(tx)
            .to.emit(token, "TokensUnlocked")
            .withArgs(user1.address, lockAmount);
    });

    // 测试用例4：验证没有可解锁代币时操作失败
    it("没有可解锁代币时应该失败", async function () {
        const { token, user1 } = await loadFixture(deployTokenFixture);

        await expect(
            token.connect(user1).unlockTokens()
        ).to.be.revertedWith("AdvancedToken: no tokens to unlock");
    });

    // 测试用例5：验证锁定信息查询功能
    it("应该正确返回锁定信息", async function () {
        const { token, user1 } = await loadFixture(deployTokenFixture);

        // 锁定两批代币
        const lockAmount1 = ethers.parseEther("100");
        const lockAmount2 = ethers.parseEther("200");
        const unlockTime1 = (await time.latest()) + 3600;
        const unlockTime2 = (await time.latest()) + 7200;

        await token.connect(user1).lockTokens(lockAmount1, unlockTime1);
        await token.connect(user1).lockTokens(lockAmount2, unlockTime2);

        // 查询锁定信息
        const lockInfo = await token.getLockInfo(user1.address);
        const lockCount = await token.getLockInfoCount(user1.address);
        const lockedAmount = await token.getLockedAmount(user1.address);

        // 验证锁定信息
        expect(lockCount).to.equal(2); // 两个锁定记录
        expect(lockedAmount).to.equal(lockAmount1 + lockAmount2); // 总锁定金额
        expect(lockInfo[0].amount).to.equal(lockAmount1); // 第一个锁定金额
        expect(lockInfo[0].unlockTime).to.equal(unlockTime1); // 第一个解锁时间
        expect(lockInfo[0].unlocked).to.be.false; // 未解锁
    });
    // 测试组6：黑名单功能测试
    describe("黑名单功能测试", function () {
        // 测试用例1：验证管理员可以将地址加入黑名单
        it("应该允许管理员将地址加入黑名单", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            const tx = await token.connect(owner).blacklist(user1.address);
            await tx.wait();

            // 验证地址已被加入黑名单
            expect(await token.isBlacklisted(user1.address)).to.be.true;

            // 验证事件触发
            await expect(tx)
                .to.emit(token, "Blacklisted")
                .withArgs(user1.address);
        });

        // 测试用例2：验证管理员可以将地址移出黑名单
        it("应该允许管理员将地址移出黑名单", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            // 先加入黑名单
            await token.connect(owner).blacklist(user1.address);

            // 再移出黑名单
            const tx = await token.connect(owner).unblacklist(user1.address);
            await tx.wait();

            // 验证地址已移出黑名单
            expect(await token.isBlacklisted(user1.address)).to.be.false;

            // 验证事件触发
            await expect(tx)
                .to.emit(token, "UnBlacklisted")
                .withArgs(user1.address);
        });

        // 测试用例3：验证黑名单用户不能转账
        it("黑名单用户不能转账", async function () {
            const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);

            // 将用户1加入黑名单
            await token.connect(owner).blacklist(user1.address);

            // 预期转账会被拒绝
            await expect(
                token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
            ).to.be.revertedWith("AdvancedToken: account is blacklisted");
        });

        // 测试用例4：验证不能向黑名单用户转账
        it("不能向黑名单用户转账", async function () {
            const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);

            // 将用户2加入黑名单
            await token.connect(owner).blacklist(user2.address);

            // 预期向黑名单用户转账会被拒绝
            await expect(
                token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
            ).to.be.revertedWith("AdvancedToken: account is blacklisted");
        });

        // 测试用例5：验证非管理员不能管理黑名单
        it("非管理员不能管理黑名单", async function () {
            const { token, user1 } = await loadFixture(deployTokenFixture);

            // 预期非管理员操作会被拒绝
            await expect(
                token.connect(user1).blacklist(user1.address)
            ).to.be.revertedWith("AdvancedToken: caller is not the owner");

            await expect(
                token.connect(user1).unblacklist(user1.address)
            ).to.be.revertedWith("AdvancedToken: caller is not the owner");
        });
    });

    // 测试组7：铸币和销毁功能测试
    describe("铸币和销毁功能测试", function () {
        // 测试用例1：验证管理员铸币功能
        it("应该允许管理员铸币", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            const mintAmount = ethers.parseEther("50000");
            const totalSupplyBefore = await token.totalSupply();
            const userBalanceBefore = await token.balanceOf(user1.address);

            // 管理员铸币给user1
            const tx = await token.connect(owner).mint(user1.address, mintAmount);
            await tx.wait();

            const totalSupplyAfter = await token.totalSupply();
            const userBalanceAfter = await token.balanceOf(user1.address);

            // 验证总供应量和用户余额增加
            expect(totalSupplyAfter).to.equal(totalSupplyBefore + mintAmount);
            expect(userBalanceAfter).to.equal(userBalanceBefore + mintAmount);
        });

        // 测试用例2：验证用户销毁自己代币的功能
        it("应该允许用户销毁自己的代币", async function () {
            const { token, user1 } = await loadFixture(deployTokenFixture);

            const burnAmount = ethers.parseEther("100");
            const balanceBefore = await token.balanceOf(user1.address);
            const totalSupplyBefore = await token.totalSupply();

            // 用户销毁自己的代币
            const tx = await token.connect(user1).burn(burnAmount);
            await tx.wait();

            const balanceAfter = await token.balanceOf(user1.address);
            const totalSupplyAfter = await token.totalSupply();

            // 验证用户余额和总供应量减少
            expect(balanceAfter).to.equal(balanceBefore - burnAmount);
            expect(totalSupplyAfter).to.equal(totalSupplyBefore - burnAmount);
        });

        // 测试用例3：验证销毁批准的代币功能
        it("应该允许销毁批准的代币", async function () {
            const { token, owner, user1 } = await loadFixture(deployTokenFixture);

            const burnAmount = ethers.parseEther("200");

            // owner批准user1可以转移代币
            await token.connect(owner).approve(user1.address, burnAmount);

            const ownerBalanceBefore = await token.balanceOf(owner.address);
            const totalSupplyBefore = await token.totalSupply();

            // user1从owner账户销毁代币
            const tx = await token.connect(user1).burnFrom(owner.address, burnAmount);
            await tx.wait();

            const ownerBalanceAfter = await token.balanceOf(owner.address);
            const totalSupplyAfter = await token.totalSupply();

            // 验证owner余额和总供应量减少
            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore - burnAmount);
            expect(totalSupplyAfter).to.equal(totalSupplyBefore - burnAmount);
        });

        // 测试用例4：验证非管理员不能铸币
        it("非管理员不能铸币", async function () {
            const { token, user1, user2 } = await loadFixture(deployTokenFixture);

            await expect(
                token.connect(user1).mint(user2.address, ethers.parseEther("1000"))
            ).to.be.revertedWith("AdvancedToken: caller is not the owner");
        });
    });

    // 测试组8：带备注的转账测试
    describe("带备注的转账测试", function () {
        // 测试用例1：验证带备注的转账功能
        it("应该允许带备注的转账", async function () {
            const { token, user1, user2 } = await loadFixture(deployTokenFixture);

            const amount = ethers.parseEther("50");
            const memo = "Payment for services"; // 转账备注

            // 执行带备注的转账
            const tx = await token.connect(user1).transferWithMemo(
                user2.address,
                amount,
                memo
            );
            await tx.wait();

            // 验证余额变化（包含手续费）
            const user1Balance = await token.balanceOf(user1.address);
            const user2Balance = await token.balanceOf(user2.address);
            const fee = await token.calculateFee(amount);
            const netAmount = amount - fee;

            expect(user1Balance).to.equal(ethers.parseEther("990") - amount);
            expect(user2Balance).to.equal(ethers.parseEther("990") + netAmount);
        });


        // 测试组9：边界条件测试（各种异常情况）
        describe("边界条件测试", function () {
            // 测试用例1：不能转账到零地址
            it("不能转账到零地址", async function () {
                const { token, user1 } = await loadFixture(deployTokenFixture);

                await expect(
                    token.connect(user1).transfer(ethers.ZeroAddress, ethers.parseEther("100"))
                ).to.be.revertedWith("AdvancedToken: zero address");
            });

            // 测试用例2：不能从零地址转账
            it("不能从零地址转账", async function () {
                const { token, user1 } = await loadFixture(deployTokenFixture);

                await expect(
                    token.connect(user1).transferFrom(
                        ethers.ZeroAddress,
                        user1.address,
                        ethers.parseEther("1")
                    )
                ).to.be.revertedWith("AdvancedToken: zero address");
            });

            // 测试用例3：不能转账零金额
            it("不能转账零金额", async function () {
                const { token, user1, user2 } = await loadFixture(deployTokenFixture);

                await expect(
                    token.connect(user1).transfer(user2.address, 0)
                ).to.be.revertedWith("AdvancedToken: transfer amount must be positive");
            });

            // 测试用例4：不能超过余额转账
            it("不能超过余额转账", async function () {
                const { token, user1, user2 } = await loadFixture(deployTokenFixture);

                const excessiveAmount = ethers.parseEther("2000"); // 超过用户余额

                await expect(
                    token.connect(user1).transfer(user2.address, excessiveAmount)
                ).to.be.revertedWith("AdvancedToken: transfer amount exceeds available balance");
            });

            // 测试用例5：不能超过批准额度转账
            it("不能超过批准额度转账", async function () {
                const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);

                const allowanceAmount = ethers.parseEther("100");
                const transferAmount = ethers.parseEther("150"); // 超过批准额度

                // 设置批准额度
                await token.connect(owner).approve(user1.address, allowanceAmount);

                await expect(
                    token.connect(user1).transferFrom(
                        owner.address,
                        user2.address,
                        transferAmount
                    )
                ).to.be.revertedWith("AdvancedToken: insufficient allowance");
            });
        });

        // 测试组10：所有权管理测试
        describe("所有权管理测试", function () {
            // 测试用例1：验证转让所有权功能
            it("应该允许转让所有权", async function () {
                const { token, owner, user1 } = await loadFixture(deployTokenFixture);

                const tx = await token.connect(owner).transferOwnership(user1.address);
                await tx.wait();

                // 验证所有权已转移
                expect(await token.owner()).to.equal(user1.address);

                // 验证事件触发
                await expect(tx)
                    .to.emit(token, "OwnershipTransferred")
                    .withArgs(owner.address, user1.address);
            });

            // 测试用例2：验证非所有者不能转让所有权
            it("非所有者不能转让所有权", async function () {
                const { token, user1, user2 } = await loadFixture(deployTokenFixture);

                await expect(
                    token.connect(user1).transferOwnership(user2.address)
                ).to.be.revertedWith("AdvancedToken: caller is not the owner");
            });

            // 测试用例3：验证不能将所有权转让给零地址
            it("不能将所有权转让给零地址", async function () {
                const { token, owner } = await loadFixture(deployTokenFixture);

                await expect(
                    token.connect(owner).transferOwnership(ethers.ZeroAddress)
                ).to.be.revertedWith("AdvancedToken: zero address");
            });
        });

        // 测试组11：集成测试（模拟真实业务场景）
        describe("集成测试", function () {
            it("完整业务流测试", async function () {
                const { token, owner, user1, user2, user3, feeCollector } = await loadFixture(deployTokenFixture);

                // 1. 管理员铸币给用户3
                const mintAmount = ethers.parseEther("5000");
                await token.connect(owner).mint(user3.address, mintAmount);

                // 2. 用户3锁定部分代币
                const lockAmount = ethers.parseEther("1000");
                const unlockTime = (await time.latest()) + 86400;
                await token.connect(user3).lockTokens(lockAmount, unlockTime);

                // 3. 用户3转账给用户1（应扣除手续费）
                const transferAmount = ethers.parseEther("500");
                await token.connect(user3).transfer(user1.address, transferAmount);

                // 4. 用户1批量转账
                const batchAmount1 = ethers.parseEther("100");
                const batchAmount2 = ethers.parseEther("150");
                await token.connect(user1).batchTransfer([
                    { to: user2.address, amount: batchAmount1 },
                    { to: owner.address, amount: batchAmount2 }
                ]);

                // 5. 验证最终状态
                const feeCollectorBalance = await token.balanceOf(feeCollector.address);
                const totalSupply = await token.totalSupply();
                const user3Locked = await token.getLockedAmount(user3.address);

                // 断言各种状态
                expect(feeCollectorBalance).to.be.gt(0); // 手续费接收者有余额
                expect(totalSupply).to.be.gt(ethers.parseEther("1000000")); // 总供应量增加了
                expect(user3Locked).to.equal(lockAmount); // 锁定金额正确

                console.log("集成测试完成，所有功能正常");
            });
        });
    });
});