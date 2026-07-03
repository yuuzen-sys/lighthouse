@echo off
cd /d "%~dp0"
py -3 -m pip install -r requirements.txt -q 2>nul
start http://localhost:8200
py -3 -m uvicorn main:app --host 0.0.0.0 --port 8200
pause
