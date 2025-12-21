const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// 性能测试工具类
class PerformanceTest {
    constructor() {
        this.gasUsedMap = new Map();
    }

    async startMeasurement(testName) {
        const startBlock = await ethers.provider.getBlock("latest");
        const startGas = startBlock.gasUsed;
        const startTime = Date.now();

        return async () => {
            const endBlock = await ethers.provider.getBlock("latest");
            const gasUsed = endBlock.gasUsed.sub(startGas).toNumber();
            const timeUsed = Date.now() - startTime;

            if (!this.gasUsedMap.has(testName)) {
                this.gasUsedMap.set(testName, []);
            }
            this.gasUsedMap.get(testName).push(gasUsed);

            console.log(`[${testName}] Gas: ${gasUsed}, Time: ${timeUsed}ms`);
            return gasUsed;
        };
    }

    printSummary() {
        console.log("\n=== 性能测试汇总 ===");
        for (const [testName, values] of this.gasUsedMap.entries()) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            console.log(`${testName}:`);
            console.log(`  平均Gas: ${avg.toFixed(0)}`);
            console.log(`  最小Gas: ${min}`);
            console.log(`  最大Gas: ${max}`);
            console.log(`  测试次数: ${values.length}`);
            console.log(`  波动率: ${((max - min) / avg * 100).toFixed(2)}%`);
        }
    }
}

// 辅助函数：创建代币数据结构
function createTokenData(tokenType, tokenAddress, amountOrId, erc1155Amount) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    let data;

    switch (tokenType) {
        case 0: // Native
            data = abiCoder.encode(["uint256"], [amountOrId || 0n]);
            break;
        case 1: // ERC20
            data = abiCoder.encode(
                ["address", "uint256"],
                [tokenAddress, amountOrId || 0n]
            );
            break;
        case 2: // ERC721
            data = abiCoder.encode(
                ["address", "uint256"],
                [tokenAddress, amountOrId || 0n]
            );
            break;
        case 3: // ERC1155
            data = abiCoder.encode(
                ["address", "uint256", "uint256"],
                [tokenAddress, amountOrId || 0n, erc1155Amount || 0n]
            );
            break;
        default:
            throw new Error("Unsupported token type");
    }

    return {
        tokenType,
        data
    };
}

describe("EnsoRouter Performance Tests", function () {
    let router;
    let shortcuts;
    let token1;
    let token2;
    let nft1;
    let multiToken;
    let owner;
    let user1;
    let user2;
    let perfTest;

    // 部署夹具
    async function deployFixture() {
        [owner, user1, user2] = await ethers.getSigners();
        perfTest = new PerformanceTest();

        // 部署测试代币
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const MockERC721 = await ethers.getContractFactory("MockERC721");
        const MockERC1155 = await ethers.getContractFactory("MockERC1155");
        const MockShortcuts = await ethers.getContractFactory("MockShortcuts");
        const EnsoRouter = await ethers.getContractFactory("EnsoRouter");

        token1 = await MockERC20.deploy();
        token2 = await MockERC20.deploy();
        nft1 = await MockERC721.deploy();
        multiToken = await MockERC1155.deploy();

        router = await EnsoRouter.deploy();
        const shortcutsAddress = await router.shortcuts();
        shortcuts = MockShortcuts.attach(shortcutsAddress);

        // 给用户分配代币
        await token1.transfer(user1.address, ethers.parseEther("1000"));
        await token2.transfer(user1.address, ethers.parseEther("1000"));

        // 铸造NFT
        await nft1.mint(user1.address);
        await nft1.mint(user1.address);
        await multiToken.mint(user1.address, 1n, 1000n);
        await multiToken.mint(user1.address, 2n, 500n);

        return { router, shortcuts, token1, token2, nft1, multiToken, user1, user2, perfTest };
    }

    beforeEach(async function () {
        ({ router, shortcuts, token1, token2, nft1, multiToken, user1, user2, perfTest } = await loadFixture(deployFixture));
    });

    describe("基础性能测试", function () {
        it("应该测量构造函数gas消耗", async function () {
            const endMeasurement = await perfTest.startMeasurement("Constructor");

            const EnsoRouter = await ethers.getContractFactory("EnsoRouter");
            const newRouter = await EnsoRouter.deploy();

            const gasUsed = await endMeasurement();

            expect(gasUsed).to.be.greaterThan(0);
            expect(await newRouter.shortcuts()).to.not.equal(ethers.ZeroAddress);
        });

        it("应该测试单一代币路由的gas性能 - ERC20", async function () {
            const amount = ethers.parseEther("100");
            const tokenIn = createTokenData(1, await token1.getAddress(), amount);

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, amount);

            const endMeasurement = await perfTest.startMeasurement("routeSingle_ERC20");

            await router.connect(user1).routeSingle(tokenIn, callData);

            const gasUsed = await endMeasurement();
            expect(gasUsed).to.be.greaterThan(0);
        });

        it("应该测试单一代币路由的gas性能 - Native", async function () {
            const amount = ethers.parseEther("1");
            const tokenIn = createTokenData(0, undefined, amount);

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            const endMeasurement = await perfTest.startMeasurement("routeSingle_Native");

            await router.connect(user1).routeSingle(tokenIn, callData, { value: amount });

            const gasUsed = await endMeasurement();
            expect(gasUsed).to.be.greaterThan(0);
        });

        it("应该测试单一代币路由的gas性能 - ERC721", async function () {
            const tokenId = 1n;
            const tokenIn = createTokenData(2, await nft1.getAddress(), tokenId);

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await nft1.connect(user1).approve(router.target, tokenId);

            const endMeasurement = await perfTest.startMeasurement("routeSingle_ERC721");

            await router.connect(user1).routeSingle(tokenIn, callData);

            const gasUsed = await endMeasurement();
            expect(gasUsed).to.be.greaterThan(0);
        });

        it("应该测试单一代币路由的gas性能 - ERC1155", async function () {
            const tokenId = 1n;
            const amount = 100n;
            const tokenIn = createTokenData(3, await multiToken.getAddress(), tokenId, amount);

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await multiToken.connect(user1).setApprovalForAll(router.target, true);

            const endMeasurement = await perfTest.startMeasurement("routeSingle_ERC1155");

            await router.connect(user1).routeSingle(tokenIn, callData);

            const gasUsed = await endMeasurement();
            expect(gasUsed).to.be.greaterThan(0);
        });
    });

    describe("批量操作性能测试", function () {
        const batchSizes = [1, 3, 5, 10];

        for (const batchSize of batchSizes) {
            it(`应该测试批量路由的gas性能 - ${batchSize}个代币`, async function () {
                const tokensIn = [];

                for (let i = 0; i < batchSize; i++) {
                    const tokenType = i % 4;

                    if (tokenType === 0 && i === 0) {
                        tokensIn.push(createTokenData(0, undefined, ethers.parseEther("0.1")));
                    } else if (tokenType === 1) {
                        tokensIn.push(createTokenData(1, await token1.getAddress(), ethers.parseEther("100")));
                    } else if (tokenType === 2) {
                        tokensIn.push(createTokenData(2, await nft1.getAddress(), BigInt(i + 1)));
                    } else {
                        tokensIn.push(createTokenData(3, await multiToken.getAddress(), BigInt((i % 2) + 1), 100n));
                    }
                }

                await token1.connect(user1).approve(router.target, ethers.MaxUint256);
                await nft1.connect(user1).approve(router.target, 10n);
                await multiToken.connect(user1).setApprovalForAll(router.target, true);

                const callData = shortcuts.interface.encodeFunctionData("execute", []);

                const endMeasurement = await perfTest.startMeasurement(`routeMulti_${batchSize}_tokens`);

                const value = batchSize > 0 ? ethers.parseEther("0.1") : 0n;
                await router.connect(user1).routeMulti(tokensIn, callData, { value });

                const gasUsed = await endMeasurement();
                console.log(`批量大小 ${batchSize}: ${gasUsed} gas, 平均每代币: ${gasUsed / batchSize} gas`);
                expect(gasUsed).to.be.greaterThan(0);
            });
        }
    });

    describe("安全路由性能测试", function () {
        it("应该测试安全路由的额外gas开销", async function () {
            const amount = ethers.parseEther("100");
            const minAmountOut = ethers.parseEther("95");

            const tokenIn = createTokenData(1, await token1.getAddress(), amount);
            const tokenOut = createTokenData(1, await token2.getAddress(), minAmountOut);

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, amount);

            const endMeasurement1 = await perfTest.startMeasurement("routeSingle_Standard");
            await router.connect(user1).routeSingle(tokenIn, callData);
            const gasUsed1 = await endMeasurement1();

            const endMeasurement2 = await perfTest.startMeasurement("safeRouteSingle");
            await router.connect(user1).safeRouteSingle(
                tokenIn,
                tokenOut,
                user1.address,
                callData
            );
            const gasUsed2 = await endMeasurement2();

            const overhead = gasUsed2 - gasUsed1;
            console.log(`安全路由额外开销: ${overhead} gas (${(overhead / gasUsed1 * 100).toFixed(2)}%)`);

            expect(overhead).to.be.greaterThan(0);
        });

        it("应该测试多代币安全路由的性能", async function () {
            const tokensIn = [
                createTokenData(1, await token1.getAddress(), ethers.parseEther("100")),
                createTokenData(1, await token2.getAddress(), ethers.parseEther("50"))
            ];

            const tokensOut = [
                createTokenData(1, await token2.getAddress(), ethers.parseEther("95")),
                createTokenData(1, await token1.getAddress(), ethers.parseEther("45"))
            ];

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, ethers.MaxUint256);
            await token2.connect(user1).approve(router.target, ethers.MaxUint256);

            const endMeasurement = await perfTest.startMeasurement("safeRouteMulti_2_tokens");

            await router.connect(user1).safeRouteMulti(
                tokensIn,
                tokensOut,
                user1.address,
                callData
            );

            const gasUsed = await endMeasurement();
            console.log(`安全多代币路由: ${gasUsed} gas`);
            expect(gasUsed).to.be.greaterThan(0);
        });
    });

    describe("扩展性测试", function () {
        it("应该测试大量ERC20代币的性能", async function () {
            const batchSize = 20;
            const tokensIn = [];

            for (let i = 0; i < batchSize; i++) {
                tokensIn.push(createTokenData(
                    1,
                    await token1.getAddress(),
                    ethers.parseEther(String(i + 1))
                ));
            }

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, ethers.MaxUint256);

            await router.connect(user1).routeMulti(tokensIn, callData);

            const endMeasurement = await perfTest.startMeasurement("LargeBatch_20_ERC20");
            await router.connect(user1).routeMulti(tokensIn, callData);
            const gasUsed = await endMeasurement();

            console.log(`批量大小 ${batchSize}: ${gasUsed} gas, 平均每代币: ${gasUsed / batchSize} gas`);
            expect(gasUsed).to.be.greaterThan(0);
        });

        it("应该测试连续调用的性能", async function () {
            const numCalls = 10;
            const amount = ethers.parseEther("10");
            const tokenIn = createTokenData(1, await token1.getAddress(), amount);
            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, amount * BigInt(numCalls));

            const gasUsedArray = [];

            for (let i = 0; i < numCalls; i++) {
                const endMeasurement = await perfTest.startMeasurement(`ConsecutiveCall_${i}`);
                await router.connect(user1).routeSingle(tokenIn, callData);
                const gasUsed = await endMeasurement();
                gasUsedArray.push(gasUsed);
            }

            const avgGas = gasUsedArray.reduce((a, b) => a + b, 0) / gasUsedArray.length;
            const firstCallGas = gasUsedArray[0];
            const lastCallGas = gasUsedArray[gasUsedArray.length - 1];

            console.log(`连续 ${numCalls} 次调用:`);
            console.log(`  第一次调用: ${firstCallGas} gas`);
            console.log(`  最后一次调用: ${lastCallGas} gas`);
            console.log(`  平均: ${avgGas.toFixed(0)} gas`);
            console.log(`  波动: ${((lastCallGas - firstCallGas) / firstCallGas * 100).toFixed(2)}%`);
        });
    });

    describe("失败情况性能测试", function () {
        it("应该测试执行失败时的gas消耗", async function () {
            const amount = ethers.parseEther("100");
            const tokenIn = createTokenData(1, await token1.getAddress(), amount);

            const failingCallData = "0x12345678";

            await token1.connect(user1).approve(router.target, amount);

            const endMeasurement = await perfTest.startMeasurement("FailedExecution");

            try {
                await router.connect(user1).routeSingle(tokenIn, failingCallData);
                expect.fail("应该失败");
            } catch (error) {
                const gasUsed = await endMeasurement();
                console.log(`失败执行消耗: ${gasUsed} gas`);
                expect(gasUsed).to.be.greaterThan(0);
            }
        });

        it("应该测试错误输入时的性能", async function () {
            const invalidToken = {
                tokenType: 99,
                data: "0x"
            };

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            const endMeasurement = await perfTest.startMeasurement("InvalidTokenType");

            try {
                await router.connect(user1).routeSingle(invalidToken, callData);
                expect.fail("应该失败");
            } catch (error) {
                const gasUsed = await endMeasurement();
                console.log(`错误输入消耗: ${gasUsed} gas`);
                expect(gasUsed).to.be.greaterThan(0);
            }
        });
    });

    describe("对比分析测试", function () {
        it("应该对比直接调用和路由调用的性能", async function () {
            const amount = ethers.parseEther("100");

            const endMeasurement1 = await perfTest.startMeasurement("DirectTransfer");
            await token1.connect(user1).transfer(router.target, amount);
            const gasUsed1 = await endMeasurement1();

            const tokenIn = createTokenData(1, await token1.getAddress(), amount);
            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, amount);

            const endMeasurement2 = await perfTest.startMeasurement("RouterTransfer");
            await router.connect(user1).routeSingle(tokenIn, callData);
            const gasUsed2 = await endMeasurement2();

            const overhead = gasUsed2 - gasUsed1;
            console.log(`直接转账: ${gasUsed1} gas`);
            console.log(`路由转账: ${gasUsed2} gas`);
            console.log(`路由开销: ${overhead} gas (${(overhead / gasUsed1 * 100).toFixed(2)}%)`);

            expect(overhead).to.be.greaterThan(0);
        });

        it("应该对比批量调用和单独调用的效率", async function () {
            const iterations = 5;
            const amount = ethers.parseEther("10");

            const tokenInSingle = createTokenData(1, await token1.getAddress(), amount);
            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, amount * BigInt(iterations));

            const endMeasurement1 = await perfTest.startMeasurement("MultipleSingleCalls");
            for (let i = 0; i < iterations; i++) {
                await router.connect(user1).routeSingle(tokenInSingle, callData);
            }
            const gasUsed1 = await endMeasurement1();

            const tokensInBatch = [];
            for (let i = 0; i < iterations; i++) {
                tokensInBatch.push(createTokenData(1, await token1.getAddress(), amount));
            }

            const endMeasurement2 = await perfTest.startMeasurement("SingleBatchCall");
            await router.connect(user1).routeMulti(tokensInBatch, callData);
            const gasUsed2 = await endMeasurement2();

            console.log(`单独调用 ${iterations} 次: ${gasUsed1} gas`);
            console.log(`批量调用 1 次: ${gasUsed2} gas`);
            console.log(`批量效率提升: ${((gasUsed1 - gasUsed2) / gasUsed1 * 100).toFixed(2)}%`);
            console.log(`平均每调用节省: ${((gasUsed1 - gasUsed2) / iterations).toFixed(0)} gas`);

            expect(gasUsed2).to.be.lessThan(gasUsed1);
        });
    });

    describe("数据处理性能测试", function () {
        const dataSizes = [32, 64, 128, 256, 512];

        for (const dataSize of dataSizes) {
            it(`应该测试数据编码/解码性能 - ${dataSize}字节`, async function () {
                const extraData = "0x" + "01".repeat(dataSize);

                const abiCoder = ethers.AbiCoder.defaultAbiCoder();
                const tokenData = abiCoder.encode(
                    ["address", "uint256", "bytes"],
                    [await token1.getAddress(), ethers.parseEther("100"), extraData]
                );

                const tokenIn = {
                    tokenType: 1,
                    data: tokenData
                };

                const callData = new Uint8Array(dataSize);

                await token1.connect(user1).approve(router.target, ethers.parseEther("100"));

                const endMeasurement = await perfTest.startMeasurement(`DataEncoding_${dataSize}_bytes`);

                try {
                    await router.connect(user1).routeSingle(tokenIn, callData);
                } catch {
                    // 忽略错误
                }

                const gasUsed = await endMeasurement();
                console.log(`${dataSize} 字节数据编码/解码: ${gasUsed} gas`);
                expect(gasUsed).to.be.greaterThan(0);
            });
        }
    });

    afterEach(function () {
        perfTest.printSummary();
    });
});

describe("高级性能测试套件", function () {
    let router;
    let shortcuts;
    let token1;
    let user1;
    let perfTest;

    async function deployAdvancedFixture() {
        [user1] = await ethers.getSigners();
        perfTest = new PerformanceTest();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const EnsoRouter = await ethers.getContractFactory("EnsoRouter");

        token1 = await MockERC20.deploy();
        router = await EnsoRouter.deploy();

        const shortcutsAddress = await router.shortcuts();
        const MockShortcuts = await ethers.getContractFactory("MockShortcuts");
        shortcuts = MockShortcuts.attach(shortcutsAddress);

        await token1.transfer(user1.address, ethers.parseEther("10000"));

        return { router, shortcuts, token1, user1, perfTest };
    }

    beforeEach(async function () {
        ({ router, shortcuts, token1, user1, perfTest } = await loadFixture(deployAdvancedFixture));
    });

    it("应该进行压力测试 - 大量混合代币", async function () {
        this.timeout(60000);

        const batchSize = 30;
        const tokensIn = [];

        for (let i = 0; i < batchSize; i++) {
            const tokenType = i % 3;

            if (tokenType === 0) {
                tokensIn.push(createTokenData(
                    1,
                    await token1.getAddress(),
                    ethers.parseEther(String((i % 10) + 1))
                ));
            } else if (tokenType === 1) {
                const MockERC721 = await ethers.getContractFactory("MockERC721");
                const newNFT = await MockERC721.deploy();
                await newNFT.mint(user1.address);

                tokensIn.push(createTokenData(
                    2,
                    await newNFT.getAddress(),
                    1n
                ));

                await newNFT.connect(user1).approve(router.target, 1n);
            }
        }

        await token1.connect(user1).approve(router.target, ethers.MaxUint256);

        const callData = shortcuts.interface.encodeFunctionData("execute", []);

        const endMeasurement = await perfTest.startMeasurement("StressTest_Mixed_Tokens");

        await router.connect(user1).routeMulti(tokensIn, callData);

        const gasUsed = await endMeasurement();
        console.log(`压力测试 ${batchSize} 个混合代币: ${gasUsed} gas`);
        console.log(`交易大小估计: ${batchSize * 100} 字节`);

        expect(gasUsed).to.be.greaterThan(0);
    });

    it("应该测试不同输入大小的影响", async function () {
        const testCases = [
            { name: "小金额", amount: ethers.parseEther("0.1") },
            { name: "中等金额", amount: ethers.parseEther("100") },
            { name: "大金额", amount: ethers.parseEther("1000000") },
        ];

        for (const testCase of testCases) {
            const tokenIn = createTokenData(1, await token1.getAddress(), testCase.amount);

            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            await token1.connect(user1).approve(router.target, testCase.amount);

            const endMeasurement = await perfTest.startMeasurement(`AmountSize_${testCase.name}`);

            await router.connect(user1).routeSingle(tokenIn, callData);

            const gasUsed = await endMeasurement();
            console.log(`${testCase.name} (${testCase.amount}): ${gasUsed} gas`);

            expect(gasUsed).to.be.greaterThan(0);
        }
    });

    it("应该测试多次迭代的稳定性", async function () {
        const iterations = 50;
        const amount = ethers.parseEther("10");
        const tokenIn = createTokenData(1, await token1.getAddress(), amount);
        const callData = shortcuts.interface.encodeFunctionData("execute", []);

        await token1.connect(user1).approve(router.target, amount * BigInt(iterations));

        const gasResults = [];

        for (let i = 0; i < iterations; i++) {
            const endMeasurement = await perfTest.startMeasurement(`StabilityTest_Iteration_${i}`);
            await router.connect(user1).routeSingle(tokenIn, callData);
            const gasUsed = await endMeasurement();
            gasResults.push(gasUsed);

            if ((i + 1) % 10 === 0) {
                const currentAvg = gasResults.reduce((a, b) => a + b, 0) / gasResults.length;
                const currentStdDev = Math.sqrt(
                    gasResults.reduce((sq, n) => sq + Math.pow(n - currentAvg, 2), 0) / gasResults.length
                );
                console.log(`进度: ${i + 1}/${iterations}, 平均: ${currentAvg.toFixed(0)}, 标准差: ${currentStdDev.toFixed(2)}`);
            }
        }

        const avgGas = gasResults.reduce((a, b) => a + b, 0) / gasResults.length;
        const stdDev = Math.sqrt(
            gasResults.reduce((sq, n) => sq + Math.pow(n - avgGas, 2), 0) / gasResults.length
        );
        const cv = (stdDev / avgGas) * 100;

        console.log(`稳定性测试结果:`);
        console.log(`  迭代次数: ${iterations}`);
        console.log(`  平均Gas: ${avgGas.toFixed(0)}`);
        console.log(`  标准差: ${stdDev.toFixed(2)}`);
        console.log(`  变异系数: ${cv.toFixed(2)}%`);
        console.log(`  最小Gas: ${Math.min(...gasResults)}`);
        console.log(`  最大Gas: ${Math.max(...gasResults)}`);

        expect(cv).to.be.lessThan(5);
    });

    it("应该测试复杂场景的综合性能", async function () {
        const complexTestCases = [
            {
                name: "简单路由",
                tokensIn: [
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("100"))
                ],
                tokensOut: [],
                isSafeRoute: false
            },
            {
                name: "多代币路由",
                tokensIn: [
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("100")),
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("200"))
                ],
                tokensOut: [],
                isSafeRoute: false
            },
            {
                name: "安全路由",
                tokensIn: [
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("100"))
                ],
                tokensOut: [
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("95"))
                ],
                isSafeRoute: true
            },
            {
                name: "复杂安全路由",
                tokensIn: [
                    createTokenData(0, undefined, ethers.parseEther("1")),
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("100"))
                ],
                tokensOut: [
                    createTokenData(1, await token1.getAddress(), ethers.parseEther("95")),
                    createTokenData(0, undefined, ethers.parseEther("0.9"))
                ],
                isSafeRoute: true
            }
        ];

        await token1.connect(user1).approve(router.target, ethers.MaxUint256);

        for (const testCase of complexTestCases) {
            const callData = shortcuts.interface.encodeFunctionData("execute", []);

            const endMeasurement = await perfTest.startMeasurement(`Complex_${testCase.name}`);

            if (testCase.isSafeRoute) {
                await router.connect(user1).safeRouteMulti(
                    testCase.tokensIn,
                    testCase.tokensOut,
                    user1.address,
                    callData,
                    { value: ethers.parseEther("1") }
                );
            } else {
                await router.connect(user1).routeMulti(
                    testCase.tokensIn,
                    callData,
                    { value: ethers.parseEther("1") }
                );
            }

            const gasUsed = await endMeasurement();
            console.log(`${testCase.name}: ${gasUsed} gas`);
            expect(gasUsed).to.be.greaterThan(0);
        }
    });
});