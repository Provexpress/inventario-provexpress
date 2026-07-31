# Provexpress Inventario Suite - Aplicación Web & Dashboard de Control

Sistema Web Corporativo para la Gestión de Inventarios Tecnológicos, Análisis de Métricas en Tiempo Real, Automatización de Correos HTML y Sincronización con Excel OneDrive.

## 🚀 Despliegue en GitHub Pages

Este proyecto está 100% optimizado y listo para ser desplegado en **GitHub Pages**:

1. Subir el contenido de esta carpeta a tu repositorio de GitHub:
   ```bash
   git init
   git add .
   git commit -m "Deploy Provexpress Inventario Web Suite"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/inventario-provexpress.git
   git push -u origin main
   ```
2. En GitHub, ve a **Settings > Pages**.
3. En **Source**, selecciona la rama `main` y la carpeta `/ (root)`.
4. ¡Listo! Tu aplicación quedará accesible en:
   `https://tu-usuario.github.io/inventario-provexpress/`

---

## 🛠️ Ejecución Local con 1 Clic

En tu computadora local:
- Ve al Escritorio de OneDrive y dale doble clic a **`Abrir_App_Inventario.bat`**.
- La aplicación abrirá automáticamente el Dashboard y activará el Puente de Sincronización en vivo con tu archivo Excel de OneDrive (`plantilla_inventario_matriz.xlsx`).

---

## 🎨 Características Destacadas
- **Login Corporativo M365**: Tomado del sistema de autenticación de `Provex-One`.
- **Dashboard Ejecutivo**: KPI Cards (Stock Total, Valor del Inventario en $ COP, Categorías Activas, TRM Promedio) y gráficos interactivos con Chart.js.
- **Gestor & Validador de Cambios**: Edición de stock en vivo con indicadores de variación (📈 subió / 📉 bajó).
- **Emisor de Correo 1-Clic**: Formatea las tablas corporativas en HTML y las envía automáticamente vía Outlook a `especialista.preventa@provexpress.com.co`.
- **Base de Datos Excel OneDrive**: Mantiene alimentado el archivo `plantilla_inventario_matriz.xlsx`.
