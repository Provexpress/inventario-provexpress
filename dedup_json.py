import json, sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'inventory_data.json'

with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data['products']

# Deduplicate keeping the entry with the HIGHEST cantidad_actual per (mes, np)
seen = {}
for p in products:
    key = (p['mes'], p['np'])
    if key not in seen:
        seen[key] = p
    else:
        # Keep whichever has more quantity (most recent stock snapshot)
        if p.get('cantidad_actual', 0) > seen[key].get('cantidad_actual', 0):
            # But merge dias_stock from all entries
            for dk, dv in (p.get('dias_stock') or {}).items():
                seen[key].setdefault('dias_stock', {})[dk] = dv
        else:
            # Still merge dias_stock into the winner
            for dk, dv in (p.get('dias_stock') or {}).items():
                seen[key].setdefault('dias_stock', {})[dk] = dv

deduped = list(seen.values())

# Re-assign sequential IDs
for i, p in enumerate(deduped, start=1):
    p['id'] = i

data['products']      = deduped
data['total_products'] = len(deduped)

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'Antes: {len(products)} filas')
print(f'Despues: {len(deduped)} filas (unicas por mes+NP)')
print(f'Reduccion: {len(products) - len(deduped)} filas duplicadas eliminadas')

# Verify
from collections import Counter
months = sorted(set(p['mes'] for p in deduped))
for m in months:
    mm = [p for p in deduped if p['mes'] == m]
    nps = [p['np'] for p in mm]
    dups = {k:v for k,v in Counter(nps).items() if v > 1}
    print(f'  {m}: {len(mm)} productos, {len(set(nps))} unicos, duplicados: {len(dups)}')
