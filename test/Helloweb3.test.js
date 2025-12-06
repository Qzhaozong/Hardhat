// 导入和设置
const { expect } = require('chai');
const { ethers } = require('hardhat');

// 定义测试套件
describe('Helloweb3 合约测试', function () {
    let helloweb3;  // 声明一个变量，用于存储部署后的合约实例
    let owner;  // 声明变量，用于存储部署者帐户
    // 定义钩子，用于测试前准备
    before(async function () {
        // 只部署一次合约
        [owner] = await ethers.getSigners();     // 获取测试帐户列表，解构赋值获取第一个帐户作为部署者
        console.log('部署者地址：', owner.address);  // 打印部署者地址用于调试
        // 导入合约并进行部署
        // 获取合约工厂 通过合约名获取工厂对象 使用await 等待一步操作完成
        const Helloweb3 = await ethers.getContractFactory('Helloweb3');
        // 使用deploy 部署合约 await 等待合约部署完成
        const contract = await Helloweb3.deploy();
        // 等待合约部署完成 交易被矿工确认
        await contract.waitForDeployment();
        helloweb3 = contract;   // 将部署后的合约实例赋值给变量
        const address = await contract.getAddress();    // 获取合约的区块链地址
        console.log('合约部署成功，地址：', address);   // 打印合约成功信息，并且打印合约地址
    });
    // 部署测试
    describe('部署测试', function () {  // 定义一个测试套件
        it('应该有有效的合约地址', async function () {   // 定义一个具体的测试用例
            const address = await helloweb3.getAddress(); //  再次获取合约地址
            expect(address).to.be.a('string');  // 断言，地址应该是字符串类型
            expect(address).to.match(/^0x[a-fA-F0-9]{40}$/) // 断言，地址应该符合以太坊地址格式 地址是以Ox开头 /^0x[a-fA-F0-9]{40}$/ 表示40个十六进制字符
            console.log('合约地址：', address);  // 打印地址用于验证
        });
        // 字节码验证
        it('应该能获取合约字节码', async function () {  // 定义另一个测试用例
            const address = await helloweb3.getAddress();  // 获取合约地址
            const code = await ethers.provider.getCode(address);  // 从区块链获取合约字节码，ethers.provider 区块链提供者对象，getCode(address) 获取指定地址的代码
            expect(code).to.not.equal('0x');    // 断言，字节码不应该为空（Ox表示空账号）
            expect(code.length).to.be.greaterThan(100); // 断言，字节码长度应该大于100
            console.log('字节码长度：', code.length);   // 答应字节码长度
        });
        // 功能测试
        describe('合约功能测试', async function () {  // 定义一个新的测试子套件，测试合约功能
            it('应该正确初始化，_string 变量', async function () {    // 初始化 测试用例
                const greeting = await helloweb3._string(); // 调用合约_string 函数 这是一个public 状态变量的getter函数
                expect(greeting).to.equal('Hello Web3');    // 断言，返回的值应该是"Hello Web3"
                console.log('_string 值：', greeting);  // 打印返回值
            });
            // 合约权限测试
            it('应该允许公开获取', async function () {  // 合约权限用例
                const [_, addr1] = await ethers.getSigners();    // 获取另外一个帐户(非部署者)，使用_忽略第一个帐户(部署者)
                const greeting = await helloweb3.connect(addr1)._string();  // 使用另外一个帐户连接合约，并读取，connect(addr1)指定帐户连接
                expect(greeting).to.equal('Hello Web3');    // 断言，其他用户也能正常读取
            });
        });
    });
    // 单独部署测试
    describe('部署过程测试', function () {  // 另外一个独立的测试套件
        it('应该能正常部署合约', async function () {    // 独立的测试用例
            const [deployer] = await ethers.getSigners();    // 重新获取部署者帐户
            console.log("\n=== 开始部署测试 ===");  // 打印分割线
            console.log("部署者：", deployer.address)   // 打印部署者地址
            const Helloweb3 = await ethers.getContractFactory('Helloweb3'); // 再次获取合约工厂
            console.log('获取合约工厂成功');
            // 部署合约
            const contract = await Helloweb3.deploy();  // 部署合约
            console.log('发送部署交易');
            // 等待部署完成
            await contract.waitForDeployment(); // 等待部署确认
            console.log('部署完成');
            // 验证独立部署
            const address = await contract.getAddress();    // 获取合约地址
            console.log('合约地址', address);
            const greeting = await contract._string();  // 调用合约函数
            console.log('合约返回', greeting);
            expect(greeting).to.equal('Hello Web3');    // 断言验证 
            expect(address).to.match(/^0x[a-fA-F0-9]{40}$/);    // 断言验证地址格式
        });
    });
});