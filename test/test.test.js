const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    console.log("1. 部署测试代币...");
    // 使用标准ERC20而不是Mock
    const ERC20 = await ethers.getContractFactory("ERC20");
    const token1 = await ERC20.deploy("Test Token", "TEST", owner.address);
    await token1.waitForDeployment();

    console.log("2. 部署EnsoRouter...");
    const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
    const router = await EnsoRouter.deploy();
    await router.waitForDeployment();

    console.log("3. 获取shortcuts地址...");
    const shortcutsAddress = await router.shortcuts();

    console.log("4. 获取shortcuts合约实例...");
    let shortcuts;
    try {
        shortcuts = await ethers.getContractAt("EnsoShortcuts", shortcutsAddress);
    } catch (e) {
        console.log("无法获取shortcuts实例，使用基础合约...");
        shortcuts = await ethers.getContractAt("Contract", shortcutsAddress);
    }

    console.log("5. 给用户铸造代币...");
    // 使用ERC20的mint函数（如果存在）
    try {
        await token1.mint(user.address, ethers.parseEther("1000"));
    } catch (e) {
        console.log("代币没有mint函数，使用transfer...");
        await token1.transfer(user.address, ethers.parseEther("1000"));
    }

    return { router, shortcuts, token1, owner, user, shortcutsAddress };
}

describe("深度诊断批准问题", function () {
    it("步骤1: 验证所有地址", async function () {
        const { router, shortcuts, token1, user, shortcutsAddress } = await loadFixture(deployFixture);

        console.log("\n=== 地址验证 ===");
        console.log("User address:", user.address);
        console.log("Router address:", await router.getAddress());
        console.log("Shortcuts address (from variable):", await shortcuts.getAddress());
        console.log("Shortcuts address (from router):", shortcutsAddress);
        console.log("Token address:", await token1.getAddress());

        // 验证两个shortcuts地址是否一致
        expect(await shortcuts.getAddress()).to.equal(shortcutsAddress);

        console.log("\n=== 余额检查 ===");
        const userBalance = await token1.balanceOf(user.address);
        console.log("User token balance:", ethers.formatEther(userBalance));

        console.log("\n=== 批准检查 ===");
        // 检查所有可能的批准关系
        const checkAndLogAllowance = async (from, to, description) => {
            const allowance = await token1.allowance(from, to);
            console.log(`${description}: ${ethers.formatEther(allowance)}`);
            return allowance;
        };

        const allowance1 = await checkAndLogAllowance(
            user.address,
            await router.getAddress(),
            "User → Router"
        );

        const allowance2 = await checkAndLogAllowance(
            user.address,
            shortcutsAddress,
            "User → Shortcuts"
        );

        const allowance3 = await checkAndLogAllowance(
            user.address,
            await shortcuts.getAddress(),
            "User → Shortcuts (from instance)"
        );

        console.log("\n所有检查完成");
    });

    it("步骤2: 执行批准并验证", async function () {
        const { router, shortcuts, token1, user, shortcutsAddress } = await loadFixture(deployFixture);

        const amount = ethers.parseEther("100");

        console.log("\n=== 执行批准 ===");
        console.log("批准金额:", ethers.formatEther(amount));
        console.log("批准给地址:", shortcutsAddress);

        // 执行批准
        const approveTx = await token1.connect(user).approve(shortcutsAddress, amount);
        await approveTx.wait();

        console.log("批准交易哈希:", approveTx.hash);

        // 验证批准
        const newAllowance = await token1.allowance(user.address, shortcutsAddress);
        console.log("批准后额度:", ethers.formatEther(newAllowance));

        expect(newAllowance).to.equal(amount);
        console.log("✅ 批准验证成功");
    });

    it("步骤3: 手动测试代币转移", async function () {
        const { shortcuts, token1, user, shortcutsAddress } = await loadFixture(deployFixture);

        const amount = ethers.parseEther("100");

        console.log("\n=== 手动测试代币转移 ===");

        // 1. 批准
        await token1.connect(user).approve(shortcutsAddress, amount);

        // 2. 手动调用 transferFrom（模拟router的行为）
        console.log("手动调用 transferFrom...");
        try {
            const tx = await token1.connect(user).transferFrom(
                user.address,
                shortcutsAddress,
                amount
            );
            const receipt = await tx.wait();
            console.log("✅ 手动转移成功, gas:", receipt.gasUsed.toString());
        } catch (error) {
            console.log("❌ 手动转移失败:", error.message);
            console.log("完整错误:", error);
        }
    });

    it("步骤4: 测试完整流程", async function () {
        const { router, shortcuts, token1, user, shortcutsAddress } = await loadFixture(deployFixture);

        const amount = ethers.parseEther("100");

        console.log("\n=== 完整流程测试 ===");

        // 1. 批准
        console.log("1. 执行批准...");
        await token1.connect(user).approve(shortcutsAddress, amount);

        const allowance = await token1.allowance(user.address, shortcutsAddress);
        console.log("批准额度:", ethers.formatEther(allowance));

        // 2. 准备代币数据
        console.log("2. 准备代币数据...");
        const tokenData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [await token1.getAddress(), amount]
        );

        const tokenIn = {
            tokenType: 1, // ERC20
            data: tokenData
        };

        // 3. 查看router内部的_transfer函数逻辑
        console.log("3. 检查router代码...");
        const routerCode = await ethers.provider.getCode(await router.getAddress());
        console.log("Router代码长度:", routerCode.length);

        // 4. 执行路由
        console.log("4. 执行routeSingle...");
        const callData = "0x61461954";

        try {
            const tx = await router.connect(user).routeSingle(tokenIn, callData);
            console.log("交易已发送，哈希:", tx.hash);

            const receipt = await tx.wait();
            console.log("✅ 交易成功!");
            console.log("状态:", receipt.status);
            console.log("Gas used:", receipt.gasUsed.toString());

            // 检查事件
            console.log("事件数量:", receipt.logs.length);
            for (let i = 0; i < receipt.logs.length; i++) {
                console.log(`事件 ${i}:`, receipt.logs[i]);
            }

        } catch (error) {
            console.log("❌ 交易失败!");
            console.log("错误信息:", error.message);

            if (error.data) {
                console.log("错误数据:", error.data);

                // 尝试解码错误
                try {
                    const iface = new ethers.Interface([
                        "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)"
                    ]);
                    const decoded = iface.parseError(error.data);
                    console.log("解码后的错误:", decoded);
                    console.log("Spender:", decoded.args[0]);
                    console.log("Current allowance:", decoded.args[1].toString());
                    console.log("Needed amount:", decoded.args[2].toString());
                } catch (decodeError) {
                    console.log("无法解码错误:", decodeError.message);
                }
            }

            // 重新抛出错误使测试失败
            throw error;
        }
    });
});