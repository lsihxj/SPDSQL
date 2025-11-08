# 测试ERD功能的步骤

## 方法1：手动测试
1. 打开应用：http://localhost:5174/
2. 打开浏览器开发者工具（F12）
3. 在控制台中执行以下代码设置测试SQL：
```javascript
localStorage.setItem('erd_generated_sql', `-- ERD生成的测试SQL
SELECT 
    o.id,
    o.order_date,
    o.total_amount,
    c.customer_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY o.total_amount DESC
LIMIT 10;`);
```
4. 刷新页面（F5）
5. 查看控制台日志，应该能看到相关的调试信息
6. 检查是否创建了新的"ERD生成SQL"页签

## 方法2：通过ERD页面测试
1. 打开应用：http://localhost:5174/
2. 点击"实体关系图"按钮
3. 在ERD页面中生成SQL
4. 点击"插入编辑器并返回"按钮
5. 检查是否自动创建了新页签

## 预期结果
- 控制台应该显示调试日志
- 应该自动创建一个带编号的新页签（如"ERD生成SQL 1"、"ERD生成SQL 2"等）
- 编号会根据现有ERD页签数量自动递增
- 新页签应该包含生成的SQL内容
- 新页签应该自动成为当前活动页签
- 原有的页签应该保持不变
- 不会覆盖同名页签