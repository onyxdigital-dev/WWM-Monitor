@echo off
title WWM Monitor Setup
echo ================================
echo  WWM Monitor - Starting...
echo ================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js nicht gefunden!
    echo Bitte installieren: https://nodejs.org
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python nicht gefunden!
    echo Bitte installieren: https://python.org
    pause
    exit /b 1
)

echo [1/3] Installing Python dependencies...
pip install websockets psutil requests -q
if %errorlevel% neq 0 (
    echo [ERROR] pip install fehlgeschlagen!
    pause
    exit /b 1
)

echo [2/3] Installing Node dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install fehlgeschlagen!
    pause
    exit /b 1
)

echo [3/3] Starting WWM Monitor...
echo.
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Electron konnte nicht starten. Fehlercode: %errorlevel%
    pause
)
