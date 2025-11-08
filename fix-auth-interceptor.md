# 认证问题修复说明

## 🎯 问题描述
刷新页面时出现 `GET http://localhost:5173/api/queries 401 (Unauthorized)` 错误

## 🔍 根本原因
React Query 的 `useQuery` 在组件挂载时立即发起请求，但此时认证 Token 还未设置到请求头中，导致后端返回 401 错误。

## ✅ 解决方案

### 实施了请求/响应拦截器（最佳实践）

在 `client/src/lib/api.ts` 中添加了 axios 拦截器：

```typescript
// 请求拦截器：统一处理认证头
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：处理401错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token失效，清除并跳转登录
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)
```

## 🎁 优势

### 1. **自动化认证**
- 每个请求自动从 localStorage 读取最新的 token
- 无需在每个 API 调用处手动设置认证头
- 解决了竞态条件问题

### 2. **集中式错误处理**
- 统一处理 401 未授权错误
- 自动清除失效的 token
- 自动重定向到登录页

### 3. **代码简化**
- 移除了分散在各处的 token 设置代码
- 不需要在每个组件中检查 token
- 符合 DRY (Don't Repeat Yourself) 原则

### 4. **更好的用户体验**
- Token 过期时自动跳转登录
- 避免显示错误的空白页面
- 减少用户困惑

## 📝 相关修改

### 修改的文件
1. ✅ `client/src/lib/api.ts` - 添加请求/响应拦截器
2. ✅ `client/src/pages/App.tsx` - 简化认证逻辑

### 保持不变的文件
- `client/src/AppRouter.tsx` - 仍在初始化时检查登录状态
- `client/src/pages/Login.tsx` - 登录流程不变

## 🧪 测试步骤

### 1. 正常登录流程
```
1. 打开应用
2. 输入 admin / admin123
3. 点击登录
4. ✅ 应该成功进入主界面
5. ✅ 右侧应该显示已保存查询列表
```

### 2. 刷新页面测试
```
1. 登录后，按 F5 刷新页面
2. ✅ 应该保持登录状态
3. ✅ 不应该出现 401 错误
4. ✅ 已保存查询应该正常加载
```

### 3. Token 过期测试
```
1. 登录后，打开开发者工具 (F12)
2. Application -> Local Storage -> 删除 token
3. 点击"运行"按钮执行 SQL
4. ✅ 应该自动跳转到登录页
```

### 4. SQL 执行测试
```
1. 登录后，在编辑器输入: SELECT 1 AS test;
2. 点击"运行"
3. ✅ 应该显示查询结果
4. ✅ 不应该有 401 错误
```

## 🔧 技术细节

### 拦截器执行顺序
```
1. 用户发起请求 (api.get/post)
   ↓
2. 请求拦截器执行
   - 从 localStorage 读取 token
   - 设置 Authorization 头
   ↓
3. 发送到服务器
   ↓
4. 响应拦截器执行
   - 检查是否 401
   - 如果是，清除 token 并刷新页面
   ↓
5. 返回给调用者
```

### 与 React Query 的配合
```typescript
// React Query 自动重试机制
const { data } = useQuery({
  queryKey: ['saved'],
  queryFn: async () => (await api.get('/api/queries')).data,
  retry: 1, // 401 错误时不重试（会触发拦截器）
})
```

## 🚀 未来优化建议

### 1. Token 刷新机制
```typescript
// 在 token 即将过期时自动刷新
api.interceptors.response.use(
  (response) => {
    const expiresIn = response.headers['x-token-expires-in']
    if (expiresIn && parseInt(expiresIn) < 300) {
      // 5分钟内过期，自动刷新
      refreshToken()
    }
    return response
  }
)
```

### 2. 请求队列
```typescript
// 当 token 刷新时，暂停其他请求
let isRefreshing = false
let requestQueue = []

api.interceptors.request.use(async (config) => {
  if (isRefreshing) {
    // 等待 token 刷新完成
    await new Promise(resolve => requestQueue.push(resolve))
  }
  // ... 设置 token
})
```

### 3. 更友好的错误提示
```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 显示提示消息
      showNotification('登录已过期，请重新登录')
      // 延迟跳转，让用户看到消息
      setTimeout(() => window.location.reload(), 1500)
    }
    return Promise.reject(error)
  }
)
```

## 📚 参考资料

- [Axios 拦截器文档](https://axios-http.com/docs/interceptors)
- [React Query 认证模式](https://tanstack.com/query/latest/docs/react/guides/authentication)
- [JWT 最佳实践](https://tools.ietf.org/html/rfc8725)

## ✨ 总结

通过实施请求/响应拦截器，我们：
1. ✅ 解决了刷新页面 401 错误
2. ✅ 实现了自动化认证管理
3. ✅ 统一了错误处理逻辑
4. ✅ 简化了应用代码
5. ✅ 提升了用户体验

现在可以放心地刷新页面了！🎉
