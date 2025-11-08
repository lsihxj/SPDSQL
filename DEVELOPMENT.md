# SPDSQL 开发指南

## 项目结构

```
SPDSQL/
├── client/                 # 前端项目
│   ├── src/
│   │   ├── lib/           # 工具库
│   │   │   └── api.ts     # API 客户端
│   │   ├── pages/         # 页面组件
│   │   │   ├── App.tsx    # 主应用
│   │   │   ├── Login.tsx  # 登录页
│   │   │   └── Settings.tsx  # 设置页
│   │   ├── AppRouter.tsx  # 路由管理
│   │   └── main.tsx       # 入口文件
│   ├── package.json
│   └── vite.config.ts
│
├── server/                # 后端项目
│   ├── Controllers/       # API 控制器
│   │   ├── AuthController.cs
│   │   ├── SqlController.cs
│   │   ├── QueriesController.cs
│   │   └── SchemaDocsController.cs
│   ├── Services/          # 业务服务
│   │   ├── SqlExecutionService.cs
│   │   └── AiService.cs
│   ├── Data/              # 数据访问
│   │   └── AppDbContext.cs
│   ├── Models/            # 数据模型
│   │   ├── Entities.cs
│   │   └── AuthModels.cs
│   ├── Migrations/        # EF Core 迁移
│   ├── Program.cs         # 入口
│   └── appsettings.json   # 配置
│
├── README.md
├── DEVELOPMENT.md
├── .env.example
├── start.sh
└── start.bat
```

## 前端开发

### 技术选型
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 库**: Material-UI
- **编辑器**: Monaco Editor
- **状态管理**: React Query (服务端状态)
- **HTTP 客户端**: Axios
- **其他工具**: 
  - sql-formatter (SQL 格式化)
  - papaparse (CSV 导出)

### 开发流程

1. **启动开发服务器**
```bash
cd client
npm run dev
```

2. **代码规范**
- 使用 TypeScript 严格模式
- 遵循 React Hooks 最佳实践
- 使用函数式组件

3. **组件开发建议**
- 保持组件单一职责
- 使用 React Query 管理服务端数据
- 使用 localStorage 持久化用户设置
- 错误边界处理

### API 调用

使用 `api.ts` 中的 axios 实例:
```typescript
import { api } from '@/lib/api'

// GET 请求
const { data } = await api.get('/api/queries')

// POST 请求
const { data } = await api.post('/api/sql/execute', payload)
```

### React Query 使用

```typescript
// 查询
const { data, isLoading } = useQuery({
  queryKey: ['saved'],
  queryFn: async () => (await api.get('/api/queries')).data
})

// 变更
const mutation = useMutation({
  mutationFn: async (payload) => {
    const { data } = await api.post('/api/sql/execute', payload)
    return data
  }
})
```

## 后端开发

### 技术选型
- **框架**: ASP.NET Core 8
- **ORM**: Entity Framework Core
- **数据库**: PostgreSQL (Npgsql)
- **认证**: JWT Bearer Token
- **密码**: BCrypt

### 开发流程

1. **启动开发服务器**
```bash
cd server
dotnet watch run
```

2. **数据库迁移**

创建迁移:
```bash
dotnet ef migrations add MigrationName
```

应用迁移:
```bash
dotnet ef database update
```

回滚迁移:
```bash
dotnet ef database update PreviousMigrationName
```

3. **添加新 API 端点**

步骤:
1. 在 `Controllers/` 创建控制器
2. 添加 `[ApiController]` 和 `[Route]` 特性
3. 添加 `[Authorize]` (如需认证)
4. 实现业务逻辑或调用 Service

示例:
```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MyController : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(new { message = "Hello" });
    }
}
```

4. **添加新 Service**

步骤:
1. 在 `Services/` 创建服务类
2. 在 `Program.cs` 注册服务
3. 通过依赖注入使用

```csharp
// Service
public class MyService
{
    public async Task<string> DoSomething()
    {
        return "Done";
    }
}

// Program.cs
builder.Services.AddScoped<MyService>();

// Controller
public class MyController : ControllerBase
{
    private readonly MyService _service;
    
    public MyController(MyService service)
    {
        _service = service;
    }
}
```

## 数据库设计

### 核心表

**SavedQuery** - 保存的查询
- Id (Guid, PK)
- Title (string, 必填)
- Description (string, 可选)
- SqlText (string, 必填)
- Tags (string[], 可选)
- CreatedAt (DateTime)
- UpdatedAt (DateTime)

**SchemaDoc** - Schema 文档
- Id (Guid, PK)
- SchemaName (string, 默认 "public")
- TableName (string, 必填)
- Document (string, 必填)
- UpdatedAt (DateTime)

**UserAccount** - 用户账户
- Id (Guid, PK)
- Username (string, 唯一, 必填)
- PasswordHash (string, 必填)
- Role (string, 默认 "Reader")
- CreatedAt (DateTime)

**ExecutionLog** - 执行日志
- Id (Guid, PK)
- SqlText (string)
- IsReadOnly (bool)
- Success (bool)
- Error (string, 可选)
- AffectedRows (int)
- ExecutedAt (DateTime)

**AiSession** - AI 会话
- Id (Guid, PK)
- Topic (string)
- MessagesJson (string, JSON 格式)
- UpdatedAt (DateTime)

## AI 服务集成

### OpenAI 兼容 API

配置 `appsettings.json`:
```json
{
  "OpenAI": {
    "BaseUrl": "https://api.openai.com",
    "ApiKey": "sk-...",
    "Model": "gpt-4o-mini"
  }
}
```

### 支持的服务
- OpenAI 官方
- Azure OpenAI
- 本地部署的兼容服务 (如 LM Studio)

### Prompt 设计原则
1. 清晰的系统角色定义
2. 提供完整的 Schema 上下文
3. 明确输出格式要求
4. 添加约束和最佳实践指导

## 测试

### 前端测试
```bash
cd client
npm run test
```

### 后端测试
```bash
cd server
dotnet test
```

### 手动测试

1. 使用 Swagger UI: `http://localhost:5129/swagger`
2. 使用 Postman 或其他 API 测试工具

## 部署

### Docker 部署 (推荐)

创建 `Dockerfile`:
```dockerfile
# 前端构建
FROM node:18 AS frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 后端构建
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend
WORKDIR /app/server
COPY server/*.csproj ./
RUN dotnet restore
COPY server/ ./
RUN dotnet publish -c Release -o out

# 运行时
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=backend /app/server/out ./
COPY --from=frontend /app/client/dist ./wwwroot
EXPOSE 5129
ENTRYPOINT ["dotnet", "SPDSQL.Server.dll"]
```

### 传统部署

1. **前端**:
```bash
cd client
npm run build
# 将 dist/ 目录部署到静态文件服务器
```

2. **后端**:
```bash
cd server
dotnet publish -c Release -o ./publish
# 部署 publish/ 目录到服务器
```

## 常见问题

### Q: 如何添加新的数据库表?
A: 
1. 在 `Models/Entities.cs` 定义实体类
2. 在 `Data/AppDbContext.cs` 添加 DbSet
3. 运行 `dotnet ef migrations add AddNewTable`
4. 运行 `dotnet ef database update`

### Q: 如何修改 JWT 过期时间?
A: 在 `AuthController.cs` 修改 token 生成代码中的 `expires` 参数

### Q: 如何支持更多数据库类型?
A: 当前仅支持 PostgreSQL。要支持其他数据库:
1. 修改 `SqlExecutionService` 的连接逻辑
2. 更新 `AiService` 的 Prompt (不同数据库语法不同)
3. 调整 EF Core Provider

### Q: 如何自定义 Monaco Editor 主题?
A: 在 `App.tsx` 的 Editor 组件添加 `theme` prop

## 贡献指南

1. Fork 项目
2. 创建特性分支: `git checkout -b feature/AmazingFeature`
3. 提交更改: `git commit -m 'Add some AmazingFeature'`
4. 推送到分支: `git push origin feature/AmazingFeature`
5. 提交 Pull Request

## 代码规范

### TypeScript/React
- 使用 ESLint + Prettier
- 遵循 Airbnb React Style Guide
- 优先使用函数式组件和 Hooks

### C#
- 遵循 Microsoft C# Coding Conventions
- 使用 async/await 处理异步
- 添加 XML 文档注释

## 性能优化

### 前端
- 使用 React.memo 避免不必要的重渲染
- 使用 React Query 的缓存机制
- Monaco Editor 懒加载

### 后端
- 使用数据库连接池
- 添加适当的索引
- 实现查询结果缓存
- 使用分页避免大结果集

## 安全最佳实践

1. **密码**: 使用 BCrypt 哈希,永不明文存储
2. **JWT**: 使用强密钥,设置合理过期时间
3. **SQL 注入**: 使用参数化查询 (已实现)
4. **CORS**: 生产环境配置具体域名
5. **HTTPS**: 生产环境必须使用 HTTPS
6. **API 密钥**: 使用环境变量,永不提交到代码库

## 许可证

MIT License
