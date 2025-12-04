# Hardhat
# 创建一个新目录
mkdir my-hardhat-project
cd my-hardhat-project
# 初始化 npm 项目
npm init -y
# 安装 Hardhat
npm install --save-dev hardhat
# 初始化 Hardhat 项目
npx hardhat init
# 安装相关依赖
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# hardhat 项目结构
my-hardhat-project/
├── contracts/           # Solidity 合约
├── scripts/            # 部署脚本
├── test/               # 测试文件
├── hardhat.config.js   # Hardhat 配置
├── package.json
└── README.md

# 配置 hardhat.config.js 
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // 本地网络
    hardhat: {
      chainId: 31337,
    },
    // 本地开发网络（需要本地节点）
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};



# 验证环境是否可用
# 编译默认智能合约
npx hardhat compile
# 运行所有测试
npx hardhat test
# 测试结果展示

<img width="791" height="444" alt="image" src="https://github.com/user-attachments/assets/2e5076d2-e5ca-47ee-af85-9ed8e8f2dc0e" />

·············································································································
|  Solidity and Network Configuration                                                                       │
························|·················|···············|·················|································
|  Solidity: 0.8.28     ·  Optim: true    ·  Runs: 200    ·  viaIR: false   ·     Block: 30,000,000 gas     │
························|·················|···············|·················|································
|  Methods                                                                                                  │
························|·················|···············|·················|················|···············
|  Contracts / Methods  ·  Min            ·  Max          ·  Avg            ·  # calls       ·  usd (avg)   │
························|·················|···············|·················|················|···············
|  Lock                 ·                                                                                   │
························|·················|···············|·················|················|···············
|      withdraw         ·              -  ·            -  ·         33,820  ·             7  ·           -  │
························|·················|···············|·················|················|···············
|  Deployments                            ·                                 ·  % of limit    ·              │
························|·················|···············|·················|················|···············
|  Lock                 ·              -  ·            -  ·        204,541  ·         0.7 %  ·           -  │
························|·················|···············|·················|················|···············
|  Key                                                                                                      │
·············································································································
|  ◯  Execution gas for this method does not include intrinsic gas overhead                                 │
·············································································································
|  △  Cost was non-zero but below the precision setting for the currency display (see options)              │
·············································································································
|  Toolchain:  hardhat                                                                                      │
·············································································································
# 运行特定测试文件
npx hardhat test test/MyContract.test.js
# 启动 Hardhat 内置节点（带 20 个测试账户）
npx hardhat node
# 运行部署脚本
npx hardhat run scripts/deploy.js
# 部署到本地网络
npx hardhat run scripts/deploy.js --network localhost
