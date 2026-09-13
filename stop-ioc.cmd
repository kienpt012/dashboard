@echo off
rem IOC Lai Thieu - dung he thong, giai phong RAM va GPU. Du lieu duoc giu nguyen.
rem Toan bo logic nam o scripts\stop-ioc.ps1.
setlocal

for /f "tokens=2 delims=:" %%c in ('chcp') do set "IOC_CODEPAGE=%%c"
set "IOC_CODEPAGE=%IOC_CODEPAGE: =%"
set "IOC_CODEPAGE=%IOC_CODEPAGE:.=%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-ioc.ps1" %*
set "IOC_EXIT=%ERRORLEVEL%"

if defined IOC_CODEPAGE chcp %IOC_CODEPAGE% >nul 2>&1
endlocal & exit /b %IOC_EXIT%
