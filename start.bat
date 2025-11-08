@echo off
echo SPDSQL 启动脚本
echo ================

REM 检查依赖
where dotnet >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 .NET SDK，请先安装 .NET 8
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

REM 启动后端
echo.
echo 启动后端服务...
cd server
start "SPDSQL Backend" cmd /k "dotnet restore && dotnet build && dotnet run"

REM 等待后端启动
timeout /t 5 /nobreak >nul

REM 启动前端
echo.
echo 启动前端服务...
cd ..\client
start "SPDSQL Frontend" cmd /k "npm install && npm run dev"

echo.
echo ================
echo 启动完成!
echo 后端: http://localhost:5129
echo 前端: http://localhost:5173
echo 默认账户: admin / admin123
echo.
echo 关闭窗口可停止服务
echo ================
pause
