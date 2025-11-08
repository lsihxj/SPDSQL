// 测试ERD功能 - 验证总是创建新页签
// 在浏览器控制台中运行

console.log('=== ERD新页签创建测试 ===');

// 测试函数：检查当前页签状态
function checkTabState() {
    // 这个函数需要在实际的React应用中运行
    // 这里只是示例代码
    console.log('当前页签数量:', document.querySelectorAll('[role="tab"]').length);
    console.log('活动页签:', document.querySelector('[role="tab"][aria-selected="true"]')?.textContent);
}

// 1. 第一次测试 - 在默认状态下添加ERD SQL
console.log('1. 第一次测试 - 设置ERD SQL');
const testSql1 = `-- 第一次ERD生成的SQL
SELECT * FROM users WHERE created_at > '2024-01-01';`;

localStorage.setItem('erd_generated_sql', testSql1);
console.log('已设置第一个测试SQL，请刷新页面查看效果');

// 提供第二次测试的代码
console.log('\n2. 第二次测试代码（刷新后在控制台运行）:');
console.log(`
// 第二次测试 - 在已有页签的情况下添加ERD SQL
const testSql2 = \`-- 第二次ERD生成的SQL
SELECT o.*, c.name 
FROM orders o 
JOIN customers c ON o.customer_id = c.id 
WHERE o.status = 'completed';\`;

localStorage.setItem('erd_generated_sql', testSql2);
console.log('已设置第二个测试SQL，请再次刷新页面查看效果');
`);

console.log('\n预期行为:');
console.log('- 第一次刷新后应该创建"ERD生成SQL"页签');
console.log('- 第二次刷新后应该再创建一个新的"ERD生成SQL"页签');
console.log('- 不应该覆盖任何现有页签');
console.log('- 新创建的页签应该成为活动页签');

console.log('=== 请刷新页面开始测试 ===');