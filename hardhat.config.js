require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
// require("solidity-coverage");


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // 启用IR编译，解决栈深度问题
      outputSelection: {
        "*": {
          "*": [
            "evm.bytecode",
            "evm.deployedBytecode",
            "devdoc",
            "userdoc",
            "metadata",
            "abi"
          ]
        }
      },
      // 0.8.28推荐的EVM版本（可选，默认适配最新）
      evmVersion: "shanghai"
    },

  },
  networks: {
    hardhat: {
      chainId: 1337,
      mining: {
        auto: true,
        interval: 0
      },
      blockGasLimit: 30000000,
      initialBaseFeePerGas: 0,
    },
    localhost: {
      url: "http://127.0.0.1:8545" // 本地节点地址
    }
  },

  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 20,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    excludeContracts: ["mocks/"],
    src: "./contracts",
  },
  mocha: {
    timeout: 60000,
    reporter: "mochawesome",  // 使用 mochawesome 报告器
    reporterOptions: {
      reportDir: "./report",  // 报告输出目录
      overwrite: true,           // 不覆盖旧的报告
      html: true,                 // 生成 HTML
      json: false                  // 同时生成 JSON

    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  coverage: {
    // outputDir: "./report/coverage", // 将覆盖率报告输出到独立的子目录
    // 可选：添加包含/排除规则，使报告更精准
    exclude: [
      "test/**",           // 排除测试目录
      "node_modules/**",   // 排除依赖
      "**/Mock*.sol",      // 排除所有 Mock 合约
      "cache/**",          // 排除缓存
      "artifacts/**"       // 排除编译产物
    ]
  }
};