# SPDSQL - SQL 智能编辑器系统

## 系统概述

SPDSQL 是一个基于 PostgreSQL 的智能 SQL 编辑器，集成了 AI 大模型能力，能够辅助用户通过自然语言生成 SQL 语句、执行查询、查看结果、诊断错误并管理 SQL 脚本。

## 功能特性

### 核心功能
- ✅ **SQL 编辑器**：基于 Monaco Editor 的专业 SQL 编辑体验
  - 语法高亮 (PostgreSQL)
  - 代码格式化
  - 选中执行
  - 查找/替换功能 (Ctrl+F / Ctrl+H)
  
- ✅ **SQL 执行**：支持多种执行模式
  - 全文执行
  - 选中部分执行
  - 只读模式保护
  - 事务支持
  - 超时控制
  - 行数限制
  
- ✅ **AI 辅助**：智能 SQL 生成与诊断
  - 自然语言生成 SQL
  - 错误诊断与修正建议
  - 基于数据库 Schema 的上下文理解
  
- ✅ **查询管理**：保存和复用 SQL 查询
  - 保存常用查询
  - 快速加载历史查询
  - 标题和描述管理
  
- ✅ **结果展示**：清晰的查询结果展示
  - 表格形式展示 SELECT 结果
  - 显示影响行数和执行时间
  - CSV 导出功能

### 界面特性
- 可拖动的分割面板 (15%-85% 可调)
- 响应式布局
- 双击分割条重置为默认 30%
- 编辑器/结果区域动态分配 (70%/30%)

## 技术栈

### 前端
- React 18
- TypeScript
- Vite
- Material-UI
- Monaco Editor
- React Query
- Axios (带请求/响应拦截器)
- sql-formatter
- papaparse

### 后端
- .NET 8
- ASP.NET Core Web API
- Entity Framework Core
- PostgreSQL (Npgsql)
- JWT 认证
- BCrypt 密码哈希

### AI 集成
- OpenAI 兼容 API
- 支持自定义 BaseUrl 和 Model

## 快速开始

### 前置要求
- Node.js 18+
- .NET 8 SDK
- PostgreSQL 数据库

### 1. 数据库配置

创建 PostgreSQL 数据库:
```sql
CREATE DATABASE spdsql;
```

### 2. 后端配置

编辑 `server/appsettings.json`:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=spdsql;Username=postgres;Password=yourpassword"
  },
  "OpenAI": {
    "BaseUrl": "https://api.openai.com",
    "ApiKey": "your-api-key-here",
    "Model": "gpt-4o-mini"
  },
  "Jwt": {
    "Key": "your-secret-key-at-least-32-characters-long"
  }
}
```

### 3. 运行后端

```bash
cd server
dotnet restore
dotnet ef database update  # 创建数据库表
dotnet run
```

后端将在 `http://localhost:5129` 启动

### 4. 运行前端

```bash
cd client
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动

### 5. 登录

默认管理员账户:
- 用户名: `admin`
- 密码: `admin123`

## API 文档

### 认证 API
- `POST /api/auth/login` - 用户登录

### SQL 执行 API
- `POST /api/sql/execute` - 执行 SQL
- `POST /api/sql/generate` - AI 生成 SQL
- `POST /api/sql/diagnose` - 诊断 SQL 错误

### 查询管理 API
- `GET /api/queries` - 获取已保存查询列表
- `POST /api/queries` - 保存新查询
- `PUT /api/queries/{id}` - 更新查询
- `DELETE /api/queries/{id}` - 删除查询

### Schema 管理 API
- `GET /api/schema` - 获取 Schema 文档
- `POST /api/schema` - 更新 Schema 文档
- `POST /api/schema/auto-generate` - 自动生成 Schema 文档

## 配置说明

### SQL 执行选项

在设置页面可配置:
- **只读执行**: 禁止 INSERT/UPDATE/DELETE 等修改操作
- **开启事务**: 将 SQL 执行包裹在事务中
- **最大行数**: 限制查询返回的最大行数 (默认 1000)
- **超时(秒)**: SQL 执行的超时时间 (默认 30 秒)

### AI 配置

支持 OpenAI 兼容的 API:
- OpenAI 官方 API
- Azure OpenAI
- 其他兼容 OpenAI 格式的本地/第三方服务

## Schema 文档管理

为了让 AI 更好地生成 SQL,需要维护数据库 Schema 文档:

### 自动生成
```bash
POST /api/schema/auto-generate?schemaName=public
```

### 手动编辑
通过 API 或数据库直接编辑 `SchemaDocs` 表

Schema 文档格式示例:
```
Columns:
  - id: integer NOT NULL
  - username: varchar(100) NOT NULL
  - email: varchar(255) NULL
  - created_at: timestamp NOT NULL DEFAULT now()
```

## 快捷键

### Monaco 编辑器
- `Ctrl + F` - 查找
- `Ctrl + H` - 查找并替换
- `F3` - 查找下一个
- `Shift + F3` - 查找上一个
- `Ctrl + /` - 注释/取消注释

### 应用快捷操作
- 双击分割条 - 重置面板宽度为 30%

## 安全注意事项

1. **修改默认密码**: 首次登录后立即修改 admin 密码
2. **JWT 密钥**: 生产环境使用强随机密钥
3. **数据库权限**: 使用受限权限的数据库账户
4. **只读模式**: 默认启用只读模式,防止误操作
5. **API 密钥**: 妥善保管 OpenAI API 密钥

## 故障排除

### 前端无法连接后端
- 检查后端是否正常运行
- 检查 CORS 配置
- 确认 API 地址 (`client/src/lib/api.ts`)

### AI 功能不工作
- 检查 OpenAI API Key 是否正确
- 检查 BaseUrl 是否可访问
- 查看后端日志获取详细错误

### 数据库连接失败
- 检查连接字符串是否正确
- 确认 PostgreSQL 服务正在运行
- 检查数据库用户权限

## 开发计划

- [ ] 用户管理功能
- [ ] 查询历史记录
- [ ] SQL 执行计划分析
- [ ] 数据可视化图表
- [ ] 多标签页编辑器
- [ ] 主题切换
- [ ] 国际化支持

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request!
