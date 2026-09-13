@echo off
rem IOC Lai Thieu - khoi dong toan bo he thong.
rem Nhap dup file nay, hoac chay trong cua so lenh. Toan bo logic nam o scripts\start-ioc.ps1.
rem Tham so: -CheckOnly  -NoAI  -SkipBuild  -Yes  -NoBrowser  (xem: scripts\start-ioc.ps1)
setlocal

rem PowerShell doi bang ma cua so sang UTF-8 de hien tieng Viet; ghi lai de tra ve sau.
for /f "tokens=2 delims=:" %%c in ('chcp') do set "IOC_CODEPAGE=%%c"
set "IOC_CODEPAGE=%IOC_CODEPAGE: =%"
set "IOC_CODEPAGE=%IOC_CODEPAGE:.=%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-ioc.ps1" %*
set "IOC_EXIT=%ERRORLEVEL%"

if defined IOC_CODEPAGE chcp %IOC_CODEPAGE% >nul 2>&1
endlocal & exit /b %IOC_EXIT%
