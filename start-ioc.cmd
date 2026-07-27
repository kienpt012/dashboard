@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-ioc.ps1" %*
if errorlevel 1 (
  echo.
  echo Khoi dong that bai. Xem thong bao loi phia tren.
  pause
)
endlocal
