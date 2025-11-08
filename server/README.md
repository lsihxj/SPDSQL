# SPDSQL.Server

后端：.NET 8 + PostgreSQL + OpenAI 兼容接口

## 运行

1. 确保本机 PostgreSQL 可访问，账号 `postgres/123456`，数据库 `spdsql` 已由迁移自动创建。
2. 可选：复制 `.env.example` 为 `.env` 并填写 `OPENAI_BASE_URL` 与 `OPENAI_API_KEY`（也可通过 appsettings 配置）。
3. 在 `server` 目录运行：

```bash
cd server
setx OPENAI_BASE_URL https://api.openai.com/
setx OPENAI_API_KEY sk-xxxx
# 或编辑 appsettings.Development.json 中的 OpenAI 配置

# 启动
dotnet run
```

默认启动 Swagger：http://localhost:5087/swagger

## 主要接口
- POST /api/sql/execute 执行 SQL（支持选中片段、只读、MaxRows、超时、事务）
- POST /api/sql/generate 自然语言生成 SQL（注入 SchemaDocs 上下文）
- POST /api/sql/diagnose 错误诊断并返回修正 SQL
- GET/POST/PUT/DELETE /api/queries 保存的查询 CRUD

## 本地测试
使用 VS Code REST Client 或内置 `SPDSQL.Server.http` 文件发送请求。