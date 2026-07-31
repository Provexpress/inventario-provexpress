@echo off
title Provexpress - Aplicacion Web de Inventario y Metricas
color 0A
cls
echo ======================================================================
echo           PROVEXPRESS - APLICACION WEB DE INVENTARIO Y METRICAS
echo ======================================================================
echo.
echo  1. Iniciando Servidor Puente de Sincronizacion Excel (OneDrive)...
start /min cmd /c "cd /d "C:\Users\especialista.prevent\OneDrive - PROVEXPRESS SAS\Documents\Proyectos\inventario-provexpress" && python server.py"

echo.
echo  2. Abriendo Aplicacion Web en tu navegador...
timeout /t 2 /nobreak >nul
start "" "C:\Users\especialista.prevent\OneDrive - PROVEXPRESS SAS\Documents\Proyectos\inventario-provexpress\index.html"

echo.
echo ======================================================================
echo           APLICACION WEB INICIADA CORRECTAMENTE
echo ======================================================================
echo.
pause
