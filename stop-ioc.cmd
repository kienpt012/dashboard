@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-ioc.ps1" %*
if not errorlevel 1 goto success

echo.
echo Dung he thong that bai. Xem thong bao loi phia tren.
pause
endlocal
exit /b 1

:success
echo.
echo Da dung toan bo IOC va giu nguyen du lieu. Cua so se tu dong dong.
ping 127.0.0.1 -n 3 >nul
endlocal
exit /b 0
