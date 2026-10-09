@echo off
title Provexpress - Aplicacion Web de Inventario y Metricas
color 0A
cls
cd /d "%~dp0"
echo ======================================================================
echo           PROVEXPRESS - APLICACION WEB DE INVENTARIO Y METRICAS
echo ======================================================================
echo.
echo  1. Sincronizando inventario con el ultimo correo recibido en Outlook...
python "actualizar_desde_outlook.py"
echo.
echo  2. Iniciando Servidor Puente de Sincronizacion WebApp...
start /min cmd /c "cd /d "%~dp0" && python server.py"

echo.
echo  3. Abriendo Aplicacion Web en tu navegador...
timeout /t 2 /nobreak >nul
start "" "%~dp0index.html"

echo.
echo ======================================================================
echo           APLICACION WEB INICIADA CORRECTAMENTE
echo ======================================================================
echo.
pause
