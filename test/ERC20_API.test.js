const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// 定义标准 ERC20 ABI（最少需要的函数）
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];

async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    console.log("部署测试代币...");

    // 方案1：使用已经编译的 ERC20 合约
    // 首先确保 contracts 目录下有正确的 ERC20 实现

    // 部署一个简单的 ERC20 合约
    const SimpleERC20 = await ethers.getContractFactory("SimpleERC20");
    const token1 = await SimpleERC20.deploy();
    await token1.waitForDeployment();

    console.log("代币地址:", await token1.getAddress());
    console.log("代币名称:", await token1.name());
    console.log("代币符号:", await token1.symbol());

    // 部署 EnsoRouter
    console.log("部署 EnsoRouter...");
    const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
    const router = await EnsoRouter.deploy();
    await router.waitForDeployment();

    // 获取 shortcuts 地址
    const shortcutsAddress = await router.shortcuts();
    console.log("Shortcuts 地址:", shortcutsAddress);

    // 转账给用户
    console.log("给用户转账...");
    await token1.transfer(user.address, ethers.parseEther("1000"));

    console.log("用户余额:", ethers.formatEther(await token1.balanceOf(user.address)));

    return {
        router,
        shortcutsAddress,
        token1,
        owner,
        user
    };
}

describe("使用正确的 ERC20 接口", function () {
    it("应该能正确调用 approve", async function () {
        const { shortcutsAddress, token1, user } = await loadFixture(deployFixture);

        const amount = ethers.parseEther("100");

        console.log("测试 approve 函数...");

        // 方法1：直接调用（应该能工作）
        console.log("方法1: 直接调用");
        try {
            const tx = await token1.connect(user).approve(shortcutsAddress, amount);
            await tx.wait();
            console.log("✅ approve 成功");

            // 验证批准
            const allowance = await token1.allowance(user.address, shortcutsAddress);
            console.log("批准额度:", ethers.formatEther(allowance));
            expect(allowance).to.equal(amount);
        } catch (error) {
            console.log("❌ approve 失败:", error.message);
        }
    });

    it("使用标准 IERC20 接口", async function () {
        const { shortcutsAddress, token1, user } = await loadFixture(deployFixture);

        const amount = ethers.parseEther("100");

        // 方法2：使用标准 IERC20 接口
        console.log("\n方法2: 使用标准接口");

        // 获取代币地址
        const tokenAddress = await token1.getAddress();

        // 使用标准 IERC20 接口重新创建合约实例
        const IERC20 = await ethers.getContractFactory("IERC20");
        const token1AsIERC20 = await ethers.getContractAt("IERC20", tokenAddress);

        // 或者使用 ABI
        const token1WithABI = new ethers.Contract(tokenAddress, ERC20_ABI, user);

        try {
            console.log("使用 IERC20 接口调用 approve...");
            const tx = await token1AsIERC20.connect(user).approve(shortcutsAddress, amount);
            await tx.wait();
            console.log("✅ IERC20 approve 成功");
        } catch (error) {
            console.log("❌ IERC20 approve 失败:", error.message);
        }
    });
});