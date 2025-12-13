from web3 import Web3

# 使用HTTPProvider 连接到不同的网络 
w3 = Web3(Web3.HTTPProvider('https://mainnet.infura.io/v3/YOUR_KEY')) # 主网
w3 = Web3(Web3.HTTPProvider('http://localhost:8545')) # 本地开发

# 基础的区块链操作
# 使用is_connected检查网络的连接
if w3.is_connected():
    print(f'已连接到网络,当前区块：{w3.eth.block_number}')  # w3.eth.block_number表示当前最新区块号
# 使用get_balance 获取指定地址的余额
balance = w3.eth.get_balance('接入需要查询余额的地址')

# 智能合约交互
# 使用eth.contract加载合约
cotract = w3.eth.contract(
    address= '合约地址',
    abi = '合约ABI'
)

