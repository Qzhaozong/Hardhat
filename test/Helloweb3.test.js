// test/Helloweb3.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Helloweb3 合约测试", function () {
    let helloweb3;
    let owner;

    before(async function () {
        // 只部署一次
        [owner] = await ethers.getSigners();
        console.log("部署者地址:", owner.address);

        // 使用最新版本的部署方式
        const Helloweb3 = await ethers.getContractFactory("Helloweb3");
        const contract = await Helloweb3.deploy();

        // 等待部署完成 - 使用 waitForDeployment()
        await contract.waitForDeployment();

        helloweb3 = contract;
        const address = await contract.getAddress();
        console.log("✅ 合约部署成功，地址:", address);
    });

    describe("部署测试", function () {
        it("应该有有效的合约地址", async function () {
            const address = await helloweb3.getAddress();
            expect(address).to.be.a('string');
            expect(address).to.match(/^0x[a-fA-F0-9]{40}$/);
            console.log("合约地址:", address);
        });

        it("应该能获取合约字节码", async function () {
            const address = await helloweb3.getAddress();
            const code = await ethers.provider.getCode(address);
            expect(code).to.not.equal("0x");
            expect(code.length).to.be.greaterThan(100);
            console.log("字节码长度:", code.length);
        });
    });

    describe("合约功能测试", function () {
        it("应该正确初始化 _string 变量", async function () {
            const greeting = await helloweb3._string();
            expect(greeting).to.equal("Hello Web3");
            console.log("_string 值:", greeting);
        });

        it("应该允许公开读取 _string", async function () {
            const [_, addr1] = await ethers.getSigners();
            const greeting = await helloweb3.connect(addr1)._string();
            expect(greeting).to.equal("Hello Web3");
        });
    });
});

// 单独的部署测试
describe("部署过程测试", function () {
    it("应该能正常部署合约", async function () {
        const [deployer] = await ethers.getSigners();

        console.log("\n=== 开始部署测试 ===");
        console.log("部署者:", deployer.address);

        const Helloweb3 = await ethers.getContractFactory("Helloweb3");
        console.log("获取合约工厂成功");

        // 部署合约
        const contract = await Helloweb3.deploy();
        console.log("发送部署交易");

        // 等待部署完成
        await contract.waitForDeployment();
        console.log("✅ 部署完成");

        // 获取地址
        const address = await contract.getAddress();
        console.log("合约地址:", address);

        // 验证合约功能
        const greeting = await contract._string();
        console.log("合约返回:", greeting);

        expect(greeting).to.equal("Hello Web3");
        expect(address).to.match(/^0x[a-fA-F0-9]{40}$/);
    });
});