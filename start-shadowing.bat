@echo off
setlocal enabledelayedexpansion

:: ==========================================
:: CONFIGURATION (Edit your API Key here)
:: ==========================================
set "API_KEY="
set "PORT=5173"
set "WIDTH=1920"
set "HEIGHT=1080"
:: ==========================================

set "URL=http://localhost:!PORT!"
set "TITLE=Shadowing Web - Premium English Learning"

:: Handle Arguments
:: %1: JSON File Path
:: %2: Width (Optional)
:: %3: Height (Optional)

if "%~1"=="" (
    echo Usage: start-shadowing.bat [lesson.json] [width] [height]
    echo Running with default settings...
    set "FILE_ARG="
) else (
    set "FILE_PATH=%~f1"
    if not exist "!FILE_PATH!" (
        echo Error: File not found: !FILE_PATH!
        pause
        exit /b
    )
    copy /y "!FILE_PATH!" "public\autoload.json" >nul
    set "FILE_ARG=?sessionUrl=/autoload.json&autoStart=true"
    
    :: Add API Key to URL if provided
    if not "!API_KEY!"=="" (
        set "FILE_ARG=!FILE_ARG!&apiKey=!API_KEY!"
    )
    
    echo Loaded session: %~nx1
)

if not "%~2"=="" set "WIDTH=%~2"
if not "%~3"=="" set "HEIGHT=%~3"

echo Starting Shadowing Web...
echo Resolution: !WIDTH!x!HEIGHT!
echo Mode: Zero-Dialog + Automation

:: Find Chrome/Edge
set "CHROME_PATH=%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"
if not exist "!CHROME_PATH!" set "CHROME_PATH=%PROGRAMFILES(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "!CHROME_PATH!" set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

set "FLAGS=--new-window --test-type --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --auto-select-desktop-capture-source="!TITLE!" --window-size=!WIDTH!,!HEIGHT! "!URL!!FILE_ARG!""

if exist "!CHROME_PATH!" (
    start "" "!CHROME_PATH!" !FLAGS!
    exit /b
)

set "EDGE_PATH=%PROGRAMFILES(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "!EDGE_PATH!" (
    start "" "!EDGE_PATH!" !FLAGS!
    exit /b
)

echo Browser not found.
pause
