// 简单的ERD功能测试脚本
// 在浏览器控制台中运行

console.log('=== ERD功能测试开始 ===');

// 1. 设置测试SQL
const testSql = `-- ERD生成的测试SQL
SELECT 
    o.id,
    o.order_date,
    o.total_amount,
    c.customer_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY o.total_amount DESC
LIMIT 10;`;

console.log('1. 设置测试SQL到localStorage');
localStorage.setItem('erd_generated_sql', testSql);

// 2. 检查localStorage
console.log('2. 检查localStorage中的SQL:');
const storedSql = localStorage.getItem('erd_generated_sql');
console.log('存储的SQL长度:', storedSql ? storedSql.length : 0);
console.log('存储的SQL前50字符:', storedSql ? storedSql.substring(0, 50) + '...' : 'null');

// 3. 刷新页面来触发检查
console.log('3. 请刷新页面来测试功能');
console.log('刷新后请检查:');
console.log('- 控制台是否有相关日志');
console.log('- 是否创建了"ERD生成SQL"页签');
console.log('- 新页签是否包含正确的SQL内容');

console.log('=== 测试脚本执行完成，请刷新页面 ===');