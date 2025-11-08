// 测试ERD页签自动编号功能
// 在浏览器控制台中运行

console.log('=== ERD页签自动编号测试 ===');

// 测试函数：模拟多次ERD返回
function testErdNumbering() {
    console.log('\n开始测试ERD页签编号功能...');
    
    // 第一次测试
    console.log('\n1. 第一次ERD SQL - 应该创建"ERD生成SQL 1"');
    const sql1 = `-- 第一次ERD生成的SQL
SELECT id, name FROM users;`;
    localStorage.setItem('erd_generated_sql', sql1);
    console.log('已设置第一个SQL，请刷新页面查看');
    
    return {
        test2: () => {
            console.log('\n2. 第二次ERD SQL - 应该创建"ERD生成SQL 2"');
            const sql2 = `-- 第二次ERD生成的SQL
SELECT o.*, c.name 
FROM orders o 
JOIN customers c ON o.customer_id = c.id;`;
            localStorage.setItem('erd_generated_sql', sql2);
            console.log('已设置第二个SQL，请刷新页面查看');
        },
        
        test3: () => {
            console.log('\n3. 第三次ERD SQL - 应该创建"ERD生成SQL 3"');
            const sql3 = `-- 第三次ERD生成的SQL
SELECT p.*, c.name as category_name
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.status = 'active';`;
            localStorage.setItem('erd_generated_sql', sql3);
            console.log('已设置第三个SQL，请刷新页面查看');
        }
    };
}

// 执行第一次测试
const testSuite = testErdNumbering();

console.log('\n测试步骤:');
console.log('1. 刷新页面，应该看到"ERD生成SQL 1"页签');
console.log('2. 在控制台运行: testSuite.test2()');
console.log('3. 刷新页面，应该看到"ERD生成SQL 2"页签');
console.log('4. 在控制台运行: testSuite.test3()');
console.log('5. 刷新页面，应该看到"ERD生成SQL 3"页签');

console.log('\n预期结果:');
console.log('- 每次都应该创建带有递增编号的新页签');
console.log('- 编号应该基于现有ERD页签的数量');
console.log('- 不应该覆盖任何现有页签');

// 将测试函数暴露到全局作用域
window.testSuite = testSuite;

console.log('\n=== 请刷新页面开始第一次测试 ===');