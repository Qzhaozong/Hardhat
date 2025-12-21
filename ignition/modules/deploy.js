async function main() {
    console.log("Deploying EnsoRouter and mock contracts for testing...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // 部署Mock代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const MockERC1155 = await ethers.getContractFactory("MockERC1155");

    const token1 = await MockERC20.deploy();
    const token2 = await MockERC20.deploy();
    const nft1 = await MockERC721.deploy();
    const multiToken = await MockERC1155.deploy();

    console.log("MockERC20 deployed to:", token1.target);
    console.log("MockERC20 deployed to:", token2.target);
    console.log("MockERC721 deployed to:", nft1.target);
    console.log("MockERC1155 deployed to:", multiToken.target);

    // 部署EnsoRouter
    const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
    const router = await EnsoRouter.deploy();

    console.log("EnsoRouter deployed to:", router.target);
    console.log("Shortcuts deployed to:", await router.shortcuts());

    // 铸造一些代币用于测试
    await token1.transfer(deployer.address, ethers.parseEther("10000"));
    await nft1.mint(deployer.address);
    await nft1.mint(deployer.address);
    await multiToken.mint(deployer.address, 1, 1000);
    await multiToken.mint(deployer.address, 2, 500);

    console.log("Deployment completed!");
    console.log("\nContract addresses:");
    console.log("Router:", router.target);
    console.log("Token1:", token1.target);
    console.log("Token2:", token2.target);
    console.log("NFT1:", nft1.target);
    console.log("ERC1155:", multiToken.target);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});