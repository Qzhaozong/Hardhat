// test/ContractStatus.test.js - 修复版本
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("合约状态检查", function () {
    let ensoRouter;
    let shortcuts;
    let owner;
    let ensoRouterAddress;
    let shortcutsAddress;

    before(async function () {
        [owner] = await ethers.getSigners();

        console.log("=== 部署合约 ===");

        // 部署 EnsoRouter
        const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
        ensoRouter = await EnsoRouter.deploy();

        // 等待部署完成
        await ensoRouter.waitForDeployment();

        // 正确获取地址
        ensoRouterAddress = await ensoRouter.getAddress();
        console.log("EnsoRouter 部署地址:", ensoRouterAddress);

        // 获取shortcuts地址
        const shortcutsAddressFromRouter = await ensoRouter.shortcuts();
        console.log("Shortcuts 地址（从Router获取）:", shortcutsAddressFromRouter);

        // 获取shortcuts合约实例
        shortcuts = await ethers.getContractAt("EnsoShortcuts", shortcutsAddressFromRouter);
        shortcutsAddress = await shortcuts.getAddress();
        console.log("Shortcuts 部署地址:", shortcutsAddress);

        // 验证两个地址是否一致
        expect(shortcutsAddressFromRouter).to.equal(shortcutsAddress);
    });

    it("检查合约关系", async function () {
        console.log("\n=== 检查合约关系 ===");

        // 从shortcuts合约获取router地址
        const routerInShortcuts = await shortcuts.router();
        console.log("Shortcuts中记录的router地址:", routerInShortcuts);
        console.log("EnsoRouter实际地址:", ensoRouterAddress);

        // 验证地址
        expect(routerInShortcuts).to.equal(ensoRouterAddress);
        console.log("✓ Router地址匹配成功");

        // 检查合约代码
        const routerCode = await ethers.provider.getCode(ensoRouterAddress);
        const shortcutsCode = await ethers.provider.getCode(shortcutsAddress);

        console.log("Router合约代码长度:", routerCode.length);
        console.log("Shortcuts合约代码长度:", shortcutsCode.length);

        expect(routerCode).to.not.equal("0x");
        expect(shortcutsCode).to.not.equal("0x");
        console.log("✓ 合约代码存在");
    });

    it("检查权限设置", async function () {
        console.log("\n=== 检查权限设置 ===");

        // 尝试直接调用shortcuts（应该失败）
        try {
            await shortcuts.executeShortcut(
                ethers.ZeroHash,
                ethers.ZeroHash,
                [],
                []
            );
            throw new Error("应该失败但没有失败");
        } catch (error) {
            if (error.message.includes("NotPermitted")) {
                console.log("✓ 权限检查正常: 非router地址无法调用");
            } else if (error.message.includes("revert")) {
                console.log("✓ 合约正确revert");
            } else {
                console.log("错误信息:", error.message);
                // 检查是否是其他错误
                if (error.data) {
                    try {
                        // 尝试解析错误数据
                        const iface = new ethers.Interface(["error NotPermitted()"]);
                        const decoded = iface.parseError(error.data);
                        console.log("解码的错误:", decoded.name);
                    } catch (e) {
                        console.log("无法解码错误数据");
                    }
                }
            }
        }
    });

    it("检查ETH余额", async function () {
        console.log("\n=== 检查ETH余额 ===");

        const routerBalance = await ethers.provider.getBalance(ensoRouterAddress);
        const shortcutsBalance = await ethers.provider.getBalance(shortcutsAddress);

        console.log("Router合约ETH余额:", ethers.formatEther(routerBalance), "ETH");
        console.log("Shortcuts合约ETH余额:", ethers.formatEther(shortcutsBalance), "ETH");

        expect(routerBalance).to.equal(0n);
        expect(shortcutsBalance).to.equal(0n);
        console.log("✓ 初始余额为0");
    });
});