<<<<<<< HEAD
# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```
# 通过部署脚本部署合约，运行命令
npx hardhat run scripts/deploy-hardhat.js      
=======
# WEB3_Hybrid
>>>>>>> 23cdf6c92749a712ec3d88c4cd1d066ba0dfad6b
# WEB3_Hybrid
# 创建venv环境
python3 -m venv venv
# 激活环境
# 后期直接修改venv目录为.venv
source venv/bin/activate
# 退出环境
deactivate
# 再次进入
source .venv/bin/activate
# 安装依赖
pip install -r ./requirements.txt


# ========================= BROWNIE =========================
# 查看当前brownie版本，验证安装是否正常
brownie --version  
# Brownie环境初始化
brownie init 
# brownie框架结构
WEB3_Hybrid/
├── .gitignore
├── brownie/
│   ├── .venv/           # Brownie 虚拟环境
│   ├── contracts/
│   ├── scripts/
│   ├── tests/
│   └── requirements.txt
├── hardhat/
│   ├── node_modules/    # Node.js 依赖
│   ├── contracts/
│   └── package.json
├── shared/
└── scripts/
    ├── setup-venv.sh    # 环境设置脚本
    └── activate.sh      # 激活脚本
# ========================= HARDHAT =========================
# 初始化 package.json
npm init -y
# 安装 Hardhat（开发依赖）
npm install --save-dev hardhat@2
# 5. 初始化 Hardhat 配置   执行后一路回车即可
npx hardhat init
# 6. 安装常用插件
npm install --save-dev @nomicfoundation/hardhat-toolbox
npm install --save-dev @nomicfoundation/hardhat-verify          --->需要安装的版本为hardhat@3才能安装
npm install --save-dev dotenv
hardhat框架
# hardhat/
├── contracts/           # Solidity 合约
│   └── Lock.sol        # 示例合约
├── scripts/            # 部署脚本
│   └── deploy.js       # 示例部署脚本
├── test/               # 测试文件
│   └── Lock.js         # 示例测试
├── node_modules/       # 依赖包
├── .gitignore          # Git 忽略文件
├── hardhat.config.js   # Hardhat 配置
├── package.json        # npm 配置
├── package-lock.json   # 依赖锁定文件
└── README.md           # 说明文档


#  启动网络
npx hardhat node

# 运行所有测试
npx hardhat test
