// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract WETH9 {
    string public name = "Wrapped Ether";
    string public symbol = "WETH";
    uint8 public decimals = 18;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ========== 核心修正：0.8.x 回退函数写法 ==========
    /**
     * @dev 回退函数：接收ETH时自动触发deposit（兼容0.8.x语法）
     * @notice 无calldata时优先走receive，有calldata时走fallback
     */
    receive() external payable {
        deposit();
    }

    fallback() external payable {
        deposit();
    }

    // ========== 核心功能：ETH ↔ WETH 兑换 ==========
    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value); // 0.8.x 需显式加emit（0.4.x可省略）
    }

    function withdraw(uint256 wad) public {
        require(balanceOf[msg.sender] >= wad, "WETH9: insufficient balance");
        balanceOf[msg.sender] -= wad;
        // 0.8.x 推荐用call替代transfer（避免gas限制问题）
        (bool success, ) = msg.sender.call{value: wad}("");
        require(success, "WETH9: ETH transfer failed");
        emit Withdrawal(msg.sender, wad);
    }

    // ========== ERC20 标准函数 ==========
    function totalSupply() public view returns (uint256) {
        return address(this).balance; // 0.8.x 推荐用address(this)替代this
    }

    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint256 wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(
        address src,
        address dst,
        uint256 wad
    ) public returns (bool) {
        require(balanceOf[src] >= wad, "WETH9: insufficient balance");

        if (
            src != msg.sender && allowance[src][msg.sender] != type(uint256).max
        ) {
            // 0.8.x 用type(uint256).max替代uint(-1)（更规范，避免负数溢出）
            require(
                allowance[src][msg.sender] >= wad,
                "WETH9: insufficient allowance"
            );
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        balanceOf[dst] += wad;

        emit Transfer(src, dst, wad);
        return true;
    }
}
