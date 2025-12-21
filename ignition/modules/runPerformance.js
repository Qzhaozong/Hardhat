const { ethers } = require("hardhat");

async function runPerformanceTest() {
    console.log("Starting EnsoRouter Performance Tests...\n");

    // 加载合约
    const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const [owner] = await ethers.getSigners();

    // 部署合约
    console.log("Deploying contracts...");
    const router = await EnsoRouter.deploy();
    const token = await MockERC20.deploy();

    console.log("Router deployed to:", router.target);
    console.log("Token deployed to:", token.target);

    // 性能测试参数
    const testCases = [
        { name: "单次ERC20转移", amount: ethers.parseEther("100") },
        { name: "小金额转移", amount: ethers.parseEther("1") },
        { name: "大金额转移", amount: ethers.parseEther("10000") },
    ];

    const results = [];

    for (const testCase of testCases) {
        console.log(`\n测试: ${testCase.name}`);

        // 准备测试数据
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const tokenData = abiCoder.encode(
            ["address", "uint256"],
            [token.target, testCase.amount]
        );

        const tokenIn = {
            tokenType: 1, // ERC20
            data: tokenData
        };

        // 获取shortcuts接口
        const shortcutsAddress = await router.shortcuts();
        const shortcuts = await ethers.getContractAt("MockShortcuts", shortcutsAddress);
        const callData = shortcuts.interface.encodeFunctionData("execute", []);

        // 批准代币
        await token.approve(router.target, testCase.amount);

        // 运行多次测试取平均值
        const iterations = 5;
        let totalGas = 0n;

        for (let i = 0; i < iterations; i++) {
            const tx = await router.routeSingle(tokenIn, callData);
            const receipt = await tx.wait();
            totalGas += receipt.gasUsed;
        }

        const avgGas = totalGas / BigInt(iterations);
        results.push({
            test: testCase.name,
            amount: testCase.amount.toString(),
            avgGas: avgGas.toString()
        });

        console.log(`平均Gas消耗: ${avgGas}`);
    }

    // 打印结果
    console.log("\n=== 性能测试结果 ===");
    console.table(results);

    // 计算效率指标
    console.log("\n=== 效率分析 ===");
    if (results.length >= 2) {
        const smallAmountGas = BigInt(results[0].avgGas);
        const largeAmountGas = BigInt(results[2].avgGas);
        const gasPerUnit = (largeAmountGas - smallAmountGas) /
            (BigInt(results[2].amount) - BigInt(results[0].amount)) * 10000n;

        console.log(`每10000单位代币的额外Gas: ${gasPerUnit}`);
    }
}

// 运行性能测试
runPerformanceTest()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });