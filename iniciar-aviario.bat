@echo off
setlocal
cd /d "%~dp0"

title Aviário Inteligente Pro - Porta 5641

cls
echo ==================================================
echo   AVIÁRIO INTELIGENTE PRO
echo   NOVO PROJETO - PORTA 5641
echo ==================================================
echo.
echo Pasta atual:
echo %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado no PATH.
  echo Instale/reabra o terminal depois de instalar o Node.js.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao foi encontrado no PATH.
  echo.
  pause
  exit /b 1
)

echo Node:
node --version
echo npm:
npm --version
echo.
echo A iniciar SOMENTE o projeto novo na porta 5641...
echo Nao sera usada a porta 5631.
echo.

call npm run dev
set ERR=%ERRORLEVEL%

echo.
if not "%ERR%"=="0" (
  echo ==================================================
  echo   O SERVIDOR NAO CONSEGUIU INICIAR
  echo   Codigo de erro: %ERR%
  echo ==================================================
  echo.
  echo A janela ficara aberta para podermos ver o erro.
  pause
  exit /b %ERR%
)

echo O servidor foi encerrado.
pause
