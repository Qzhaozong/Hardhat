// 导入测试方法和fixture测试夹具
const { expect } = require('chai'); // 引入Chai断言库的expect方法，用于编写测试断言
const { ethers } = require('hardhat');  // 引入Hardhat 的ethers工具，用于与以太坊区块链交互
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");    // 引入hardhat 网络助手，用于加载fixture 测试夹具
const { copyRequest } = require('ethers');

// 定义一个fixture 来部署合约
async function deployCounterFixture() {
    // 获取合约工厂，Counter合约的工厂实例，用来部署合约
    const Counter = await ethers.getContractFactory('Counter');

    // 部署合约. 将合约部署至测试环境
    const counter = await Counter.deploy();
    await counter.waitForDeployment();  // 等待合约部署完成
    // 获取合约部署后的地址
    const address = await counter.getAddress();
    console.log('counter合约部署完成，合约地址为：', address);
    // 获取测试帐户，从hardhat网络中获取多个测试帐户，包括私钥的钱包
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();
    console.log('owner:', owner.address);
    console.log('addr1:', addr1.address);
    console.log('addr2:', addr2.address);
    console.log('addr3:', addr3.address);

    return { counter, owner, addr1, addr2, addr3, address };
};
describe('Counter 合约测试', function () {
    // 部署相关测试
    describe('初始化查看', function () {
        // 初始化数为0的测试用例
        it('初始化值应该是0', async function () {
            const { counter } = await loadFixture(deployCounterFixture);    // 加载fixture 夹具，获取合约实例
            const count = await counter.count();    // 调用合约中的public方法 
            expect(count).to.equal(0)   // 断言初始化值是否为0
            console.log('当前初始化值为：', count);
        });
        it('测试合约地址是否有效', async function () {
            const { address } = await loadFixture(deployCounterFixture);
            expect(address).to.be.a('string');
            expect(address).to.match(/^0x[a-fA-F0-9]{40}$/);
        });
        // 测试用例：部署是余额应该为0
        it('余额应该为0', async function () {
            const { address } = await loadFixture(deployCounterFixture);    // 加载fixture 夹具
            const balance = await ethers.provider.getBalance(address);  // 通过provider 获取 合约余额
            expect(balance).to.equal(0);
        });
    });
    // 合约中的get函数测试
    describe('测试合约中的get函数', function () {
        // 递增测试
        it('递增测试', async function () {
            const { counter } = await loadFixture(deployCounterFixture);
            // 初始值应该为0
            expect(await counter.get()).to.equal(0);

            // 递增后检查
            await counter.inc();
            expect(await counter.get()).to.equal(1);    // 递增后应该返回1

            // 再次递增后检查
            await counter.inc();
            expect(await counter.get()).to.equal(2)    // 递增后应该返回2
        });
        it('调用view 函数 不会产生gas费用', async function () {
            const { counter } = await loadFixture(deployCounterFixture);

            // 估计gas费用消耗，--estimateGas方法模拟调用并返回预估的gas用量
            const gasEstimate = await counter.get.estimateGas();
            console.log('打印gas消耗', gasEstimate.toString());
            expect(gasEstimate).to.be.lessThan(30000);  // 断言gas消耗小雨30000(view函数应该消耗很少gas)
        });
        // 测试公共变量返回相同值
        it('应与公共变量返回值相同', async function () {
            const { counter } = await loadFixture(deployCounterFixture);
            const fromGet = await counter.get();    // 通过get方法获取
            const fromVariable = await counter.count(); // 通过public 变量自动生成的getter获取
            expect(fromGet).to.equal(fromVariable); // 断言两者相等
        });
    });
    // 单元测试
    // inc()函数测试
    describe('测试inc()函数', function () {
        it('测试inc()函数', async function () {
            const { counter } = await loadFixture(deployCounterFixture);
            // 判断初始值为0
            expect(await counter.count()).to.equal(0);
            // 第一次递增
            await counter.inc();
            expect(await counter.count()).to.equal(1);

            // 第二次调用
            await counter.inc();
            expect(await counter.count()).to.equal(2)
        });
        it('测试多个用户调用inc()', async function () {
            const { owner, addr1, addr2, addr3, counter } = await loadFixture(deployCounterFixture);
            // 所有者进行调用
            await counter.connect(owner).inc();
            expect(await counter.count()).to.equal(1)

            await counter.connect(addr1).inc();
            expect(await counter.count()).to.equal(2);

            await counter.connect(addr2).inc();
            expect(await counter.count()).to.equal(3)

            await counter.connect(addr3).inc();
            expect(await counter.count()).to.equal(4);
        });
        it('测试应有合理的gas使用量', async function () {
            const { counter } = await loadFixture(deployCounterFixture);
            const tx = await counter.inc();
            const receipt = await tx.wait();
            console.log('打印inc()调用时消耗的gas', receipt.gasUsed.toString());
            expect(receipt.gasUsed).to.be.lessThan(50000);
        });
        it('应能处理快速连续递增', async function () {

            const { counter } = await loadFixture(deployCounterFixture);
            const iterations = 10;
            for (let i = 0; i < iterations; i++) {
                await counter.inc();
            }
            expect(await counter.count()).to.equal(iterations)
        });
    });
    describe('')





})