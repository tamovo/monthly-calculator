@echo off
title Monthly Calculator
cd /d "%~dp0"
set GOOGLE_CLIENT_ID=238431479767-de9ljde24p7mnr9b9o7iapteukk4k0qq.apps.googleusercontent.com
echo Starting Monthly Calculator...
python server.py
if %errorlevel% neq 0 (
    echo.
    echo Python was not found on your system.
    echo Install it from https://www.python.org ^(tick "Add to PATH"^)
    echo.
    echo Alternatively, open index.html directly in your browser.
    echo Data will be saved in the browser instead of a file.
    echo.
    pause
)
