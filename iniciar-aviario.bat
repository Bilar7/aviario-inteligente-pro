@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Aviario Inteligente Pro

cls
echo ==================================================
echo       AVIARIO INTELIGENTE PRO
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto NO_NODE

where npm >nul 2>&1
if errorlevel 1 goto NO_NPM

if not exist "node_modules" (
    echo A preparar a aplicacao pela primeira vez...
    echo Isto pode demorar alguns minutos.
    call npm install --no-audit --no-fund
    if errorlevel 1 goto INSTALL_ERROR
)

echo.
echo A iniciar a aplicacao...
echo.

start "Aviario Inteligente Pro" cmd /c "npm run dev -- --host 127.0.0.1"

for /L %%I in (1,1,60) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5641/' -TimeoutSec 1; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ exit 0 } } catch {} exit 1" >nul 2>&1
    if not errorlevel 1 goto OPEN_APP
    timeout /t 1 /nobreak >nul
)

echo.
echo O servidor nao respondeu a tempo.
echo Verifique a janela "Aviario Inteligente Pro" que foi aberta.
echo.
pause
exit /b 1

:OPEN_APP
start "" "http://127.0.0.1:5641/"
echo.
echo Aplicacao aberta no navegador.
echo Pode deixar esta janela aberta enquanto usa o sistema.
echo.
pause
exit /b 0

:NO_NODE
echo O Node.js nao esta instalado neste computador.
echo Instale o Node.js LTS e execute este ficheiro novamente.
echo.
pause
exit /b 1

:NO_NPM
echo O npm nao esta disponivel neste computador.
echo Reinstale o Node.js LTS e execute este ficheiro novamente.
echo.
pause
exit /b 1

:INSTALL_ERROR
echo.
echo Nao foi possivel instalar as dependencias.
echo Verifique a ligacao a Internet e tente novamente.
echo.
pause
exit /b 1
