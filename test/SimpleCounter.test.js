console.log("=== 环境诊断 ===\n");

// 检查以太坊提供者
async function checkEnvironment() {
    try {
        const { ethers } = require("hardhat");

        console.log("1. 检查 Hardhat/Ethers 版本...");
        console.log("   Hardhat 已加载");

        console.log("\n2. 检查网络...");
        const provider = ethers.provider;
        const network = await provider.getNetwork();
        console.log(`   网络名称: ${network.name}`);
        console.log(`   链ID: ${network.chainId}`);

        console.log("\n3. 检查账户...");
        const signers = await ethers.getSigners();
        console.log(`   发现 ${signers.length} 个账户`);
        if (signers.length > 0) {
            console.log(`   第一个账户: ${signers[0].address}`);
            // 修正：getBalance() 需要地址参数
            const balance = await ethers.provider.getBalance(signers[0].address);
            // 修正：使用 ethers.formatEther 而不是 ethers.utils.formatEther
            console.log(`   余额: ${ethers.formatEther(balance)} ETH`);
        }

        console.log("\n4. 检查合约编译...");
        try {
            // 先检查你的合约名，这里假设你有 Counter 合约
            const Counter = await ethers.getContractFactory("Counter");
            console.log("   ✅ 可以获取 Counter 合约工厂");
        } catch (err) {
            console.log("   ❌ 无法获取合约工厂:", err.message);
        }

    } catch (error) {
        console.error("诊断错误:", error.message);
    }
}

checkEnvironment();