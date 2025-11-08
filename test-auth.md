# 认证问题排查指南

## 问题描述
点击"运行"按钮时出现 401 Unauthorized 错误

## 已实施的修复

### 1. 在 App.tsx 中添加 token 检查
```typescript
useEffect(() => {
  const token = localStorage.getItem('token')
  if (token) {
    setAuthToken(token)
  }
}, [])
```

### 2. 在每次 API 请求前确保 token 已设置
```typescript
const execMutation = useMutation({
  mutationFn: async (payload: any) => {
    // 确保每次请求都有token
    const token = localStorage.getItem('token')
    if (token) {
      setAuthToken(token)
    } else {
      return { success: false, error: '未登录，请重新登录' }
    }
    // ... 执行请求
  }
})
```

## 验证步骤

### 步骤1: 检查浏览器控制台
打开浏览器开发者工具 (F12)，查看:
1. **Application -> Local Storage** 中是否有 `token` 键
2. **Network** 标签页中请求的 Headers 是否包含 `Authorization: Bearer xxx`

### 步骤2: 手动测试 API

使用浏览器控制台执行:
```javascript
// 检查 token
console.log('Token:', localStorage.getItem('token'))

// 检查 API 认证头
console.log('API Headers:', api.defaults.headers.common)
```

### 步骤3: 测试登录流程
1. 清除浏览器缓存和 Local Storage
2. 刷新页面
3. 使用 `admin` / `admin123` 登录
4. 登录成功后，检查 Local Storage 中的 token
5. 尝试执行 SQL

### 步骤4: 检查后端日志
查看后端控制台输出，确认:
1. 数据库连接正常
2. JWT 配置正确
3. 没有其他错误

## 常见原因及解决方案

### 原因1: Token 未正确保存
**症状**: Local Storage 中没有 token
**解决**: 
- 检查登录API是否返回了 token
- 检查 Login.tsx 中是否正确保存了 token

### 原因2: Token 未添加到请求头
**症状**: Network 请求中没有 Authorization 头
**解决**: 
- 确保调用了 `setAuthToken(token)`
- 检查 api.ts 中的 setAuthToken 实现

### 原因3: Token 格式错误
**症状**: 后端返回 401 且日志显示 token 无效
**解决**:
- 检查 JWT 密钥配置 (前后端应一致)
- 确认 token 格式为 `Bearer <token>`

### 原因4: Token 过期
**症状**: 刚登录可以用，过一段时间就 401
**解决**:
- 检查 AuthController 中的 token 过期时间设置
- 实现 token 刷新机制

### 原因5: CORS 问题
**症状**: 浏览器控制台显示 CORS 错误
**解决**:
- 检查 Program.cs 中的 CORS 配置
- 确保开发环境允许 localhost:5173

## 当前配置检查清单

- [x] vite.config.ts 中配置了 proxy
- [x] AppRouter.tsx 在初始化时设置 token
- [x] App.tsx 在渲染时再次确保 token
- [x] 每次 mutation 前检查并设置 token
- [x] Login.tsx 登录成功后保存并设置 token
- [x] api.ts 实现了 setAuthToken 函数
- [x] Program.cs 配置了 JWT 认证
- [x] SqlController 添加了 [Authorize] 特性

## 调试技巧

### 在浏览器控制台执行以下代码:

```javascript
// 1. 检查 token
console.log('Token exists:', !!localStorage.getItem('token'))
console.log('Token value:', localStorage.getItem('token')?.substring(0, 20) + '...')

// 2. 手动设置 token (如果需要)
const token = localStorage.getItem('token')
if (token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  console.log('Token set manually')
}

// 3. 测试 API 请求
api.post('/api/sql/execute', {
  sqlText: 'SELECT 1 AS test',
  runSelectedOnly: false,
  readOnly: true,
  maxRows: 1000,
  timeoutSeconds: 30,
  useTransaction: false
})
.then(res => console.log('Success:', res.data))
.catch(err => console.error('Error:', err.response || err))
```

## 如果问题仍然存在

请提供以下信息:
1. 浏览器控制台的完整错误信息
2. Network 标签中失败请求的 Headers
3. 后端控制台的日志输出
4. Local Storage 中的 token 值 (前20个字符即可)
