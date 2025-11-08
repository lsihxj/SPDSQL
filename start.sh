#!/bin/bash

echo "SPDSQL 启动脚本"
echo "================"

# 检查依赖
if ! command -v dotnet &> /dev/null; then
    echo "错误: 未找到 .NET SDK，请先安装 .NET 8"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "警告: 未找到 PostgreSQL 客户端，请确保 PostgreSQL 已安装"
fi

# 启动后端
echo ""
echo "启动后端服务..."
cd server
dotnet restore
dotnet build
dotnet run &
BACKEND_PID=$!
echo "后端进程 PID: $BACKEND_PID"

# 等待后端启动
sleep 5

# 启动前端
echo ""
echo "启动前端服务..."
cd ../client
npm install
npm run dev &
FRONTEND_PID=$!
echo "前端进程 PID: $FRONTEND_PID"

echo ""
echo "================"
echo "启动完成!"
echo "后端: http://localhost:5129"
echo "前端: http://localhost:5173"
echo "默认账户: admin / admin123"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "================"

# 捕获 Ctrl+C
trap "echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# 等待
wait
