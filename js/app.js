/* ══════════════════════════════════════════════════════════════
   PROVEXPRESS INVENTARIO SUITE — APP LOGIC v2
   Dashboard · Gestor · Email Generator · Modal
══════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
let rawData     = null;
let allProducts = [];     // all records in JSON
let displayed   = [];     // currently filtered set shown in table
let snapQtys    = {};     // snapshot of quantities on page load
let editingId   = null;   // id of product being edited (null = new)
let chartCategory = null;
let chartBrand    = null;
let chartTrend    = null;

const TODAY_STR = new Date().toLocaleDateString('es-CO', {day:'2-digit', month:'long', year:'numeric'}).toUpperCase();
const TODAY_ISO = new Date().toISOString().slice(0,10);

// ── Boot ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setEmailSubject();
  loadData();
});

// ── Data Loading ────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('inventory_data.json');
    rawData = await res.json();

    // Use most recent month's products; fallback to all
    const months = [...new Set((rawData.products || []).map(p => p.mes))];
    const lastMonth = months[months.length - 1];
    allProducts = rawData.products.filter(p => p.mes === lastMonth);
    if (!allProducts.length) allProducts = rawData.products || [];

    // Add local editable quantity field
    allProducts.forEach(p => {
      p._qty = p.cantidad_actual ?? 0;
      snapQtys[p.np] = p._qty;
    });

    setSyncLabel(`✓ ${allProducts.length} productos · ${lastMonth || ''}`);
    renderDashboard();
    applyFilters();
    renderEmailPreview();
    setEmailSubject();
  } catch(err) {
    setSyncLabel('⚠ Error cargando datos');
    console.error('[Data Load Error]', err);
  }
}

// ── Tab Switching ───────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.tab-page').forEach(p => p.hidden = true);
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      const tabId = 'tab-' + btn.dataset.tab;
      document.getElementById(tabId).hidden = false;
      if (btn.dataset.tab === 'dashboard') renderDashboard();
      if (btn.dataset.tab === 'email') renderEmailPreview();
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────
function fmtCOP(n) {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str.slice(0,10);
  return d.toLocaleDateString('es-CO', {day:'2-digit', month:'2-digit', year:'numeric'});
}
function setSyncLabel(txt) {
  const el = document.getElementById('syncLabel');
  if (el) el.textContent = txt;
}
function showToast(msg, dur=3000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}
function secBadgeClass(sec='') {
  const s = sec.toUpperCase();
  if (s.includes('RENTA'))    return 'renta';
  if (s.includes('HP'))       return 'hp';
  if (s.includes('LENOVO'))   return 'lenovo';
  if (s.includes('DELL'))     return 'dell';
  if (s.includes('MONITOR'))  return 'monitor';
  return 'otros';
}

// ── DASHBOARD ───────────────────────────────────────────────────
function renderDashboard() {
  if (!allProducts.length) return;

  const totalUnits = allProducts.reduce((s,p) => s + p._qty, 0);
  const totalValue = allProducts.reduce((s,p) => s + p.costo * p._qty, 0);
  const avgTrm     = allProducts.reduce((s,p) => s + (p.trm_ingreso||4000), 0) / allProducts.length;
  const lowStock   = allProducts.filter(p => p._qty < 5).length;
  const cats       = new Set(allProducts.map(p => p.categoria)).size;

  document.getElementById('kpiTotalUnits').textContent = totalUnits.toLocaleString();
  document.getElementById('kpiTotalValue').textContent = fmtCOP(totalValue);
  document.getElementById('kpiProducts').textContent   = allProducts.length;
  document.getElementById('kpiCategories').textContent = cats;
  document.getElementById('kpiValueUSD').textContent   = '$ ' + (totalValue / avgTrm).toLocaleString('es-CO', {maximumFractionDigits:0});
  document.getElementById('kpiTrm').textContent        = 'TRM: ' + fmtCOP(avgTrm);
  document.getElementById('kpiLowStock').textContent   = lowStock;

  renderCategoryChart();
  renderBrandChart();
  renderTrendChart();
  renderCatSummary();
}

function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;
  const catMap = {};
  allProducts.forEach(p => { catMap[p.categoria] = (catMap[p.categoria]||0) + p._qty; });
  const labels = Object.keys(catMap);
  const values = Object.values(catMap);
  const colors = ['#1565C0','#10B981','#F59E0B','#6A3FA0','#0EA5E9','#F43F5E','#8B5CF6','#64748B','#059669','#D97706'];

  if (chartCategory) chartCategory.destroy();
  chartCategory = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }
      }
    }
  });
}

function renderBrandChart() {
  const ctx = document.getElementById('brandChart');
  if (!ctx) return;
  const brandMap = {};
  allProducts.forEach(p => { brandMap[p.marca] = (brandMap[p.marca]||0) + p._qty; });
  const sorted = Object.entries(brandMap).sort((a,b) => b[1]-a[1]).slice(0,8);

  if (chartBrand) chartBrand.destroy();
  chartBrand = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Unidades',
        data: sorted.map(e => e[1]),
        backgroundColor: 'rgba(21,101,192,.75)',
        borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } } }, x: { ticks: { font: { size: 11 } } } }
    }
  });
}

function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  // Build day labels from days_stock keys across all products
  const allDayKeys = new Set();
  allProducts.forEach(p => { Object.keys(p.dias_stock || {}).forEach(k => allDayKeys.add(k)); });
  const dayKeys = [...allDayKeys].sort((a,b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));
  const labels  = dayKeys.map(k => 'Día ' + k.split('_')[1]);
  const values  = dayKeys.map(k => allProducts.reduce((s,p) => s + ((p.dias_stock||{})[k]||0), 0));

  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Unidades en Stock',
        data: values,
        borderColor: '#1565C0',
        backgroundColor: 'rgba(21,101,192,.08)',
        fill: true, tension: 0.35, pointRadius: 3,
        pointBackgroundColor: '#1565C0'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: false, ticks: { font: { size: 11 } } },
        x: { ticks: { font: { size: 11 }, maxRotation: 45 } }
      }
    }
  });
}

function renderCatSummary() {
  const grid = document.getElementById('catSummaryGrid');
  if (!grid) return;

  const catMap = {};
  allProducts.forEach(p => {
    if (!catMap[p.categoria]) catMap[p.categoria] = { units: 0, value: 0 };
    catMap[p.categoria].units += p._qty;
    catMap[p.categoria].value += p.costo * p._qty;
  });

  grid.innerHTML = Object.entries(catMap).sort((a,b) => b[1].units - a[1].units).map(([cat, data]) => `
    <div class="cat-card">
      <div class="cat-card-name">${cat}</div>
      <div class="cat-card-count">${data.units.toLocaleString()}</div>
      <div class="cat-card-val">${fmtCOP(data.value)}</div>
    </div>
  `).join('');
}

// ── GESTOR DE INVENTARIO TABLE ───────────────────────────────────
function applyFilters() {
  const search  = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const sec     = document.getElementById('sectionFilter')?.value || '';
  const cat     = document.getElementById('catFilter')?.value || '';
  const brand   = document.getElementById('brandFilter')?.value || '';

  displayed = allProducts.filter(p => {
    const matchSearch = !search || p.producto.toLowerCase().includes(search) || p.np.toLowerCase().includes(search) || p.marca.toLowerCase().includes(search);
    const matchSec    = !sec   || p.seccion  === sec;
    const matchCat    = !cat   || p.categoria=== cat;
    const matchBrand  = !brand || p.marca    === brand;
    return matchSearch && matchSec && matchCat && matchBrand;
  });

  renderTable();
}

// Wire filters
document.addEventListener('DOMContentLoaded', () => {
  ['searchInput','sectionFilter','catFilter','brandFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input',  applyFilters);
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });
});

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  let viewUnits = 0, viewValue = 0;
  tbody.innerHTML = '';

  displayed.forEach((p, idx) => {
    const snap = snapQtys[p.np] ?? p._qty;
    const diff = p._qty - snap;

    let diffBadge = '';
    if (diff > 0) diffBadge = `<span class="diff-badge up"> +${diff}</span>`;
    if (diff < 0) diffBadge = `<span class="diff-badge down"> ${diff}</span>`;

    viewUnits += p._qty;
    viewValue += p.costo * p._qty;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center; color:var(--slate); font-size:11px;">${idx+1}</td>
      <td style="text-align:center;">
        <img class="prod-thumb" src="${p.imagen||''}" alt="${p.marca}" loading="lazy" onerror="this.src='icons/provex_icon_48.png'">
      </td>
      <td><span class="badge-sec ${secBadgeClass(p.seccion)}">${p.seccion}</span></td>
      <td style="font-size:11px; color:var(--slate);">${p.categoria}</td>
      <td style="font-weight:700;">${p.marca}</td>
      <td style="font-weight:800; color:var(--navy); font-family:monospace; font-size:12px;">${p.np}</td>
      <td style="max-width:280px; font-size:12px; line-height:1.4;">${p.producto}</td>
      <td style="text-align:right; font-weight:700; white-space:nowrap;">${fmtCOP(p.costo)}</td>
      <td style="text-align:center;">${p.iva}</td>
      <td style="text-align:center; font-size:11px; white-space:nowrap;">${fmtDate(p.fecha_ingreso)}</td>
      <td style="text-align:center;">
        <input type="number" class="qty-input" data-np="${p.np}" value="${p._qty}" min="0">
        ${diffBadge}
      </td>
      <td style="text-align:right; font-weight:800; color:var(--navy); white-space:nowrap;">${fmtCOP(p.costo * p._qty)}</td>
      <td style="text-align:center;">
        <div class="row-actions">
          <button class="btn-row edit" title="Editar" onclick="openEditModal('${p.np}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-row delete" title="Eliminar" onclick="deleteProduct('${p.np}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update quantity on change
  tbody.querySelectorAll('.qty-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const np = e.target.dataset.np;
      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
      const prod = allProducts.find(p => p.np === np);
      if (prod) {
        prod._qty = val;
        renderDashboard();
        renderEmailPreview();
        applyFilters();
      }
    });
  });

  document.getElementById('recordCount').textContent  = displayed.length;
  document.getElementById('viewTotalUnits').textContent = viewUnits.toLocaleString();
  document.getElementById('viewTotalValue').textContent = fmtCOP(viewValue);
}

// ── MODAL: ADD / EDIT ────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> Nuevo Producto';
  document.getElementById('btnSaveProduct').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Producto';
  clearForm();
  // Default today's date
  document.getElementById('fldFecha').value = TODAY_ISO;
  document.getElementById('productModal').classList.remove('hidden');
}

function openEditModal(np) {
  const prod = allProducts.find(p => p.np === np);
  if (!prod) return;
  editingId = np;
  document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-pen"></i> Editar Producto';
  document.getElementById('btnSaveProduct').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Actualizar Producto';
  document.getElementById('fldSeccion').value  = prod.seccion   || '';
  document.getElementById('fldCategoria').value= prod.categoria || '';
  document.getElementById('fldMarca').value    = prod.marca     || '';
  document.getElementById('fldNP').value       = prod.np        || '';
  document.getElementById('fldProducto').value = prod.producto  || '';
  document.getElementById('fldCosto').value    = prod.costo     || 0;
  document.getElementById('fldIva').value      = prod.iva       || 'Sí';
  document.getElementById('fldTrm').value      = prod.trm_ingreso || 4150;
  document.getElementById('fldFecha').value    = (prod.fecha_ingreso||'').slice(0,10);
  document.getElementById('fldCantidad').value = prod._qty      || 0;
  document.getElementById('productModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('productModal').classList.add('hidden');
  editingId = null;
}

function handleModalOverlayClick(e) {
  if (e.target.id === 'productModal') closeModal();
}

function clearForm() {
  ['fldSeccion','fldCategoria','fldMarca','fldNP','fldProducto','fldIva'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName === 'SELECT' ? el.options[0].value : '';
  });
  document.getElementById('fldCosto').value    = '';
  document.getElementById('fldTrm').value      = '4150';
  document.getElementById('fldCantidad').value = '0';
}

function saveProduct() {
  const np      = document.getElementById('fldNP').value.trim().toUpperCase();
  const marca   = document.getElementById('fldMarca').value.trim().toUpperCase();
  const prod    = document.getElementById('fldProducto').value.trim();
  const costo   = parseFloat(document.getElementById('fldCosto').value) || 0;
  const qty     = parseInt(document.getElementById('fldCantidad').value, 10) || 0;

  if (!np || !marca || !prod || !costo) {
    showToast('⚠ Completa todos los campos obligatorios (*)');
    return;
  }

  const newItem = {
    id:           editingId ? allProducts.find(p=>p.np===editingId)?.id : Date.now(),
    mes:          new Date().toLocaleString('es-CO', {month:'long',year:'numeric'}).toUpperCase(),
    seccion:      document.getElementById('fldSeccion').value,
    categoria:    document.getElementById('fldCategoria').value,
    marca,
    np,
    producto:     prod,
    costo,
    iva:          document.getElementById('fldIva').value,
    fecha_ingreso:document.getElementById('fldFecha').value,
    trm_ingreso:  parseFloat(document.getElementById('fldTrm').value) || 4150,
    cantidad_actual: qty,
    _qty:         qty,
    dias_stock:   {},
    imagen:       getImageByCategory(document.getElementById('fldCategoria').value, marca)
  };

  if (editingId) {
    // Update in place
    const idx = allProducts.findIndex(p => p.np === editingId);
    if (idx >= 0) {
      allProducts[idx] = { ...allProducts[idx], ...newItem };
      snapQtys[np] = qty;
    }
    showToast(`✏️ Producto ${np} actualizado`);
  } else {
    // Check duplicate NP
    if (allProducts.find(p => p.np === np)) {
      showToast(`⚠ Ya existe un producto con N/P ${np}`);
      return;
    }
    allProducts.unshift(newItem);
    snapQtys[np] = qty;
    showToast(`✅ Producto ${np} agregado al inventario`);
  }

  closeModal();
  renderDashboard();
  applyFilters();
  renderEmailPreview();
}

function deleteProduct(np) {
  if (!confirm(`¿Eliminar el producto con N/P ${np} del inventario?`)) return;
  const idx = allProducts.findIndex(p => p.np === np);
  if (idx >= 0) allProducts.splice(idx, 1);
  delete snapQtys[np];
  renderDashboard();
  applyFilters();
  renderEmailPreview();
  showToast(`🗑 Producto ${np} eliminado`);
}

function getImageByCategory(cat='', brand='') {
  const c = cat.toUpperCase(); const b = brand.toUpperCase();
  if (c.includes('PORTATIL') || c.includes('PORTÁTIL')) {
    if (b.includes('DELL'))   return 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=500&auto=format&fit=crop&q=80';
    if (b.includes('HP'))     return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80';
    if (b.includes('APPLE'))  return 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=80';
    return 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=500&auto=format&fit=crop&q=80';
  }
  if (c.includes('DESKTOP') || c.includes('PC')) return 'https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=500&auto=format&fit=crop&q=80';
  if (c.includes('MONITOR'))   return 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=80';
  if (c.includes('IMPRESORA')) return 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=500&auto=format&fit=crop&q=80';
  if (c.includes('CELULAR'))   return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80';
  if (c.includes('DIADEMA'))   return 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=500&auto=format&fit=crop&q=80';
  if (c.includes('SSD') || c.includes('ALMACEN')) return 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80';
  return 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500&auto=format&fit=crop&q=80';
}

// ── EMAIL GENERATOR ──────────────────────────────────────────────
function setEmailSubject() {
  const el = document.getElementById('emailSubject');
  if (el) {
    const today = new Date();
    const str   = today.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();
    el.textContent = `INVENTARIO ${str} TECNOLOGIA`;
  }
}

function renderEmailPreview() {
  const container = document.getElementById('emailPreviewContainer');
  if (!container) return;

  // Group products by seccion
  const bySec = {};
  allProducts.forEach(p => {
    const k = p.seccion || 'GENERAL';
    if (!bySec[k]) bySec[k] = [];
    bySec[k].push(p);
  });

  const today = new Date();
  const dateStr = today.toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();

  let html = `
    <div style="font-family:Arial,sans-serif;color:#1E293B;max-width:900px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1A2B6B,#1565C0);padding:24px 28px;border-radius:10px 10px 0 0;text-align:center;margin-bottom:2px;">
        <p style="color:rgba(255,255,255,.8);font-size:12px;margin:0 0 4px;letter-spacing:.08em;">PROVEXPRESS SAS — INVENTARIO CORPORATIVO</p>
        <h1 style="color:#fff;font-size:18px;margin:0;font-weight:800;">INVENTARIO ${dateStr} TECNOLOGÍA</h1>
      </div>
  `;

  for (const [sec, items] of Object.entries(bySec)) {
    html += `
      <h2 style="color:#1F4E79;border-left:4px solid #1565C0;padding:6px 12px;margin:20px 0 10px;font-size:14px;background:#f0f6ff;border-radius:0 6px 6px 0;">${sec}.</h2>
    `;
    items.forEach(item => {
      const ivaStr  = (item.iva||'').toUpperCase()==='SÍ' ? ' + IVA' : '';
      const imgUrl  = item.imagen || '';
      const qty     = item._qty ?? item.cantidad_actual ?? 0;
      const qtyColor= qty === 0 ? '#DC2626' : qty < 5 ? '#D97706' : '#059669';

      html += `
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:10px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
          <tr>
            <td rowspan="5" style="width:72px;text-align:center;background:#F8FAFC;padding:10px;vertical-align:middle;border-right:1px solid #E2E8F0;">
              <img src="${imgUrl}" alt="${item.marca}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #E2E8F0;">
            </td>
            <td style="background:#F8FAFC;padding:6px 10px;width:120px;font-size:11px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">N/P</td>
            <td style="padding:6px 10px;font-weight:800;color:#1A2B6B;font-size:12px;border-bottom:1px solid #E2E8F0;">${item.np}</td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:6px 10px;font-size:11px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">PRODUCTO</td>
            <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #E2E8F0;">${item.producto}</td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:6px 10px;font-size:11px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">COSTO</td>
            <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #E2E8F0;"><strong>${fmtCOP(item.costo)}${ivaStr}</strong></td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:6px 10px;font-size:11px;font-weight:700;color:#475569;border-bottom:1px solid #E2E8F0;">DISPONIBLES</td>
            <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;"><strong style="color:${qtyColor};font-size:13px;">${qty} UNIDADES</strong></td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:6px 10px;font-size:11px;font-weight:700;color:#475569;">INGRESO</td>
            <td style="padding:6px 10px;font-size:12px;">${fmtDate(item.fecha_ingreso)}</td>
          </tr>
        </table>
      `;
    });
  }

  html += `
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px 18px;margin-top:16px;font-size:11px;color:#64748B;text-align:center;">
      Generado automáticamente por <strong>Provex Inventario Suite</strong> · ${dateStr}
    </div>
    </div>`;

  container.innerHTML = html;
}

// ── SEND + SYNC ─────────────────────────────────────────────────
async function handleSendAndSync() {
  const btn = document.getElementById('btnSendEmail');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…'; }

  try {
    const res = await fetch('http://localhost:8000/api/sync_and_send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: 'especialista.preventa@provexpress.com.co',
        products: allProducts.map(p => ({ ...p, cantidad_actual: p._qty }))
      })
    });
    if (res.ok) {
      showToast('🚀 Correo enviado y Excel OneDrive actualizado exitosamente');
    } else {
      fallbackMailto();
    }
  } catch {
    fallbackMailto();
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Confirmar, Enviar y Actualizar Excel'; }
  }
}

function fallbackMailto() {
  const subj = document.getElementById('emailSubject')?.textContent || 'INVENTARIO TECNOLOGIA';
  const bodyPreview = allProducts.slice(0,5).map(p => `N/P: ${p.np} | ${p.producto} | Disponibles: ${p._qty}`).join('\n');
  window.location.href = `mailto:especialista.preventa@provexpress.com.co?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bodyPreview + '\n\n[Ver tabla completa en la aplicación web]')}`;
  showToast('📧 Abriendo Outlook con el correo…');
}
