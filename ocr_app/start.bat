@echo off
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python from https://www.python.org/
    pause
    exit /b 1
)

python -m pip install fastapi "uvicorn[standard]" python-multipart openpyxl easyocr opencv-python-headless Pillow anthropic >nul 2>&1

start "" http://localhost:8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000

pause
