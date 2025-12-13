合约实例：
// SPDX-License-Identifier: MIT
// 定义源代码的许可证标识符。这里是MIT许可证，表明代码可以被自由使用、复制、修改和分发。
pragma solidity ^0.8.19;
// 声明编译器版本。`pragma`是编译指示指令。`^0.8.19`表示可以使用0.8.19及以上，但低于0.9.0的编译器版本。
// 定义一个名为 `MyContract` 的智能合约
contract MyContract {
	// 声明一个私有状态变量 `initialized`，类型为布尔值（bool），初始值为 `false`。
	// `private` 意味着这个变量只能在这个合约内部被访问，外部合约或账户无法直接读取它。
	bool private initialized = false;
	// 定义一个只能被外部账户或其他合约从外部调用一次的函数
	// `external` 关键字表示这个函数只能从合约外部被调用。
	function initialize() external {
	// `require` 是一个条件检查，如果条件不满足，交易将回滚（撤销）并消耗所有Gas。
	// 这里检查 `initialized` 是否为 false。如果是true，则抛出错误信息 "Already initialized"。
	require(!initialized, "Already initialized");
	// 将 `initialized` 状态变量的值设置为 `true`。
	// 这标志着初始化工作已经完成，防止此函数被再次调用。
	initialized = true;
	// ... 其他的初始化逻辑
	// 这里通常会放置一些合约部署后需要设置的初始状态，例如设置合约所有者、初始代币供应量等。
	}
	// 一个用于验证初始化状态的公开视图函数
	// `view` 关键字表示这个函数只读取状态而不修改它，因此调用它不需要支付Gas费用（在单独调用时）。
	// `returns (bool)` 指定了这个函数执行后会返回一个布尔值。
	function isInitialized() external view returns (bool) {
	// 返回私有状态变量 `initialized` 的当前值。
	// 虽然变量是私有的，但通过这个公开的函数，外部可以查询到它的值。
	return initialized;
	}
}