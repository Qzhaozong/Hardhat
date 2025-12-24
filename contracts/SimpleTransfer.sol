// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
/**
 * @title AdvancedToken
 * @dev 增强型ERC20代币合约，支持批量转账、代币锁定、黑名单、交易费等功能
 * 适用于Web3项目中的代币经济系统
 */
contract AdvancedToken {
    // ============ 基础ERC20状态变量 ============
    string public name; // 代币名称
    string public symbol; // 代币符号
    uint8 public decimals; // 小数位数
    uint256 public totalSupply; // 总供应量

    mapping(address => uint256) private _balances; // 地址到余额的映射
    mapping(address => mapping(address => uint256)) private _allowances; // 授权映射

    // ============ 扩展功能状态变量 ============
    address public owner; // 合约所有者
    address public feeCollector; // 手续费接收地址
    uint256 public transferFee; // 转账手续费（百分比，100 = 1%）
    uint256 public constant FEE_DENOMINATOR = 10000; // 手续费分母（10000 = 100%）

    mapping(address => bool) public isBlacklisted; // 黑名单映射
    mapping(address => LockInfo[]) public lockedTokens; // 锁定代币记录数组

    // ============ 事件定义 ============
    event Transfer(address indexed from, address indexed to, uint256 value); // 转账事件
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    ); // 授权事件
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    ); // 所有权转移事件
    event TokensLocked(
        address indexed account,
        uint256 amount,
        uint256 unlockTime
    ); // 代币锁定事件
    event TokensUnlocked(address indexed account, uint256 amount); // 代币解锁事件
    event Blacklisted(address indexed account); // 加入黑名单事件
    event UnBlacklisted(address indexed account); // 移出黑名单事件
    event FeeUpdated(uint256 oldFee, uint256 newFee); // 手续费更新事件
    event FeeCollectorUpdated(
        address indexed oldCollector,
        address indexed newCollector
    ); // 手续费接收者更新事件
    event BatchTransfer(
        address indexed from,
        uint256 totalAmount,
        uint256 recipientCount
    ); // 批量转账事件

    // ============ 结构体定义 ============
    struct LockInfo {
        uint256 amount; // 锁定金额
        uint256 unlockTime; // 解锁时间
        bool unlocked; // 是否已解锁
    }

    struct TransferRequest {
        address to; // 接收地址
        uint256 amount; // 转账金额
    }

    // ============ 修饰器 ============
    modifier onlyOwner() {
        require(msg.sender == owner, "AdvancedToken: caller is not the owner");
        _;
    }

    modifier notBlacklisted(address account) {
        require(
            !isBlacklisted[account],
            "AdvancedToken: account is blacklisted"
        );
        _;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "AdvancedToken: zero address");
        _;
    }

    // ============ 构造函数 ============
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply,
        address _owner,
        address _feeCollector,
        uint256 _transferFee
    ) {
        name = _name; // 设置代币名称
        symbol = _symbol; // 设置代币符号
        decimals = _decimals; // 设置小数位数
        owner = _owner; // 设置合约所有者
        feeCollector = _feeCollector; // 设置手续费接收者
        transferFee = _transferFee; // 设置转账手续费

        _mint(_owner, _initialSupply * 10 ** decimals); // 铸造初始供应量
    }

    // ============ ERC20标准功能 ============
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account]; // 返回账户余额
    }

    function transfer(
        address to,
        uint256 amount
    )
        public
        validAddress(to)
        notBlacklisted(msg.sender)
        notBlacklisted(to)
        returns (bool)
    {
        _transfer(msg.sender, to, amount); // 调用内部转账函数
        return true;
    }

    function allowance(
        address ownerAddr,
        address spender
    ) public view returns (uint256) {
        return _allowances[ownerAddr][spender]; // 返回授权额度
    }

    function approve(
        address spender,
        uint256 amount
    ) public validAddress(spender) returns (bool) {
        _approve(msg.sender, spender, amount); // 调用内部授权函数
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        public
        validAddress(from)
        validAddress(to)
        notBlacklisted(from)
        notBlacklisted(to)
        returns (bool)
    {
        _spendAllowance(from, msg.sender, amount); // 扣除授权额度
        _transfer(from, to, amount); // 执行转账
        return true;
    }

    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public returns (bool) {
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender] + addedValue
        ); // 增加授权额度
        return true;
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public returns (bool) {
        uint256 currentAllowance = _allowances[msg.sender][spender];
        require(
            currentAllowance >= subtractedValue,
            "AdvancedToken: decreased allowance below zero"
        ); // 检查授权额度是否足够
        _approve(msg.sender, spender, currentAllowance - subtractedValue); // 减少授权额度
        return true;
    }

    // ============ 高级转账功能 ============
    /**
     * @dev 批量转账功能 - 一次性向多个地址转账
     * @param recipients 接收地址和金额数组
     */
    function batchTransfer(
        TransferRequest[] memory recipients
    ) public notBlacklisted(msg.sender) returns (bool) {
        require(recipients.length > 0, "AdvancedToken: no recipients"); // 检查是否有接收者
        require(recipients.length <= 100, "AdvancedToken: too many recipients"); // 限制接收者数量

        uint256 totalAmount = 0;

        // 计算总金额并检查有效性
        for (uint256 i = 0; i < recipients.length; i++) {
            require(
                recipients[i].to != address(0),
                "AdvancedToken: zero address in recipients"
            ); // 检查接收地址是否为零地址
            require(
                !isBlacklisted[recipients[i].to],
                "AdvancedToken: recipient is blacklisted"
            ); // 检查接收者是否在黑名单
            require(recipients[i].amount > 0, "AdvancedToken: zero amount"); // 检查金额是否大于0
            totalAmount += recipients[i].amount; // 累加总金额
        }

        // 检查发送者余额是否足够（包含手续费）
        uint256 fee = calculateFee(totalAmount); // 计算手续费
        uint256 totalCost = totalAmount + fee; // 计算总成本
        require(
            _balances[msg.sender] >= totalCost,
            "AdvancedToken: insufficient balance"
        ); // 检查余额是否足够

        // 执行转账
        for (uint256 i = 0; i < recipients.length; i++) {
            _transferWithoutFee(
                msg.sender,
                recipients[i].to,
                recipients[i].amount
            ); // 不带手续费的转账
        }

        // 收取手续费
        if (fee > 0) {
            _transferWithoutFee(msg.sender, feeCollector, fee); // 转账手续费
        }

        emit BatchTransfer(msg.sender, totalAmount, recipients.length); // 触发批量转账事件
        return true;
    }

    /**
     * @dev 带备注的转账
     */
    function transferWithMemo(
        address to,
        uint256 amount,
        string memory memo
    ) public returns (bool) {
        bool success = transfer(to, amount); // 执行标准转账
        if (success && bytes(memo).length > 0) {
            // 备注可以记录在链下或通过事件记录
            emit Transfer(msg.sender, to, amount); // 再次触发转账事件（包含备注信息）
        }
        return success;
    }

    // ============ 代币锁定功能 ============
    /**
     * @dev 锁定代币一段时间
     * @param amount 锁定数量
     * @param unlockTime 解锁时间（Unix时间戳）
     */
    function lockTokens(uint256 amount, uint256 unlockTime) public {
        require(amount > 0, "AdvancedToken: amount must be positive"); // 检查锁定金额是否大于0
        require(
            unlockTime > block.timestamp,
            "AdvancedToken: unlock time must be in the future"
        ); // 检查解锁时间是否在未来
        require(
            _balances[msg.sender] >= amount,
            "AdvancedToken: insufficient balance"
        ); // 检查余额是否足够

        // 从余额中扣除并记录锁定
        _balances[msg.sender] -= amount; // 扣除锁定金额
        lockedTokens[msg.sender].push(
            LockInfo({amount: amount, unlockTime: unlockTime, unlocked: false})
        ); // 添加锁定记录

        emit TokensLocked(msg.sender, amount, unlockTime); // 触发代币锁定事件
    }

    /**
     * @dev 解锁到期的代币
     */
    function unlockTokens() public {
        LockInfo[] storage locks = lockedTokens[msg.sender]; // 获取用户的锁定记录
        uint256 totalUnlocked = 0; // 总解锁金额

        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].unlocked && locks[i].unlockTime <= block.timestamp) {
                totalUnlocked += locks[i].amount; // 累加可解锁金额
                locks[i].unlocked = true; // 标记为已解锁
            }
        }

        require(totalUnlocked > 0, "AdvancedToken: no tokens to unlock"); // 检查是否有可解锁的代币
        _balances[msg.sender] += totalUnlocked; // 将解锁的代币加回余额

        emit TokensUnlocked(msg.sender, totalUnlocked); // 触发代币解锁事件
    }

    /**
     * @dev 获取用户锁定代币总额
     */
    function getLockedAmount(address account) public view returns (uint256) {
        LockInfo[] memory locks = lockedTokens[account]; // 获取账户的锁定记录
        uint256 totalLocked = 0; // 总锁定金额

        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].unlocked) {
                totalLocked += locks[i].amount; // 累加未解锁的金额
            }
        }

        return totalLocked; // 返回总锁定金额
    }

    /**
     * @dev 获取用户可用余额（总余额 - 锁定余额）
     */
    function availableBalance(address account) public view returns (uint256) {
        // return _balances[account] - getLockedAmount(account); // 计算可用余额
        uint256 totalHeld = _balances[account] + getLockedAmount(account);
        return totalHeld - getLockedAmount(account);

        // 举例：用户余额100，锁定80，_balances变为20，但getLockedAmount返回80
        // 20 - 80 = 下溢！
    }

    // ============ 管理功能 ============
    function setTransferFee(uint256 newFee) public onlyOwner {
        require(newFee <= 500, "AdvancedToken: fee too high"); // 最大5%
        uint256 oldFee = transferFee; // 保存旧手续费
        transferFee = newFee; // 更新手续费
        emit FeeUpdated(oldFee, newFee); // 触发手续费更新事件
    }

    function setFeeCollector(
        address newCollector
    ) public onlyOwner validAddress(newCollector) {
        address oldCollector = feeCollector; // 保存旧手续费接收者
        feeCollector = newCollector; // 更新手续费接收者
        emit FeeCollectorUpdated(oldCollector, newCollector); // 触发手续费接收者更新事件
    }

    function blacklist(address account) public onlyOwner validAddress(account) {
        require(!isBlacklisted[account], "AdvancedToken: already blacklisted"); // 检查是否已在黑名单
        isBlacklisted[account] = true; // 加入黑名单
        emit Blacklisted(account); // 触发加入黑名单事件
    }

    function unblacklist(
        address account
    ) public onlyOwner validAddress(account) {
        require(isBlacklisted[account], "AdvancedToken: not blacklisted"); // 检查是否在黑名单
        isBlacklisted[account] = false; // 移出黑名单
        emit UnBlacklisted(account); // 触发移出黑名单事件
    }

    function transferOwnership(
        address newOwner
    ) public onlyOwner validAddress(newOwner) {
        address oldOwner = owner; // 保存旧所有者
        owner = newOwner; // 更新所有者
        emit OwnershipTransferred(oldOwner, newOwner); // 触发所有权转移事件
    }

    function mint(
        address to,
        uint256 amount
    ) public onlyOwner validAddress(to) {
        _mint(to, amount); // 铸造新代币
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount); // 销毁代币
    }

    function burnFrom(address account, uint256 amount) public {
        _spendAllowance(account, msg.sender, amount); // 扣除授权额度
        _burn(account, amount); // 销毁代币
    }

    // ============ 视图函数 ============
    function calculateFee(uint256 amount) public view returns (uint256) {
        return (amount * transferFee) / FEE_DENOMINATOR; // 计算手续费
    }

    function getLockInfo(
        address account
    ) public view returns (LockInfo[] memory) {
        return lockedTokens[account]; // 返回锁定记录数组
    }

    function getLockInfoCount(address account) public view returns (uint256) {
        return lockedTokens[account].length; // 返回锁定记录数量
    }

    // ============ 内部函数 ============
    function _transfer(address from, address to, uint256 amount) internal {
        require(
            from != address(0),
            "AdvancedToken: transfer from the zero address"
        ); // 检查发送地址是否为零地址
        require(
            to != address(0),
            "AdvancedToken: transfer to the zero address"
        ); // 检查接收地址是否为零地址
        require(amount > 0, "AdvancedToken: transfer amount must be positive"); // 检查金额是否大于0

        uint256 fee = calculateFee(amount); // 计算手续费
        uint256 netAmount = amount - fee; // 计算净转账金额

        // 检查可用余额（扣除锁定部分）
        uint256 available = availableBalance(from);
        require(
            available >= amount,
            "AdvancedToken: transfer amount exceeds available balance"
        ); // 检查可用余额是否足够

        // 执行转账
        _balances[from] -= amount; // 减少发送方余额
        _balances[to] += netAmount; // 增加接收方净余额

        // 收取手续费
        if (fee > 0) {
            _balances[feeCollector] += fee; // 增加手续费接收方余额
            emit Transfer(from, feeCollector, fee); // 触发手续费转账事件
        }

        emit Transfer(from, to, netAmount); // 触发转账事件
    }

    function _transferWithoutFee(
        address from,
        address to,
        uint256 amount
    ) internal {
        require(
            from != address(0),
            "AdvancedToken: transfer from the zero address"
        ); // 检查发送地址是否为零地址
        require(
            to != address(0),
            "AdvancedToken: transfer to the zero address"
        ); // 检查接收地址是否为零地址
        require(amount > 0, "AdvancedToken: transfer amount must be positive"); // 检查金额是否大于0

        uint256 senderBalance = _balances[from]; // 获取发送方余额
        require(
            senderBalance >= amount,
            "AdvancedToken: transfer amount exceeds balance"
        ); // 检查余额是否足够

        _balances[from] = senderBalance - amount; // 减少发送方余额
        _balances[to] += amount; // 增加接收方余额

        emit Transfer(from, to, amount); // 触发转账事件
    }

    function _mint(
        address account,
        uint256 amount
    ) internal validAddress(account) {
        require(amount > 0, "AdvancedToken: mint amount must be positive"); // 检查铸造金额是否大于0

        totalSupply += amount; // 增加总供应量
        _balances[account] += amount; // 增加账户余额
        emit Transfer(address(0), account, amount); // 触发铸造事件
    }

    function _burn(address account, uint256 amount) internal {
        require(
            account != address(0),
            "AdvancedToken: burn from the zero address"
        ); // 检查账户是否为零地址
        require(amount > 0, "AdvancedToken: burn amount must be positive"); // 检查销毁金额是否大于0

        uint256 accountBalance = _balances[account]; // 获取账户余额
        require(
            accountBalance >= amount,
            "AdvancedToken: burn amount exceeds balance"
        ); // 检查余额是否足够

        _balances[account] = accountBalance - amount; // 减少账户余额
        totalSupply -= amount; // 减少总供应量
        emit Transfer(account, address(0), amount); // 触发销毁事件
    }

    function _approve(
        address ownerAddr,
        address spender,
        uint256 amount
    ) internal {
        require(
            ownerAddr != address(0),
            "AdvancedToken: approve from the zero address"
        ); // 检查所有者地址是否为零地址
        require(
            spender != address(0),
            "AdvancedToken: approve to the zero address"
        ); // 检查授权地址是否为零地址

        _allowances[ownerAddr][spender] = amount; // 设置授权额度
        emit Approval(ownerAddr, spender, amount); // 触发授权事件
    }

    function _spendAllowance(
        address ownerAddr,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = allowance(ownerAddr, spender); // 获取当前授权额度
        if (currentAllowance != type(uint256).max) {
            // 如果不是无限授权
            require(
                currentAllowance >= amount,
                "AdvancedToken: insufficient allowance"
            ); // 检查授权额度是否足够
            _approve(ownerAddr, spender, currentAllowance - amount); // 减少授权额度
        }
    }
}
