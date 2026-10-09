"""
═══════════════════════════════════════════════════════════════════════════
PROVEXPRESS - SINCRONIZADOR UNIVERSAL DE INVENTARIO DESDE OUTLOOK
Descarga el último correo de inventario enviado por Alejandro Varon,
extrae imágenes, actualiza el Excel de OneDrive y el JSON de la WebApp.
═══════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import re
import json
import shutil
from datetime import datetime
from bs4 import BeautifulSoup
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')

# --- RUTAS PRINCIPALES ---
EXCEL_PATH = r"C:\Users\especialista.prevent\OneDrive - PROVEXPRESS SAS\Excels Invetario\plantilla_inventario_matriz.xlsx"

PROJECT_PATHS = [
    r"c:\Proyectos\inventario-provexpress",
    r"C:\Users\especialista.prevent\OneDrive - PROVEXPRESS SAS\Documents\Proyectos\inventario-provexpress"
]

def parse_colombian_price(cost_text):
    part0 = cost_text.split('/')[0]
    clean = re.sub(r'[^\d,\.]', '', part0).strip('.,')
    if not clean: return 0.0
    if ',' in clean:
        parts_comma = clean.split(',')
        if len(parts_comma) == 2 and len(parts_comma[1]) <= 2:
            int_part = parts_comma[0].replace('.', '')
            return float(f"{int_part}.{parts_comma[1]}")
        else:
            clean = clean.replace(',', '')
    if '.' in clean:
        parts_dot = clean.split('.')
        if len(parts_dot[-1]) <= 2 and len(parts_dot) > 1:
            int_part = ''.join(parts_dot[:-1])
            dec_part = parts_dot[-1]
            return float(f"{int_part}.{dec_part}")
        else:
            return float(''.join(parts_dot))
    try:
        return float(clean)
    except:
        return 0.0

def parse_email_tables(html_content, cid_to_file=None):
    if cid_to_file is None:
        cid_to_file = {}
        
    soup = BeautifulSoup(html_content, 'html.parser')
    wrapper = soup.body.find('div')
    if not wrapper:
        wrapper = soup.body
    
    tables = wrapper.find_all('table')
    products = []
    
    def get_preceding_section(table):
        prev = table.find_previous(
            lambda tag: tag.name in ['p', 'div', 'h1', 'h2', 'h3', 'b', 'strong'] and
            any(s in tag.get_text().upper() for s in ['RENTA', 'HP', 'LENOVO', 'DELL', 'APPLE', 'MONITOR', 'IMPRESORA', 'CELULAR', 'ACCESORIO', 'PERIFERICO', 'VENTA', 'TENER EN CUENTA']) and
            len(tag.get_text().strip()) < 50
        )
        return prev.get_text().strip() if prev else 'VENTA'

    for t in tables:
        raw_text = t.get_text(separator=' | ', strip=True)
        rows = t.find_all('tr')
        
        np_val = ''
        prod_desc = ''
        cost_text = ''
        ingreso_text = ''
        img_filename = ''
        
        img_tag = t.find('img')
        if img_tag and img_tag.get('src'):
            src = img_tag['src']
            m_cid = re.search(r'cid:([^@"\'>\s]+)', src, re.I)
            if m_cid:
                img_filename = m_cid.group(1).lower()

        for r in rows:
            tds = r.find_all(['td', 'th'])
            for i, td in enumerate(tds):
                txt = td.get_text(strip=True).upper()
                if ('N/P' in txt or 'N/PARTE' in txt or 'PARTE' in txt) and i + 1 < len(tds):
                    np_val = tds[i+1].get_text(strip=True)
                elif ('PRODUCTO' in txt or 'NOMBRE' in txt or 'DESCRIPCION' in txt) and i + 1 < len(tds):
                    prod_desc = tds[i+1].get_text(strip=True)
                elif 'COSTO' in txt and i + 1 < len(tds):
                    cost_text = tds[i+1].get_text(strip=True)
                elif 'INGRESO' in txt:
                    ingreso_text = txt.replace('INGRESO', '').strip()
                elif i + 1 < len(tds) and 'INGRESO' in tds[i+1].get_text().upper():
                    ingreso_text = tds[i+1].get_text().replace('INGRESO', '').replace('ingreso', '').strip()

        if not ingreso_text:
            m_ing = re.search(r'INGRESO\s*(\d{2}/\d{2}/\d{2,4})', raw_text, re.I)
            if m_ing:
                ingreso_text = m_ing.group(1)

        if not (np_val and prod_desc):
            continue

        iva = "Sí" if "+ IVA" in cost_text.upper() or "+IVA" in cost_text.upper() or "+ iva" in cost_text.lower() else "No"
        qty_match = re.search(r'/\s*(\d+)\s*UNIDAD', cost_text, re.I)
        qty = int(qty_match.group(1)) if qty_match else 0
        cost_val = parse_colombian_price(cost_text)

        sec_heading = get_preceding_section(t).upper()

        # Marca
        brand = "OTRAS"
        for b in ["HP", "LENOVO", "DELL", "APPLE", "SAMSUNG", "LOGITECH", "KYOCERA", "MOTOROLA", "ADATA", "GENIUS", "JALTECH", "XKIM", "TARGUS", "CISCO", "ARUBA", "RICOH", "POLY"]:
            if b in prod_desc.upper() or b in np_val.upper() or b in sec_heading:
                brand = b
                break
                
        # Categoría
        cat = "ACCESORIOS Y PERIFÉRICOS"
        pd = prod_desc.upper()
        if "PORTATIL" in pd or "PROBOOK" in pd or "THINKPAD" in pd or "MACBOOK" in pd:
            cat = "PORTÁTILES"
        elif "MONITOR" in pd or "S3 ESSENTIAL" in pd:
            cat = "MONITORES"
        elif "IMPRESORA" in pd or "MULTIFUNCIONAL" in pd or "MFP" in pd:
            cat = "IMPRESORAS"
        elif "DIADEMA" in pd or "AURICULAR" in pd or "HEADSET" in pd:
            cat = "DIADEMAS / AUDIO"
        elif "MOUSE" in pd or "TECLADO" in pd or "COMBO" in pd:
            cat = "PERIFÉRICOS / MOUSE & TECLADO"
        elif "CELULAR" in pd or "IPAD" in pd or "TABLET" in pd or "MOTO G" in pd:
            cat = "CELULARES / MÓVILES"
        elif "DISCO" in pd or "SSD" in pd or "ALMACENAMIENTO" in pd:
            cat = "ALMACENAMIENTO / SSD"
        elif "BASE" in pd or "REFRIGERANTE" in pd:
            cat = "ACCESORIOS / BASES REFRIGERANTES"
        elif "MORRAL" in pd:
            cat = "ACCESORIOS / MORRALES"
        elif "CABLE" in pd:
            cat = "CABLES / CONECTIVIDAD"
        elif "TARJETA" in pd:
            cat = "TARJETAS DE CONTROL"
        elif "PC" in pd or "DESKTOP" in pd or "WS" in pd or "THINKSTATION" in pd:
            cat = "DESKTOPS / PCS"
            
        if "RENTA" in sec_heading:
            cat = "EQUIPOS PARA RENTA"

        # Sección Oficial del correo / catálogo
        sec = "VENTA"
        if "RENTA" in sec_heading or cat == "EQUIPOS PARA RENTA":
            sec = "EQUIPOS PARA RENTA"
        elif brand == "HP":
            sec = "HP"
        elif brand == "LENOVO":
            sec = "LENOVO"
        elif brand == "DELL":
            sec = "DELL"
        elif cat == "MONITORES":
            sec = "MONITORES"
        elif cat == "IMPRESORAS":
            sec = "IMPRESORAS"
        elif cat == "CELULARES / MÓVILES":
            sec = "CELULARES"
        else:
            sec = "ACCESORIOS Y PERIFÉRICOS"

        local_img = cid_to_file.get(img_filename, "")
        if not local_img:
            if cat == "PORTÁTILES": local_img = "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=300"
            elif cat == "MONITORES": local_img = "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300"
            elif cat == "IMPRESORAS": local_img = "https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=300"
            elif cat == "DIADEMAS / AUDIO": local_img = "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300"
            else: local_img = "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300"

        products.append({
            "seccion": sec,
            "categoria": cat,
            "marca": brand,
            "np": np_val,
            "producto": prod_desc,
            "costo": cost_val,
            "iva": iva,
            "fecha_ingreso": ingreso_text,
            "cantidad_actual": qty,
            "imagen": local_img
        })

    return products

def main():
    print("======================================================================")
    print("   PROVEXPRESS - SINCRONIZACIÓN AUTOMÁTICA DE INVENTARIO DESDE OUTLOOK")
    print("======================================================================\n")

    import win32com.client as win32
    outlook = win32.Dispatch('Outlook.Application').GetNamespace('MAPI')
    root = outlook.Folders.Item('especialista.preventa@provexpress.com.co')
    
    # Carpeta INVENTARIOS
    try:
        inv_folder = root.Folders.Item('INVENTARIOS')
    except Exception:
        inv_folder = root.Folders.Item('Bandeja de entrada')

    print("1. Buscando correos de inventario del mes actual (OCTUBRE 2026)...")
    oct_emails = {}
    oct_days = [1, 2, 5, 6, 7, 8, 9]

    for d in oct_days:
        filter_str = f'@SQL="urn:schemas:httpmail:subject" LIKE \'%{d:02d} OCTUBRE%\''
        matches = inv_folder.Items.Restrict(filter_str)
        if matches.Count > 0:
            # Si hay varios del mismo día, ordenar por fecha descendente
            matches.Sort("[ReceivedTime]", True)
            oct_emails[d] = matches.Item(1)
        else:
            filter_str2 = f'@SQL="urn:schemas:httpmail:subject" LIKE \'%{d} OCTUBRE%\''
            matches2 = inv_folder.Items.Restrict(filter_str2)
            if matches2.Count > 0:
                matches2.Sort("[ReceivedTime]", True)
                oct_emails[d] = matches2.Item(1)

    if not oct_emails:
        print("⚠ No se encontraron correos de Octubre en Outlook.")
        return

    latest_day = max(oct_emails.keys())
    today_msg = oct_emails[latest_day]
    print(f"✓ Último correo detectado: '{today_msg.Subject}' (Día {latest_day} de Octubre, {today_msg.ReceivedTime})")

    # 2. Extraer imágenes del correo de HOY a img/products/
    print("\n2. Extrayendo imágenes y fotografías oficiales adjuntas...")
    cid_to_file = {}
    img_dirs = [os.path.join(p, "img", "products") for p in PROJECT_PATHS]
    for d in img_dirs:
        os.makedirs(d, exist_ok=True)

    for i in range(1, today_msg.Attachments.Count + 1):
        att = today_msg.Attachments.Item(i)
        fn = str(att.FileName)
        if any(fn.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']):
            for d in img_dirs:
                save_path = os.path.join(d, fn)
                try:
                    att.SaveAsFile(save_path)
                except Exception:
                    pass
            cid_to_file[fn.lower()] = f"img/products/{fn}"
    print(f"✓ {len(cid_to_file)} imágenes guardadas en img/products/")

    # 3. Parsear productos de hoy y de días previos de Octubre
    print("\n3. Parseando catálogo de productos y stock diario...")
    today_products = parse_email_tables(today_msg.HTMLBody, cid_to_file)
    print(f"✓ {len(today_products)} productos vigentes extraídos del correo de hoy.")

    # Ordenar por sección oficial
    section_order = ['EQUIPOS PARA RENTA', 'DELL', 'HP', 'LENOVO', 'MONITORES', 'IMPRESORAS', 'CELULARES', 'ACCESORIOS Y PERIFÉRICOS']
    today_products.sort(key=lambda p: (section_order.index(p['seccion']) if p['seccion'] in section_order else 99, p['np']))

    # Recopilar histórico de días de Octubre
    daily_stock_by_np = {}
    for day_num, msg in sorted(oct_emails.items()):
        p_day = parse_email_tables(msg.HTMLBody, cid_to_file)
        for p in p_day:
            np_k = p['np']
            if np_k not in daily_stock_by_np:
                daily_stock_by_np[np_k] = {}
            daily_stock_by_np[np_k][f"day_{day_num}"] = p['cantidad_actual']

    for p in today_products:
        p['dias_stock'] = daily_stock_by_np.get(p['np'], {f"day_{latest_day}": p['cantidad_actual']})

    # 4. Actualizar Excel de OneDrive (plantilla_inventario_matriz.xlsx)
    print(f"\n4. Actualizando Excel en OneDrive ({EXCEL_PATH})...")
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=False)
    
    ws_matriz = wb["Matriz Inventario"]
    ws_gen = wb["Generador Correo Inventario"]

    # 4.1 Actualizar Hoja 3: Generador Correo Inventario
    ws_gen["C3"] = datetime(2026, 10, latest_day)
    ws_gen["E3"] = f"INVENTARIO {latest_day:02d} OCTUBRE 2026 TECNOLOGIA"
    ws_gen["G3"] = "ACTUALIZADO AL DÍA"

    # Limpiar celdas previas de datos de Hoja 3 (filas 8 a 145) omitiendo celdas combinadas
    for r in range(8, 146):
        for c in range(1, 12):
            cell = ws_gen.cell(r, c)
            if type(cell).__name__ != 'MergedCell':
                cell.value = None

    for idx, p in enumerate(today_products, start=1):
        target_row = 7 + idx
        ws_gen.cell(target_row, 1).value = idx
        ws_gen.cell(target_row, 2).value = p['seccion']
        ws_gen.cell(target_row, 3).value = p['categoria']
        ws_gen.cell(target_row, 4).value = p['marca']
        ws_gen.cell(target_row, 5).value = p['np']
        ws_gen.cell(target_row, 6).value = p['producto']
        ws_gen.cell(target_row, 7).value = p['costo']
        ws_gen.cell(target_row, 8).value = p['iva']
        ws_gen.cell(target_row, 9).value = p['fecha_ingreso']
        ws_gen.cell(target_row, 10).value = p['cantidad_actual']
        ws_gen.cell(target_row, 11).value = f"=G{target_row}*J{target_row}"

    print(f"✓ Hoja 3 'Generador Correo Inventario' actualizada con {len(today_products)} productos.")

    # 4.2 Actualizar Hoja 1: Matriz Inventario con bloque OCTUBRE 2026
    month_label = f"OCTUBRE 2026"
    
    # Crear mapa de filas existentes de OCTUBRE 2026
    row_map_oct = {}
    for r in range(2, ws_matriz.max_row + 1):
        m_val = ws_matriz.cell(r, 1).value
        np_v = ws_matriz.cell(r, 4).value
        if m_val == month_label and np_v:
            row_map_oct[str(np_v).strip()] = r

    for p in today_products:
        np_k = p['np']
        if np_k in row_map_oct:
            t_row = row_map_oct[np_k]
        else:
            t_row = ws_matriz.max_row + 1
            row_map_oct[np_k] = t_row
            ws_matriz.cell(t_row, 1).value = month_label
            ws_matriz.cell(t_row, 2).value = p['categoria']
            ws_matriz.cell(t_row, 3).value = p['marca']
            ws_matriz.cell(t_row, 4).value = np_k
            ws_matriz.cell(t_row, 5).value = p['producto']
            ws_matriz.cell(t_row, 6).value = p['costo']
            ws_matriz.cell(t_row, 7).value = p['iva']
            ws_matriz.cell(t_row, 8).value = p['fecha_ingreso']
            ws_matriz.cell(t_row, 9).value = 3950.0

        # Actualizar stock actual y días de Octubre
        ws_matriz.cell(t_row, 10).value = p['cantidad_actual']
        for d_key, d_qty in p['dias_stock'].items():
            d_num = int(d_key.split('_')[1])
            day_col_idx = 10 + d_num # Col 11 = Día 1, Col 19 = Día 9
            ws_matriz.cell(t_row, day_col_idx).value = d_qty

    wb.save(EXCEL_PATH)
    print(f"✓ Matriz Inventario guardada exitosamente en Excel.")

    # 5. Actualizar inventory_data.json en ambos proyectos
    print("\n5. Actualizando base de datos inventory_data.json...")
    json_path_src = os.path.join(PROJECT_PATHS[0], "inventory_data.json")
    with open(json_path_src, 'r', encoding='utf-8') as f:
        existing_data = json.load(f)

    # Mantener histórico previo excluyendo OCTUBRE 2026
    hist_prods = [p for p in existing_data.get('products', []) if p.get('mes') != 'OCTUBRE 2026']

    new_oct_prods = []
    base_id = len(hist_prods) + 1
    for idx, p in enumerate(today_products, start=base_id):
        item = dict(p)
        item['id'] = idx
        item['mes'] = 'OCTUBRE 2026'
        item['trm_ingreso'] = 3950.0
        new_oct_prods.append(item)

    all_products = hist_prods + new_oct_prods

    data_payload = {
        "last_updated": datetime.now().isoformat(),
        "excel_path": EXCEL_PATH,
        "total_products": len(all_products),
        "products": all_products
    }

    for proj in PROJECT_PATHS:
        j_path = os.path.join(proj, "inventory_data.json")
        try:
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(data_payload, f, ensure_ascii=False, indent=2)
            print(f"✓ Archivo actualizado: {j_path}")
        except Exception as e:
            print(f"⚠ Error guardando en {j_path}: {e}")

    # Resumen
    total_unidades = sum(p['cantidad_actual'] for p in today_products)
    total_valor_cop = sum(p['costo'] * p['cantidad_actual'] for p in today_products)
    
    print("\n======================================================================")
    print("               RESUMEN DE ACTUALIZACIÓN - HOY")
    print("======================================================================")
    print(f" Fecha: {latest_day:02d} DE OCTUBRE DE 2026")
    print(f" Referencias activas: {len(today_products)} productos")
    print(f" Total unidades en stock: {total_unidades:,}")
    print(f" Valor inventario: ${total_valor_cop:,.2f} COP")
    print("======================================================================")
    print("¡TODO EL PROYECTO QUEDÓ ACTUALIZADO A LA FECHA Y MELO!")

if __name__ == '__main__':
    main()
