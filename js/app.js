/* ══════════════════════════════════════════════════════════════
   PROVEXPRESS INVENTARIO SUITE — APP LOGIC v3
   Data-validated · Full Dashboard · Gestor with CRUD · Email
══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let ALL   = [];      // all products (current month)
let SHOWN = [];      // filtered subset rendered in table
let SNAP  = {};      // original quantities on load
let EDIT_NP = null;  // NP being edited (null = new)
let chartTrend = null, chartCat = null, chartBrand = null;

// Real category colors (14 categories from data)
const CAT_COLORS = {
  'PORTÁTILES':                      '#1565C0',
  'PERIFÉRICOS / MOUSE & TECLADO':   '#10B981',
  'IMPRESORAS':                      '#F59E0B',
  'DIADEMAS / AUDIO':                '#7C3AED',
  'MONITORES':                       '#0EA5E9',
  'DESKTOPS / PCS':                  '#E11D48',
  'CELULARES / MÓVILES':             '#059669',
  'ALMACENAMIENTO / SSD':            '#D97706',
  'EQUIPOS PARA RENTA':              '#64748B',
  'ACCESORIOS / BASES REFRIGERANTES':'#8B5CF6',
  'ACCESORIOS / MORRALES':           '#06B6D4',
  'TARJETAS DE CONTROL':             '#F43F5E',
  'CABLES / CONECTIVIDAD':           '#84CC16',
  'OTROS ACCESORIOS':                '#A78BFA',
};

const TODAY_ISO = new Date().toISOString().slice(0, 10);

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupFilters();
  loadData();
});

// ── Data ─────────────────────────────────────────────────────
async function loadData() {
  try {
    const res  = await fetch('inventory_data.json?' + Date.now());
    const data = await res.json();
    const prods = data.products || [];

    // Identify most recent month
    const months = [...new Set(prods.map(p => p.mes))].sort();
    const curMonth = months[months.length - 1];

    ALL = prods.filter(p => p.mes === curMonth);
    // Initialise editable quantity
    ALL.forEach(p => {
      p._qty = p.cantidad_actual ?? 0;
      SNAP[p.np] = p._qty;
    });

    setSyncLabel(`✓ ${ALL.length} refs · ${curMonth}`);
    renderDashboard();
    applyFilters();
    renderEmailPreview();
    setEmailSubject();
  } catch (err) {
    setSyncLabel('⚠ Error al cargar datos');
    console.error('[loadData]', err);
  }
}

// ── Helpers ───────────────────────────────────────────────────
const fmtCOP  = n => '$ ' + Math.round(n).toLocaleString('es-CO');
const fmtDate = s => { if(!s) return '—'; const d=new Date(s); return isNaN(d)?s.slice(0,10):d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}); };
const fmtK    = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n.toLocaleString('es-CO');

function setSyncLabel(t) { const el=document.getElementById('syncLabel'); if(el) el.textContent=t; }
function showToast(msg, dur=3200) {
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), dur);
}

function secClass(sec='') {
  const s=sec.toUpperCase();
  if(s.includes('RENTA'))  return 'renta';
  if(s==='HP')             return 'hp';
  if(s==='LENOVO')         return 'lenovo';
  if(s==='DELL')           return 'dell';
  if(s.includes('MONITOR'))return 'monitor';
  return 'otros';
}

// ── Tabs ──────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(p => p.hidden = true);
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).hidden = false;
      if (btn.dataset.tab === 'dashboard') renderDashboard();
      if (btn.dataset.tab === 'email')     renderEmailPreview();
    });
  });
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  if (!ALL.length) return;

  const totalUnits = ALL.reduce((s,p) => s+p._qty, 0);
  const totalVal   = ALL.reduce((s,p) => s+p.costo*p._qty, 0);
  const avgTrm     = ALL.reduce((s,p) => s+(p.trm_ingreso||4000), 0) / ALL.length;
  const refs       = ALL.length;
  const cats       = new Set(ALL.map(p=>p.categoria)).size;
  const secs       = new Set(ALL.map(p=>p.seccion)).size;
  const lowStock   = ALL.filter(p=>p._qty<5).length;

  // KPIs
  setText('kpiUnits', totalUnits.toLocaleString('es-CO'));
  setText('kpiValue', fmtCOP(totalVal).replace('$ ','$ ').replace(/\B(?=(\d{3})+(?!\d))/g,'.'));
  setText('kpiValueUSD', 'USD ≈ $ ' + Math.round(totalVal/avgTrm).toLocaleString('es-CO'));
  setText('kpiRefs',  refs);
  setText('kpiCats',  cats);
  setText('kpiSecs',  secs + ' secciones');
  setText('kpiTrm',   '$ ' + Math.round(avgTrm).toLocaleString('es-CO'));
  setText('kpiLow',   lowStock);

  renderTrendChart();
  renderCatChart();
  renderBrandChart();
  renderSectionPills();
  renderCatGrid();
  renderBrandTable();
}

function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

// Trend Chart — real days_stock data
function renderTrendChart() {
  const ctx = document.getElementById('chartTrend');
  if (!ctx) return;

  // Collect all day keys and sort by day number
  const allKeys = new Set();
  ALL.forEach(p => Object.keys(p.dias_stock||{}).forEach(k=>allKeys.add(k)));
  const dayKeys = [...allKeys].sort((a,b) => parseInt(a.split('_')[1])-parseInt(b.split('_')[1]));

  const labels = dayKeys.map(k => 'Día ' + k.split('_')[1]);
  const values = dayKeys.map(k => ALL.reduce((s,p)=>s+((p.dias_stock||{})[k]||0),0));

  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Unidades en stock',
        data: values,
        borderColor: '#1565C0',
        backgroundColor: 'rgba(21,101,192,.08)',
        fill: true, tension: 0.35, pointRadius: 4,
        pointBackgroundColor: '#1565C0',
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.parsed.y.toLocaleString('es-CO') + ' unidades' } }
      },
      scales: {
        y: { beginAtZero: false, grid: { color: '#f0f4fa' }, ticks: { font:{size:11} } },
        x: { grid: { display: false }, ticks: { font:{size:11}, maxRotation:45 } }
      }
    }
  });
}

// Donut por categoría
function renderCatChart() {
  const ctx = document.getElementById('chartCat');
  if (!ctx) return;

  const map = {};
  ALL.forEach(p => { map[p.categoria]=(map[p.categoria]||0)+p._qty; });
  const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const colors = sorted.map(([cat]) => CAT_COLORS[cat] || '#94a3b8');

  if (chartCat) chartCat.destroy();
  chartCat = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: sorted.map(e=>e[0]),
      datasets: [{ data: sorted.map(e=>e[1]), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font:{size:10}, padding:10, boxWidth:12 } },
        tooltip: { callbacks: { label: c => c.label + ': ' + c.parsed.toLocaleString('es-CO') + ' uds' } }
      }
    }
  });
}

// Bar marcas
function renderBrandChart() {
  const ctx = document.getElementById('chartBrand');
  if (!ctx) return;

  const map = {};
  ALL.forEach(p => { map[p.marca]=(map[p.marca]||0)+p._qty; });
  const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);

  if (chartBrand) chartBrand.destroy();
  chartBrand = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: sorted.map(e=>e[0]),
      datasets: [{
        data: sorted.map(e=>e[1]),
        backgroundColor: '#1565C0',
        hoverBackgroundColor: '#2D4FD6',
        borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.parsed.x.toLocaleString('es-CO') + ' uds' } }
      },
      scales: {
        x: { grid:{color:'#f0f4fa'}, ticks:{font:{size:11}} },
        y: { grid:{display:false}, ticks:{font:{size:11}} }
      }
    }
  });
}

// Section pills
function renderSectionPills() {
  const host = document.getElementById('sectionPills');
  if (!host) return;
  const map = {};
  ALL.forEach(p => {
    if (!map[p.seccion]) map[p.seccion] = { units:0, value:0 };
    map[p.seccion].units += p._qty;
    map[p.seccion].value += p.costo * p._qty;
  });
  host.innerHTML = Object.entries(map).sort((a,b)=>b[1].units-a[1].units).map(([sec, d]) => `
    <div class="sec-pill">
      <span class="sec-pill-name">${sec}</span>
      <span class="sec-pill-units">${d.units.toLocaleString('es-CO')}</span>
      <span class="sec-pill-val">${fmtCOP(d.value)}</span>
    </div>
  `).join('');
}

// Cat grid (detailed)
function renderCatGrid() {
  const host = document.getElementById('catGrid');
  if (!host) return;
  const map = {};
  ALL.forEach(p => {
    if (!map[p.categoria]) map[p.categoria] = { units:0, value:0 };
    map[p.categoria].units += p._qty;
    map[p.categoria].value += p.costo * p._qty;
  });
  host.innerHTML = Object.entries(map).sort((a,b)=>b[1].units-a[1].units).map(([cat, d]) => `
    <div class="cat-card" style="--cat-color:${CAT_COLORS[cat]||'var(--blue)'}">
      <div class="cat-name">${cat}</div>
      <div class="cat-units">${d.units.toLocaleString('es-CO')}</div>
      <div class="cat-value">${fmtCOP(d.value)}</div>
    </div>
  `).join('');
}

// Brand ranking table
function renderBrandTable() {
  const tbody = document.getElementById('brandTableBody');
  if (!tbody) return;
  const map = {};
  ALL.forEach(p => { map[p.marca]=(map[p.marca]||0)+p._qty; });
  const total  = Object.values(map).reduce((s,v)=>s+v, 0);
  const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const max    = sorted[0]?.[1] || 1;

  tbody.innerHTML = sorted.map(([brand, units], i) => {
    const pct  = ((units/total)*100).toFixed(1);
    const barW = Math.round((units/max)*100);
    return `
      <tr>
        <td style="color:var(--slate);font-size:11px;">${i+1}</td>
        <td style="font-weight:700;">${brand}</td>
        <td style="font-weight:800;color:var(--navy);">${units.toLocaleString('es-CO')}</td>
        <td style="color:var(--slate);">${pct}%</td>
        <td style="width:120px;"><div class="brand-bar" style="width:${barW}%"></div></td>
      </tr>
    `;
  }).join('');
}

// ── GESTOR TABLE ──────────────────────────────────────────────
function setupFilters() {
  ['searchInput','filterSec','filterCat','filterBrand','filterStock'].forEach(id => {
    document.getElementById(id)?.addEventListener('input',  applyFilters);
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });
}

function applyFilters() {
  const q      = (document.getElementById('searchInput')?.value||'').toLowerCase();
  const sec    = document.getElementById('filterSec')?.value  || '';
  const cat    = document.getElementById('filterCat')?.value  || '';
  const brand  = document.getElementById('filterBrand')?.value|| '';
  const stock  = document.getElementById('filterStock')?.value|| '';

  SHOWN = ALL.filter(p => {
    const s = p.producto.toLowerCase()+p.np.toLowerCase()+p.marca.toLowerCase();
    const mq   = !q     || s.includes(q);
    const msec = !sec   || p.seccion   === sec;
    const mcat = !cat   || p.categoria === cat;
    const mbr  = !brand || p.marca     === brand;
    const mst  = !stock || (stock==='low'&&p._qty>0&&p._qty<5) || (stock==='zero'&&p._qty===0) || (stock==='ok'&&p._qty>=5);
    return mq && msec && mcat && mbr && mst;
  });

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  let vUnits=0, vVal=0;
  tbody.innerHTML = '';

  SHOWN.forEach((p, i) => {
    const snap = SNAP[p.np] ?? p._qty;
    const diff = p._qty - snap;
    const diffHtml = diff > 0
      ? `<span class="diff up">▲${diff}</span>`
      : diff < 0
        ? `<span class="diff down">▼${Math.abs(diff)}</span>`
        : '';

    vUnits += p._qty;
    vVal   += p.costo * p._qty;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;color:var(--slate-light);font-size:11px;">${i+1}</td>
      <td style="text-align:center;">
        <img class="prod-thumb" src="${p.imagen||'icons/provex_icon_48.png'}" alt="${p.marca}" loading="lazy"
             onerror="this.src='icons/provex_icon_48.png'">
      </td>
      <td><span class="badge-sec ${secClass(p.seccion)}">${p.seccion}</span></td>
      <td style="font-size:11px;color:var(--slate);max-width:130px;white-space:normal;line-height:1.3;">${p.categoria}</td>
      <td style="font-weight:700;">${p.marca}</td>
      <td style="font-weight:800;color:var(--navy);font-family:monospace;font-size:11.5px;">${p.np}</td>
      <td style="max-width:260px;font-size:11.5px;line-height:1.4;">${p.producto}</td>
      <td style="text-align:right;font-weight:700;white-space:nowrap;">${fmtCOP(p.costo)}</td>
      <td style="text-align:center;">${p.iva}</td>
      <td style="text-align:center;font-size:11px;white-space:nowrap;">${fmtDate(p.fecha_ingreso)}</td>
      <td style="text-align:center;">
        <input type="number" class="qty-input" data-np="${p.np}" value="${p._qty}" min="0">
        ${diffHtml}
      </td>
      <td style="text-align:right;font-weight:800;color:var(--navy);white-space:nowrap;">${fmtCOP(p.costo*p._qty)}</td>
      <td style="text-align:center;">
        <div class="row-actions">
          <button class="btn-row edit" title="Editar" onclick="openEditModal('${p.np}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-row delete" title="Eliminar" onclick="deleteProduct('${p.np}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Live qty listeners
  tbody.querySelectorAll('.qty-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const np  = e.target.dataset.np;
      const val = Math.max(0, parseInt(e.target.value)||0);
      const p   = ALL.find(x => x.np === np);
      if (p) { p._qty = val; refreshAll(); }
    });
  });

  setText('recCount',   SHOWN.length);
  setText('totalCount', ALL.length);
  setText('viewUnits',  vUnits.toLocaleString('es-CO'));
  setText('viewVal',    fmtCOP(vVal));
}

function refreshAll() {
  renderDashboard();
  renderEmailPreview();
  applyFilters();
}

// ── MODAL ─────────────────────────────────────────────────────
function openAddModal() {
  EDIT_NP = null;
  setText('modalTitle', '<i class="fa-solid fa-plus-circle"></i> Nuevo Producto');
  clearForm();
  document.getElementById('fFecha').value = TODAY_ISO;
  document.getElementById('productModal').classList.remove('hidden');
}

function openEditModal(np) {
  const p = ALL.find(x => x.np === np);
  if (!p) return;
  EDIT_NP = np;
  setText('modalTitle', '<i class="fa-solid fa-pen"></i> Editar Producto');
  setVal('fSec',   p.seccion);
  setVal('fCat',   p.categoria);
  setVal('fMarca', p.marca);
  setVal('fNP',    p.np);
  setVal('fProd',  p.producto);
  setVal('fCosto', p.costo);
  setVal('fIva',   p.iva);
  setVal('fTrm',   p.trm_ingreso||4150);
  setVal('fFecha', (p.fecha_ingreso||'').slice(0,10));
  setVal('fQty',   p._qty);
  document.getElementById('productModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('productModal').classList.add('hidden'); EDIT_NP = null; }
function handleOverlayClick(e) { if(e.target.id==='productModal') closeModal(); }
function setVal(id, v) { const el=document.getElementById(id); if(el) el.value=v??''; }
function getVal(id)    { return document.getElementById(id)?.value?.trim()||''; }

function clearForm() {
  ['fSec','fCat','fMarca','fNP','fProd','fCosto','fIva','fTrm','fFecha','fQty'].forEach(id => setVal(id,''));
  setVal('fTrm', '4150'); setVal('fQty', '0'); setVal('fIva', 'Sí');
}

function saveProduct() {
  const np    = getVal('fNP').toUpperCase();
  const marca = getVal('fMarca').toUpperCase();
  const prod  = getVal('fProd');
  const costo = parseFloat(getVal('fCosto')) || 0;
  const qty   = parseInt(getVal('fQty')) || 0;

  if (!np || !marca || !prod || !costo) { showToast('⚠ Completa todos los campos obligatorios (*)'); return; }

  const item = {
    id: EDIT_NP ? ALL.find(p=>p.np===EDIT_NP)?.id : Date.now(),
    mes: new Date().toLocaleString('es-CO',{month:'long',year:'numeric'}).toUpperCase(),
    seccion:      getVal('fSec'),
    categoria:    getVal('fCat'),
    marca, np, producto: prod, costo,
    iva:          getVal('fIva'),
    fecha_ingreso:getVal('fFecha'),
    trm_ingreso:  parseFloat(getVal('fTrm')) || 4150,
    cantidad_actual: qty,
    _qty: qty,
    dias_stock: {},
    imagen: imgByCategory(getVal('fCat'), marca),
  };

  if (EDIT_NP) {
    const idx = ALL.findIndex(p=>p.np===EDIT_NP);
    if (idx>=0) { ALL[idx]={...ALL[idx],...item}; SNAP[np]=qty; }
    showToast(`✏️ Producto ${np} actualizado`);
  } else {
    if (ALL.find(p=>p.np===np)) { showToast(`⚠ Ya existe un producto con N/P ${np}`); return; }
    ALL.unshift(item);
    SNAP[np] = qty;
    showToast(`✅ ${np} agregado al inventario`);
  }

  closeModal();
  refreshAll();
}

function deleteProduct(np) {
  if (!confirm(`¿Eliminar el producto con N/P ${np}?`)) return;
  const idx = ALL.findIndex(p=>p.np===np);
  if (idx>=0) ALL.splice(idx,1);
  delete SNAP[np];
  refreshAll();
  showToast(`🗑 Producto ${np} eliminado`);
}

function imgByCategory(cat='', brand='') {
  const c=cat.toUpperCase(), b=brand.toUpperCase();
  if(c.includes('PORTÁTIL')||c.includes('PORTATIL')) {
    if(b.includes('DELL'))  return 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=300&auto=format&fit=crop';
    if(b.includes('HP'))    return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop';
    if(b.includes('APPLE')) return 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&auto=format&fit=crop';
    return 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=300&auto=format&fit=crop';
  }
  if(c.includes('DESKTOP')||c.includes('PC')) return 'https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=300&auto=format&fit=crop';
  if(c.includes('MONITOR'))    return 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300&auto=format&fit=crop';
  if(c.includes('IMPRESORA'))  return 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=300&auto=format&fit=crop';
  if(c.includes('CELULAR'))    return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&auto=format&fit=crop';
  if(c.includes('DIADEMA'))    return 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&auto=format&fit=crop';
  if(c.includes('SSD')||c.includes('ALMACEN')) return 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=300&auto=format&fit=crop';
  return 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300&auto=format&fit=crop';
}

// ── EMAIL ─────────────────────────────────────────────────────
function setEmailSubject() {
  const el  = document.getElementById('emailSubject');
  if (!el) return;
  const d   = new Date();
  const str = d.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();
  el.textContent = `INVENTARIO ${str} TECNOLOGIA`;
}

function renderEmailPreview() {
  const box = document.getElementById('emailPreview');
  if (!box) return;

  const bySec = {};
  ALL.forEach(p => {
    const k = p.seccion||'GENERAL';
    if(!bySec[k]) bySec[k]=[];
    bySec[k].push(p);
  });

  const d   = new Date();
  const str = d.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();

  let html = `
    <div style="font-family:Arial,sans-serif;color:#1E293B;max-width:860px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1A2B6B,#1565C0);padding:22px 26px;border-radius:10px 10px 0 0;text-align:center;">
        <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 4px;letter-spacing:.08em;">PROVEXPRESS SAS — CONTROL DE INVENTARIO</p>
        <h1 style="color:#fff;font-size:17px;margin:0;font-weight:800;">INVENTARIO ${str} TECNOLOGÍA</h1>
      </div>`;

  for (const [sec, items] of Object.entries(bySec)) {
    html += `<h2 style="color:#1F4E79;border-left:3px solid #1565C0;padding:5px 12px;margin:18px 0 8px;font-size:13px;background:#f0f6ff;border-radius:0 5px 5px 0;">${sec}.</h2>`;
    items.forEach(item => {
      const ivaStr  = (item.iva||'').toUpperCase()==='SÍ' ? ' + IVA' : '';
      const qty     = item._qty??0;
      const qColor  = qty===0?'#DC2626':qty<5?'#D97706':'#059669';
      const imgUrl  = item.imagen||'';

      html += `
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:8px;border:1px solid #E2E8F0;border-radius:7px;overflow:hidden;">
          <tr>
            <td rowspan="5" style="width:68px;text-align:center;background:#F8FAFC;padding:8px;vertical-align:middle;border-right:1px solid #E2E8F0;">
              <img src="${imgUrl}" alt="${item.marca}" style="width:56px;height:56px;object-fit:cover;border-radius:5px;border:1px solid #E2E8F0;">
            </td>
            <td style="background:#F8FAFC;padding:5px 9px;width:110px;font-size:10px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">N/P</td>
            <td style="padding:5px 9px;font-weight:800;color:#1A2B6B;font-size:11.5px;border-bottom:1px solid #E2E8F0;">${item.np}</td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:5px 9px;font-size:10px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">PRODUCTO</td>
            <td style="padding:5px 9px;font-size:11px;border-bottom:1px solid #E2E8F0;">${item.producto}</td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:5px 9px;font-size:10px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">COSTO</td>
            <td style="padding:5px 9px;font-size:11px;border-bottom:1px solid #E2E8F0;"><strong>${fmtCOP(item.costo)}${ivaStr}</strong></td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:5px 9px;font-size:10px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">DISPONIBLES</td>
            <td style="padding:5px 9px;border-bottom:1px solid #E2E8F0;"><strong style="color:${qColor};font-size:12px;">${qty} UNIDADES</strong></td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:5px 9px;font-size:10px;font-weight:700;color:#475569;">INGRESO</td>
            <td style="padding:5px 9px;font-size:11px;">${fmtDate(item.fecha_ingreso)}</td>
          </tr>
        </table>`;
    });
  }

  html += `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:12px 16px;margin-top:14px;font-size:10.5px;color:#64748B;text-align:center;">
    Generado por <strong>Provex Inventario Suite</strong> · ${str}</div></div>`;

  box.innerHTML = html;
}

async function handleSend() {
  const btn = document.getElementById('btnSend');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Enviando…'; }

  try {
    const res = await fetch('http://localhost:8000/api/sync_and_send', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ recipient:'especialista.preventa@provexpress.com.co', products: ALL.map(p=>({...p,cantidad_actual:p._qty})) })
    });
    showToast(res.ok ? '🚀 Correo enviado y Excel actualizado exitosamente' : '⚠ Servidor local no activo — abriendo Outlook…');
    if (!res.ok) fallbackMailto();
  } catch {
    fallbackMailto();
    showToast('📧 Correo preparado — abriendo Outlook…');
  } finally {
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Confirmar, Enviar y Actualizar Excel'; }
  }
}

function fallbackMailto() {
  const subj = document.getElementById('emailSubject')?.textContent || 'INVENTARIO TECNOLOGIA';
  const body = ALL.slice(0,8).map(p=>`N/P: ${p.np} | ${p._qty} uds | ${p.producto.slice(0,60)}`).join('\n');
  window.location.href = `mailto:especialista.preventa@provexpress.com.co?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body+'\n\n[Ver tabla completa en la aplicación web]')}`;
}
