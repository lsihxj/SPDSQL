// 快速测试ERD页签编号
console.log('=== 快速测试ERD编号功能 ===');

// 设置第一个测试SQL
localStorage.setItem('erd_generated_sql', 'SELECT 1 AS test_number_1;');
console.log('✓ 已设置第一个测试SQL');
console.log('请刷新页面，应该看到"ERD生成SQL 1"页签');

console.log('\n刷新后请在控制台运行以下代码测试第二个页签:');
console.log(`localStorage.setItem('erd_generated_sql', 'SELECT 2 AS test_number_2;');`);
console.log('然后再次刷新，应该看到"ERD生成SQL 2"页签');

console.log('\n预期行为:');
console.log('- 第一次: 创建"ERD生成SQL 1"');
console.log('- 第二次: 创建"ERD生成SQL 2"');
console.log('- 第三次: 创建"ERD生成SQL 3"');
console.log('- 以此类推...');