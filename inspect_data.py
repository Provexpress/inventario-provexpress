import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('inventory_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data['products']
print(f'Total productos: {len(products)}')

months = sorted(set(p['mes'] for p in products))
print(f'Meses: {months}')

last_month = months[-1]
last = [p for p in products if p['mes'] == last_month]
print(f'Ultimo mes ({last_month}): {len(last)} productos')

cats = {}
for p in last:
    c = p['categoria']
    cats[c] = cats.get(c, 0) + 1
print('Categorias:', cats)

secs = {}
for p in last:
    s = p['seccion']
    secs[s] = secs.get(s, 0) + 1
print('Secciones:', secs)

brands = {}
for p in last:
    b = p['marca']
    brands[b] = brands.get(b, 0) + p.get('cantidad_actual', 0)
print('Marcas (unidades):', brands)

total_units = sum(p.get('cantidad_actual', 0) for p in last)
total_value = sum(p.get('costo', 0) * p.get('cantidad_actual', 0) for p in last)
low_stock   = [p for p in last if p.get('cantidad_actual', 0) < 5]
avg_trm     = sum(p.get('trm_ingreso', 4000) for p in last) / len(last)

print(f'Total unidades: {total_units}')
print(f'Valor total COP: {total_value:,.0f}')
print(f'TRM promedio: {avg_trm:.0f}')
print(f'Stock bajo (<5): {len(low_stock)} productos')

sample = last[0]
print('dias_stock keys (sample):', list(sample.get('dias_stock', {}).keys()))
print('Sample product:', sample['np'], sample['categoria'], sample['marca'], sample.get('cantidad_actual'))
