@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости...
  call npm install
)
echo Собираю приложение...
call npm run build
start "Life OS" cmd /c "node serve.mjs"
timeout /t 2 /nobreak >nul
start http://localhost:8080
echo.
echo Life OS запущен: http://localhost:8080
echo С телефона (та же Wi-Fi сеть): http://IP-компьютера:8080
echo Узнать IP компьютера: выполни ipconfig и найди строку IPv4-адрес.
pause