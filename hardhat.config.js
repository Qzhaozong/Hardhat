require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // 合约源码目录（默认就是contracts，可省略）
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts", // 编译产物输出目录
    cache: "./cache" // 编译缓存目录
  },
  // 编译器核心配置
  solidity: {
    // 多版本编译器（若有其他合约需适配低版本，可添加）
    compilers: [
      {
        version: "0.8.28", // 使用最新指定的版本
        settings: {
          // 优化配置
          optimizer: {
            enabled: true, // 启用优化器（viaIR 依赖）
            runs: 200       // 优化次数（200 是通用最优值）
          },
          viaIR: true, // 启用IR编译，解决栈深度问题
          // 输出产物配置
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
        }
      }
    ]
  },
  // 网络配置（可选，本地测试无需配置）
  networks: {
    hardhat: {}, // 默认本地测试网
    localhost: {
      url: "http://127.0.0.1:8545" // 本地节点地址
    }
  }
};