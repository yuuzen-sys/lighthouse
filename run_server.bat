@echo off
chcp 65001 > nul
cd /d "%~dp0"
py -3 -m uvicorn shinbun_app.main:app --port 8001
pause
