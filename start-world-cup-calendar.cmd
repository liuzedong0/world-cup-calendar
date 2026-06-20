@echo off
cd /d "%~dp0"
start "World Cup Calendar" /min node server.js
echo World Cup Calendar started: http://localhost:5177/
pause
