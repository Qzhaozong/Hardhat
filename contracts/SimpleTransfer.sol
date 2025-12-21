// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AdvancedToken
 * @dev 增强型ERC20代币合约，支持批量转账、代币锁定、黑名单、交易费等功能
 * 适用于Web3项目中的代币经济系统
 */
contract AdvancedToken {
    // ============ 基础ERC20状态变量 ============
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // ============ 扩展功能状态变量 ============
    address public owner;
    address public feeCollector; // 手续费接收地址
    uint256 public transferFee; // 转账手续费（百分比，100 = 1%）
    uint256 public constant FEE_DENOMINATOR = 10000; // 手续费分母（10000 = 100%）

    mapping(address => bool) public isBlacklisted; // 黑名单
    mapping(address => LockInfo[]) public lockedTokens; // 锁定代币记录

    // ============ 事件定义 ============
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event TokensLocked(
        address indexed account,
        uint256 amount,
        uint256 unlockTime
    );
    event TokensUnlocked(address indexed account, uint256 amount);
    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(
        address indexed oldCollector,
        address indexed newCollector
    );
    event BatchTransfer(
        address indexed from,
        uint256 totalAmount,
        uint256 recipientCount
    );

    // ============ 结构体定义 ============
    struct LockInfo {
        uint256 amount;
        uint256 unlockTime;
        bool unlocked;
    }

    struct TransferRequest {
        address to;
        uint256 amount;
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
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = _owner;
        feeCollector = _feeCollector;
        transferFee = _transferFee;

        _mint(_owner, _initialSupply * 10 ** decimals);
    }

    // ============ ERC20标准功能 ============
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
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
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(
        address ownerAddr,
        address spender
    ) public view returns (uint256) {
        return _allowances[ownerAddr][spender];
    }

    function approve(
        address spender,
        uint256 amount
    ) public validAddress(spender) returns (bool) {
        _approve(msg.sender, spender, amount);
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
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
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
        );
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
        );
        _approve(msg.sender, spender, currentAllowance - subtractedValue);
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
        require(recipients.length > 0, "AdvancedToken: no recipients");
        require(recipients.length <= 100, "AdvancedToken: too many recipients");

        uint256 totalAmount = 0;

        // 计算总金额并检查有效性
        for (uint256 i = 0; i < recipients.length; i++) {
            require(
                recipients[i].to != address(0),
                "AdvancedToken: zero address in recipients"
            );
            require(
                !isBlacklisted[recipients[i].to],
                "AdvancedToken: recipient is blacklisted"
            );
            require(recipients[i].amount > 0, "AdvancedToken: zero amount");
            totalAmount += recipients[i].amount;
        }

        // 检查发送者余额是否足够（包含手续费）
        uint256 fee = calculateFee(totalAmount);
        uint256 totalCost = totalAmount + fee;
        require(
            _balances[msg.sender] >= totalCost,
            "AdvancedToken: insufficient balance"
        );

        // 执行转账
        for (uint256 i = 0; i < recipients.length; i++) {
            _transferWithoutFee(
                msg.sender,
                recipients[i].to,
                recipients[i].amount
            );
        }

        // 收取手续费
        if (fee > 0) {
            _transferWithoutFee(msg.sender, feeCollector, fee);
        }

        emit BatchTransfer(msg.sender, totalAmount, recipients.length);
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
        bool success = transfer(to, amount);
        if (success && bytes(memo).length > 0) {
            // 备注可以记录在链下或通过事件记录
            emit Transfer(msg.sender, to, amount);
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
        require(amount > 0, "AdvancedToken: amount must be positive");
        require(
            unlockTime > block.timestamp,
            "AdvancedToken: unlock time must be in the future"
        );
        require(
            _balances[msg.sender] >= amount,
            "AdvancedToken: insufficient balance"
        );

        // 从余额中扣除并记录锁定
        _balances[msg.sender] -= amount;
        lockedTokens[msg.sender].push(
            LockInfo({amount: amount, unlockTime: unlockTime, unlocked: false})
        );

        emit TokensLocked(msg.sender, amount, unlockTime);
    }

    /**
     * @dev 解锁到期的代币
     */
    function unlockTokens() public {
        LockInfo[] storage locks = lockedTokens[msg.sender];
        uint256 totalUnlocked = 0;

        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].unlocked && locks[i].unlockTime <= block.timestamp) {
                totalUnlocked += locks[i].amount;
                locks[i].unlocked = true;
            }
        }

        require(totalUnlocked > 0, "AdvancedToken: no tokens to unlock");
        _balances[msg.sender] += totalUnlocked;

        emit TokensUnlocked(msg.sender, totalUnlocked);
    }

    /**
     * @dev 获取用户锁定代币总额
     */
    function getLockedAmount(address account) public view returns (uint256) {
        LockInfo[] memory locks = lockedTokens[account];
        uint256 totalLocked = 0;

        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].unlocked) {
                totalLocked += locks[i].amount;
            }
        }

        return totalLocked;
    }

    /**
     * @dev 获取用户可用余额（总余额 - 锁定余额）
     */
    function availableBalance(address account) public view returns (uint256) {
        return _balances[account] - getLockedAmount(account);
    }

    // ============ 管理功能 ============
    function setTransferFee(uint256 newFee) public onlyOwner {
        require(newFee <= 500, "AdvancedToken: fee too high"); // 最大5%
        uint256 oldFee = transferFee;
        transferFee = newFee;
        emit FeeUpdated(oldFee, newFee);
    }

    function setFeeCollector(
        address newCollector
    ) public onlyOwner validAddress(newCollector) {
        address oldCollector = feeCollector;
        feeCollector = newCollector;
        emit FeeCollectorUpdated(oldCollector, newCollector);
    }

    function blacklist(address account) public onlyOwner validAddress(account) {
        require(!isBlacklisted[account], "AdvancedToken: already blacklisted");
        isBlacklisted[account] = true;
        emit Blacklisted(account);
    }

    function unblacklist(
        address account
    ) public onlyOwner validAddress(account) {
        require(isBlacklisted[account], "AdvancedToken: not blacklisted");
        isBlacklisted[account] = false;
        emit UnBlacklisted(account);
    }

    function transferOwnership(
        address newOwner
    ) public onlyOwner validAddress(newOwner) {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function mint(
        address to,
        uint256 amount
    ) public onlyOwner validAddress(to) {
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) public {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    // ============ 视图函数 ============
    function calculateFee(uint256 amount) public view returns (uint256) {
        return (amount * transferFee) / FEE_DENOMINATOR;
    }

    function getLockInfo(
        address account
    ) public view returns (LockInfo[] memory) {
        return lockedTokens[account];
    }

    function getLockInfoCount(address account) public view returns (uint256) {
        return lockedTokens[account].length;
    }

    // ============ 内部函数 ============
    function _transfer(address from, address to, uint256 amount) internal {
        require(
            from != address(0),
            "AdvancedToken: transfer from the zero address"
        );
        require(
            to != address(0),
            "AdvancedToken: transfer to the zero address"
        );
        require(amount > 0, "AdvancedToken: transfer amount must be positive");

        uint256 fee = calculateFee(amount);
        uint256 netAmount = amount - fee;

        // 检查可用余额（扣除锁定部分）
        uint256 available = availableBalance(from);
        require(
            available >= amount,
            "AdvancedToken: transfer amount exceeds available balance"
        );

        // 执行转账
        _balances[from] -= amount;
        _balances[to] += netAmount;

        // 收取手续费
        if (fee > 0) {
            _balances[feeCollector] += fee;
            emit Transfer(from, feeCollector, fee);
        }

        emit Transfer(from, to, netAmount);
    }

    function _transferWithoutFee(
        address from,
        address to,
        uint256 amount
    ) internal {
        require(
            from != address(0),
            "AdvancedToken: transfer from the zero address"
        );
        require(
            to != address(0),
            "AdvancedToken: transfer to the zero address"
        );
        require(amount > 0, "AdvancedToken: transfer amount must be positive");

        uint256 senderBalance = _balances[from];
        require(
            senderBalance >= amount,
            "AdvancedToken: transfer amount exceeds balance"
        );

        _balances[from] = senderBalance - amount;
        _balances[to] += amount;

        emit Transfer(from, to, amount);
    }

    function _mint(
        address account,
        uint256 amount
    ) internal validAddress(account) {
        require(amount > 0, "AdvancedToken: mint amount must be positive");

        totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal {
        require(
            account != address(0),
            "AdvancedToken: burn from the zero address"
        );
        require(amount > 0, "AdvancedToken: burn amount must be positive");

        uint256 accountBalance = _balances[account];
        require(
            accountBalance >= amount,
            "AdvancedToken: burn amount exceeds balance"
        );

        _balances[account] = accountBalance - amount;
        totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address ownerAddr,
        address spender,
        uint256 amount
    ) internal {
        require(
            ownerAddr != address(0),
            "AdvancedToken: approve from the zero address"
        );
        require(
            spender != address(0),
            "AdvancedToken: approve to the zero address"
        );

        _allowances[ownerAddr][spender] = amount;
        emit Approval(ownerAddr, spender, amount);
    }

    function _spendAllowance(
        address ownerAddr,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = allowance(ownerAddr, spender);
        if (currentAllowance != type(uint256).max) {
            require(
                currentAllowance >= amount,
                "AdvancedToken: insufficient allowance"
            );
            _approve(ownerAddr, spender, currentAllowance - amount);
        }
    }
}
