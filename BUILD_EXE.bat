@echo off
cd /d "%~dp0"

title WWM Monitor - Build
echo ================================
echo  WWM Monitor - Building...
echo ================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js nicht gefunden! https://nodejs.org
    pause & exit /b 1
)

if not exist "dist\wwm_service.exe" (
    echo [1/3] Building Python service...
    python -m PyInstaller wwm_service.spec
    if %errorlevel% neq 0 ( echo [ERROR] PyInstaller fehlgeschlagen! & pause & exit /b 1 )
) else (
    echo [1/3] wwm_service.exe bereits vorhanden, wird uebersprungen.
)

echo [2/3] Installing Electron deps...
call npm install
if %errorlevel% neq 0 ( echo [ERROR] npm install fehlgeschlagen! & pause & exit /b 1 )

echo [3/3] Building EXE...
call npm run build

if %errorlevel% neq 0 (
    echo [ERROR] Electron build fehlgeschlagen!
    pause
) else (
    echo.
    echo ================================
    echo  BUILD ERFOLGREICH!
    echo  EXE liegt in: dist\
    echo ================================
    pause
)
