@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo  店舗写真OCRアプリ 起動スクリプト
echo ========================================
echo.

REM Python確認
python --version > nul 2>&1
if errorlevel 1 (
    echo [エラー] Pythonが見つかりません。
    echo Pythonをインストールしてください: https://www.python.org/
    pause
    exit /b 1
)

echo [OK] Python:
python --version
echo.

REM ライブラリ確認・インストール
echo [確認] 必要なライブラリをチェックしています...
python -c "import fastapi, uvicorn" 2>nul
if errorlevel 1 (
    echo [インストール] ライブラリをインストールしています...
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [エラー] インストールに失敗しました。
        pause
        exit /b 1
    )
)
echo [OK] ライブラリ確認完了
echo.

REM ブラウザを遅延で開く
start "" /B cmd /C "timeout /T 3 /NOBREAK > nul && start http://localhost:8000"

echo [起動] サーバーを起動しています...
echo [URL]  http://localhost:8000
echo [終了] このウィンドウを閉じるか Ctrl+C で終了します
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo サーバーが終了しました。
pause
