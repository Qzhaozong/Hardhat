// 引入Chai断言库的expect方法，用于编写测试断言
const { expect } = require("chai");

// 引入Hardhat的ethers工具，用于与以太坊区块链交互
const { ethers } = require("hardhat");

// 引入Hardhat网络助手，用于加载fixture（测试夹具）以优化测试性能
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// 定义一个fixture函数来部署合约并设置测试环境
async function deployCounterFixture() {
    // 获取合约工厂，MyContract合约的工厂实例，用于部署合约
    // ethers.getContractFactory()根据合约名返回一个ContractFactory实例
    const MyContract = await ethers.getContractFactory('MyContract');

    // 使用工厂部署合约到测试网络
    const myContract = await MyContract.deploy();
    // 等待合约部署完成，确保合约地址可用
    await myContract.waitForDeployment()

    // 获取测试账户，返回一个包含所有可用签名者的数组
    // 通常第一个账户是部署者/所有者
    const [owner, user] = await ethers.getSigners();

    // 返回包含合约实例和测试账户的对象，供测试用例使用
    return { myContract, owner, user }
}

// 测试套件开始 - 描述MyContract合约的测试
describe("MyContract 合约测试", function () {
    // 部署相关测试的分组
    describe('部署相关测试', function () {
        // 测试用例：应该允许第一次成功调用initialize()
        it('应该允许第一次成功调用 initialize()', async function () {
            // 加载fixture，获取部署好的合约实例
            const { myContract } = await loadFixture(deployCounterFixture);

            // 断言initialize()函数调用不会被回退
            // expect().to.not.be.reverted 验证交易不会失败
            await expect(myContract.initialize()).to.not.be.reverted;

            // 断言isInitialized()函数返回true，验证合约已初始化
            expect(await myContract.isInitialized()).to.be.true
        });

        // 测试用例：当第二次调用initialize()时，应该被回退
        it('当第二次调用 initialize() 时，应该被回退', async function () {
            const { myContract } = await loadFixture(deployCounterFixture);

            // 第一次调用initialize()，应该是成功的
            await myContract.initialize();

            // 第二次调用initialize()，应该被回退
            // expect().to.be.revertedWith("Already initialized") 验证：
            // 1. 交易会被回退（失败）
            // 2. 回退的原因字符串包含"Already initialized"
            await expect(myContract.initialize()).to.be.revertedWith("Already initialized");
        });

        // 测试用例：任何账户（包括所有者和其他人）都不能调用第二次
        it("任何账户（包括所有者和其他人）都不能调用第二次", async function () {
            const { myContract, owner, user } = await loadFixture(deployCounterFixture);

            // 所有者账户首次调用initialize()，应该是成功的
            await myContract.connect(owner).initialize();

            // 其他用户（非所有者）尝试调用initialize()
            // 应该也被回退，显示相同的错误信息
            // 这验证了初始化保护对所有人都有效，而不仅仅是所有者
            await expect(myContract.connect(user).initialize()).to.be.revertedWith("Already initialized");
        });
    });
})