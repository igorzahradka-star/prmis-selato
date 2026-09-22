@echo off
rem Spusti lokalni nahled PRM Revoltum a otevre ho v prohlizeci.
rem Okno nechte otevrene - dokud bezi, bezi i nahled. Zavrenim se nahled ukonci.
title PRM Revoltum - nahled (toto okno nezavirejte)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo CHYBA: nenasel jsem Node.js. Otevrete novy prikazovy radek, nebo
  echo        Node.js doinstalujte podle CLAUDE.md, kapitola 3.
  echo.
  pause
  exit /b 1
)

rem Bezi uz nahled na portu 4322? Pak jen otevreme prohlizec.
netstat -ano | findstr /r /c:"TCP.*:4322 .*LISTENING" >nul
if not errorlevel 1 (
  echo Nahled uz bezi - otevirám prohlizec.
  start "" "http://localhost:4322"
  timeout /t 3 >nul
  exit /b 0
)

echo Sestavuji nahled...
call node build.js
if errorlevel 1 (
  echo.
  echo Sestaveni selhalo. Zkuste v okne Claude Code rict "sestav znovu nahled".
  echo.
  pause
  exit /b 1
)

echo.
echo Spoustim server na http://localhost:4322
start "" "http://localhost:4322"
node serve.js
pause
