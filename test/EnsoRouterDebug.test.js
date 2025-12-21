const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EnsoRouter 调试测试", function () {
    let router;
    let shortcuts;
    let token1;
    let owner;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        console.log("\n=== 开始部署合约 ===");

        // 1. 首先部署 MockShortcuts 来测试
        const MockShortcuts = await ethers.getContractFactory("MockShortcuts");
        console.log("部署 MockShortcuts...");
        const mockShortcuts = await MockShortcuts.deploy(owner.address);
        await mockShortcuts.waitForDeployment();
        console.log("MockShortcuts 已部署到:", await mockShortcuts.getAddress());

        // 2. 部署 MockERC20
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        console.log("部署 MockERC20...");
        token1 = await MockERC20.deploy();
        await token1.waitForDeployment();
        console.log("MockERC20 已部署到:", await token1.getAddress());

        // 3. 部署 EnsoRouter
        const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
        console.log("部署 EnsoRouter...");
        router = await EnsoRouter.deploy();
        await router.waitForDeployment();
        console.log("EnsoRouter 已部署到:", await router.getAddress());

        // 4. 获取 shortcuts 地址
        const shortcutsAddress = await router.shortcuts();
        console.log("Shortcuts 地址:", shortcutsAddress);

        // 5. 验证 shortcuts 合约
        shortcuts = await ethers.getContractAt("MockShortcuts", shortcutsAddress);
        const routerFromShortcuts = await shortcuts.router();
        console.log("Shortcuts 中的 router 地址:", routerFromShortcuts);

        // 6. 给 owner 一些代币
        await token1.transfer(owner.address, ethers.parseEther("1000"));
        console.log("给 owner 分配了 1000 TEST 代币");

        console.log("=== 合约部署完成 ===\n");
    });

    it("测试 Shortcuts 合约是否正常工作", async function () {
        console.log("\n=== 测试 Shortcuts 合约 ===");

        // 测试直接调用 shortcuts
        const callData = shortcuts.interface.encodeFunctionData("execute", []);
        console.log("调用数据:", callData);

        try {
            const tx = await shortcuts.execute({ value: 0 });
            const receipt = await tx.wait();
            console.log("Shortcuts.execute() 成功!");
            console.log("Gas 消耗:", receipt.gasUsed);

            const callCount = await shortcuts.callCount();
            console.log("调用次数:", callCount.toString());
        } catch (error) {
            console.error("Shortcuts.execute() 失败:", error.message);
            throw error;
        }
    });

    it("测试 EnsoRouter 的 shortcuts 地址是否正确", async function () {
        console.log("\n=== 验证 shortcuts 地址 ===");

        const shortcutsAddress = await router.shortcuts();
        console.log("Router 中的 shortcuts 地址:", shortcutsAddress);

        // 检查这个地址是否有代码
        const code = await ethers.provider.getCode(shortcutsAddress);
        console.log("Shortcuts 合约代码长度:", code.length);

        if (code === "0x") {
            console.error("错误: Shortcuts 地址没有代码!");
            throw new Error("Shortcuts 合约未部署");
        } else {
            console.log("Shortcuts 合约已部署，代码长度:", code.length - 2, "字节");
        }
    });

    it("测试简单的 ERC20 路由", async function () {
        console.log("\n=== 测试简单 ERC20 路由 ===");

        const amount = ethers.parseEther("100");

        // 创建代币数据
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const tokenData = abiCoder.encode(
            ["address", "uint256"],
            [await token1.getAddress(), amount]
        );

        const tokenIn = {
            tokenType: 1, // ERC20
            data: tokenData
        };

        console.log("代币地址:", await token1.getAddress());
        console.log("代币数量:", amount.toString());

        // 批准代币
        console.log("批准代币...");
        await token1.approve(router.target, amount);

        const allowance = await token1.allowance(owner.address, router.target);
        console.log("批准额度:", allowance.toString());

        // 创建调用数据
        console.log("创建调用数据...");
        const callData = shortcuts.interface.encodeFunctionData("execute", []);
        console.log("调用数据长度:", callData.length);

        // 检查调用数据是否正确
        try {
            // 先测试直接调用
            console.log("测试直接调用 shortcuts...");
            const directTx = await shortcuts.execute();
            await directTx.wait();
            console.log("直接调用成功");
        } catch (error) {
            console.error("直接调用失败:", error.message);
        }

        // 执行路由
        console.log("\n执行路由...");
        try {
            const tx = await router.routeSingle(tokenIn, callData);
            console.log("交易已发送，等待确认...");
            const receipt = await tx.wait();
            console.log("交易成功!");
            console.log("交易哈希:", receipt.hash);
            console.log("Gas 消耗:", receipt.gasUsed);
            console.log("状态:", receipt.status === 1 ? "成功" : "失败");

            // 检查调用次数
            const callCount = await shortcuts.callCount();
            console.log("Shortcuts 调用次数:", callCount.toString());

        } catch (error) {
            console.error("\n交易失败详情:");
            console.error("错误信息:", error.message);

            // 尝试获取更多错误信息
            if (error.receipt) {
                console.error("交易收据:", error.receipt);
            }

            if (error.transaction) {
                console.error("交易详情:", error.transaction);
            }

            // 检查错误数据
            if (error.data) {
                console.error("错误数据:", error.data);
                try {
                    const decodedError = shortcuts.interface.parseError(error.data);
                    console.error("解码后的错误:", decodedError);
                } catch (e) {
                    console.error("无法解码错误数据");
                }
            }

            throw error;
        }
    });

    it("测试 _execute 函数的低级别调用", async function () {
        console.log("\n=== 测试 _execute 函数 ===");

        // 直接调用 shortcuts 来确保它能工作
        const callData = shortcuts.interface.encodeFunctionData("execute", []);

        console.log("直接调用 shortcuts...");
        try {
            const tx = await owner.sendTransaction({
                to: await shortcuts.getAddress(),
                data: callData,
                value: 0
            });
            await tx.wait();
            console.log("直接调用成功");
        } catch (error) {
            console.error("直接调用失败:", error.message);
        }

        // 测试通过 router 调用
        console.log("\n通过 router 调用...");

        // 我们需要模拟一个转账来测试
        const amount = ethers.parseEther("10");
        await token1.approve(router.target, amount);

        const tokenData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [await token1.getAddress(), amount]
        );

        const tokenIn = {
            tokenType: 1,
            data: tokenData
        };

        try {
            // 使用 callStatic 来模拟执行而不真正发送交易
            console.log("使用 callStatic 模拟执行...");
            const result = await router.routeSingle.staticCall(tokenIn, callData);
            console.log("模拟执行成功，结果:", result);
        } catch (error) {
            console.error("模拟执行失败:", error.message);

            // 检查 revert 原因
            if (error.reason) {
                console.error("Revert 原因:", error.reason);
            }

            if (error.data) {
                console.error("错误数据:", error.data);
            }
        }
    });
});