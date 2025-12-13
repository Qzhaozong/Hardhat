// test/Counter.test.js
const { expect } = require("chai"); // 引入Chai断言库的expect方法，用于编写测试断言
const { ethers } = require("hardhat"); // 引入Hardhat的ethers工具，用于与以太坊区块链交互
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers"); // 引入Hardhat网络助手，用于加载fixture（测试夹具）

// 定义一个 fixture 来部署合约
async function deployCounterFixture() {
    // 获取合约工厂 - Counter合约的工厂实例，用于部署合约
    const Counter = await ethers.getContractFactory("Counter");

    // 部署合约 - 实际部署Counter合约到测试网络
    const counter = await Counter.deploy();
    await counter.waitForDeployment(); // 等待合约部署完成

    // 获取测试账户 - 从Hardhat网络获取4个测试账户（包含私钥的钱包）
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();

    // 返回部署的合约实例和测试账户，供测试用例使用
    return { counter, owner, addr1, addr2, addr3 };
}

// 测试套件开始 - 描述Counter合约的测试
describe("Counter Contract", function () {
    // 部署相关测试
    describe("Deployment", function () {
        // 测试用例：初始计数应为0
        it("Should set the initial count to 0", async function () {
            const { counter } = await loadFixture(deployCounterFixture); // 加载fixture，获取合约实例
            const count = await counter.count(); // 调用合约的public变量count() getter方法
            expect(count).to.equal(0); // 断言计数等于0
        });

        // 测试用例：应有有效的合约地址
        it("Should have a valid contract address", async function () {
            const { counter } = await loadFixture(deployCounterFixture);
            const address = await counter.getAddress(); // 获取合约地址
            expect(address).to.be.a("string"); // 断言地址是字符串类型
            expect(address).to.match(/^0x[a-fA-F0-9]{40}$/); // 断言地址符合以太坊地址格式（0x开头，40位十六进制）
        });

        // 测试用例：部署时余额应为0
        it("Should deploy with zero balance", async function () {
            const { counter } = await loadFixture(deployCounterFixture);
            const address = await counter.getAddress();
            const balance = await ethers.provider.getBalance(address); // 通过provider获取合约余额
            expect(balance).to.equal(0); // 断言余额为0
        });
    });

    // get()函数测试
    describe("get() Function", function () {
        // 测试用例：应返回当前计数
        it("Should return the current count", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 初始值为 0
            expect(await counter.get()).to.equal(0); // 调用get()方法，断言返回0

            // 递增后检查
            await counter.inc(); // 调用inc()递增计数
            expect(await counter.get()).to.equal(1); // 断言get()返回1

            // 再次递增
            await counter.inc();
            expect(await counter.get()).to.equal(2); // 断言get()返回2
        });

        // 测试用例：应是view函数（读取无gas消耗）
        it("Should be a view function (no gas cost for read)", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 估计 gas 消耗 - estimateGas方法模拟调用并返回预估的gas用量
            const gasEstimate = await counter.get.estimateGas();
            console.log("get() gas estimate:", gasEstimate.toString()); // 打印gas预估

            expect(gasEstimate).to.be.lessThan(30000); // 断言gas消耗小于30000（view函数应该消耗很少gas）
        });

        // 测试用例：应与公共变量返回值相同
        it("Should return same value as public variable", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            const fromGet = await counter.get(); // 通过get()方法获取
            const fromVariable = await counter.count(); // 通过public变量自动生成的getter获取

            expect(fromGet).to.equal(fromVariable); // 断言两者相等
        });
    });

    // inc()函数测试
    describe("inc() Function", function () {
        // 测试用例：应将计数增加1
        it("Should increment count by 1", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 从 0 开始
            expect(await counter.count()).to.equal(0); // 验证初始值

            // 第一次递增
            await counter.inc(); // 调用inc()
            expect(await counter.count()).to.equal(1); // 断言计数变为1

            // 第二次递增
            await counter.inc();
            expect(await counter.count()).to.equal(2); // 断言计数变为2
        });

        // 测试用例：应允许多个用户调用inc()
        it("Should allow multiple users to call inc()", async function () {
            const { counter, owner, addr1, addr2 } = await loadFixture(deployCounterFixture);

            // 所有者递增 - connect()方法用指定账户调用合约
            await counter.connect(owner).inc();
            expect(await counter.count()).to.equal(1);

            // 地址1递增
            await counter.connect(addr1).inc();
            expect(await counter.count()).to.equal(2);

            // 地址2递增
            await counter.connect(addr2).inc();
            expect(await counter.count()).to.equal(3);
        });

        // 测试用例：应有合理的gas使用量
        it("Should have reasonable gas usage", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            const tx = await counter.inc(); // 发送交易
            const receipt = await tx.wait(); // 等待交易确认并获取收据

            console.log("inc() gas used:", receipt.gasUsed.toString()); // 打印实际使用的gas
            expect(receipt.gasUsed).to.be.lessThan(50000); // 断言gas使用小于50000
        });

        // 测试用例：应能处理快速连续递增
        it("Should handle rapid successive increments", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            const iterations = 10; // 设置迭代次数为10
            for (let i = 0; i < iterations; i++) {
                await counter.inc(); // 循环调用inc()
            }

            expect(await counter.count()).to.equal(iterations); // 断言最终计数等于迭代次数
        });
    });

    // dec()函数测试
    describe("dec() Function", function () {
        // 测试用例：应将计数减少1
        it("Should decrement count by 1", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 先递增到 3
            await counter.inc();
            await counter.inc();
            await counter.inc();
            expect(await counter.count()).to.equal(3); // 验证递增结果

            // 递减
            await counter.dec(); // 调用dec()
            expect(await counter.count()).to.equal(2); // 断言计数变为2

            await counter.dec();
            expect(await counter.count()).to.equal(1); // 断言计数变为1

            await counter.dec();
            expect(await counter.count()).to.equal(0); // 断言计数变为0
        });

        // 测试用例：当从0递减时应回滚交易
        it("Should revert when trying to decrement from 0", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 初始为 0，递减应该失败
            await expect(counter.dec()).to.be.reverted; // expect(...).to.be.reverted断言交易会被回滚
        });

        // 测试用例：应能处理多个用户调用dec()
        it("Should handle multiple users calling dec()", async function () {
            const { counter, owner, addr1, addr2 } = await loadFixture(deployCounterFixture);

            // 先递增到 5
            for (let i = 0; i < 5; i++) {
                await counter.inc();
            }
            expect(await counter.count()).to.equal(5); // 验证初始计数

            // 不同用户递减
            await counter.connect(owner).dec();
            expect(await counter.count()).to.equal(4);

            await counter.connect(addr1).dec();
            expect(await counter.count()).to.equal(3);

            await counter.connect(addr2).dec();
            expect(await counter.count()).to.equal(2);
        });
    });

    // 集成测试
    describe("Integration Tests", function () {
        // 测试用例：混合操作下应保持正确状态
        it("Should maintain correct state with mixed operations", async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 操作序列：inc, inc, dec, inc, dec, dec (应该失败)
            await counter.inc();
            expect(await counter.count()).to.equal(1);

            await counter.inc();
            expect(await counter.count()).to.equal(2);

            await counter.dec();
            expect(await counter.count()).to.equal(1);

            await counter.inc();
            expect(await counter.count()).to.equal(2);

            await counter.dec();
            expect(await counter.count()).to.equal(1);

            await counter.dec();
            expect(await counter.count()).to.equal(0);

            // 现在应该失败 - 因为计数已经是0
            await expect(counter.dec()).to.be.reverted; // 断言这次dec()会回滚
        });

        // 测试用例：应正确处理并发操作
        it("Should handle concurrent operations correctly", async function () {
            const { counter, addr1, addr2 } = await loadFixture(deployCounterFixture);

            // 同时启动多个递增操作 - 注意：这里不是真正的并发，而是按顺序发送交易
            const tx1 = counter.connect(addr1).inc(); // 返回Promise，不等待
            const tx2 = counter.connect(addr2).inc(); // 返回Promise，不等待
            const tx3 = counter.inc(); // 返回Promise，不等待

            // 等待所有交易完成 - Promise.all等待所有Promise解决
            await Promise.all([tx1, tx2, tx3]);

            expect(await counter.count()).to.equal(3); // 断言最终计数为3
        });
    });
});