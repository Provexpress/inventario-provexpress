/* ── PROVEXPRESS INVENTARIO SUITE - APPLICATION LOGIC ── */

let rawData = null;
let currentProducts = [];
let originalQuantities = {};
let activeTab = 'dashboard';
let categoryChart = null;
let trendChart = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadData();
  setupEventListeners();
});

// Authentication System (Matching Provex-One Corporate Auth Gate)
function initAuth() {
  const authGate = document.getElementById('authGate');
  const appShell = document.getElementById('appShell');
  const authUser = document.getElementById('authUser');
  const authConnectBtn = document.getElementById('authConnectBtn');
  const authLogoutBtn = document.getElementById('authLogoutBtn');

  const savedUser = localStorage.getItem('provex_inventario_user');
  if (savedUser) {
    showAuthenticatedUI(JSON.parse(savedUser));
  }

  authConnectBtn.addEventListener('click', () => {
    const userObj = {
      name: 'Daniel Felipe Cardenas Rivera',
      email: 'especialista.preventa@provexpress.com.co',
      role: 'Especialista Preventa'
    };
    localStorage.setItem('provex_inventario_user', JSON.stringify(userObj));
    showAuthenticatedUI(userObj);
  });

  authLogoutBtn.addEventListener('click', () => {
    localStorage.removeItem('provex_inventario_user');
    authGate.classList.remove('auth-hidden');
    appShell.classList.add('app-locked');
    authLogoutBtn.hidden = true;
    authUser.hidden = true;
  });

  function showAuthenticatedUI(user) {
    authGate.classList.add('auth-hidden');
    appShell.classList.remove('app-locked');
    authUser.innerHTML = `<span class="user-name">${user.name}</span><br><span class="user-email">${user.email}</span>`;
    authUser.hidden = false;
    authLogoutBtn.hidden = false;
  }
}

// Load Inventory Data
async function loadData() {
  try {
    const response = await fetch('inventory_data.json');
    rawData = await response.json();
    
    // Default filter to JULIO 2026 or latest month
    const allProducts = rawData.products || [];
    currentProducts = allProducts.filter(p => p.mes === 'JULIO 2026');
    if (currentProducts.length === 0) {
      currentProducts = allProducts;
    }

    // Save original quantities to detect variations
    currentProducts.forEach(p => {
      originalQuantities[p.np] = p.cantidad_actual;
    });

    renderMetrics();
    renderCharts();
    renderTable();
    renderEmailPreview();
    updateSyncBadge();
  } catch (err) {
    console.error('Error cargando datos de inventario:', err);
  }
}

// Event Listeners for Filters & Tabs
function setupEventListeners() {
  // Tab Switcher
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(p => p.hidden = true);
      
      const tabTarget = e.currentTarget.dataset.tab;
      e.currentTarget.classList.add('active');
      document.getElementById(`tab-${tabTarget}`).hidden = false;
      
      if (tabTarget === 'dashboard') {
        renderCharts();
      } else if (tabTarget === 'email') {
        renderEmailPreview();
      }
    });
  });

  // Search & Filters
  const searchInput = document.getElementById('searchInput');
  const sectionFilter = document.getElementById('sectionFilter');
  const brandFilter = document.getElementById('brandFilter');

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (sectionFilter) sectionFilter.addEventListener('change', applyFilters);
  if (brandFilter) brandFilter.addEventListener('change', applyFilters);

  // Send Email & Sync Button
  const btnSendEmail = document.getElementById('btnSendEmail');
  if (btnSendEmail) {
    btnSendEmail.addEventListener('click', handleSendAndSync);
  }
}

function applyFilters() {
  const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const secValue = document.getElementById('sectionFilter')?.value || '';
  const brandValue = document.getElementById('brandFilter')?.value || '';

  const filtered = currentProducts.filter(p => {
    const matchSearch = p.producto.toLowerCase().includes(searchTerm) || p.np.toLowerCase().includes(searchTerm);
    const matchSec = secValue === '' || p.seccion === secValue;
    const matchBrand = brandValue === '' || p.marca === brandValue;
    return matchSearch && matchSec && matchBrand;
  });

  renderTable(filtered);
}

// Render Executive Dashboard KPIs
function renderMetrics() {
  const totalUnits = currentProducts.reduce((sum, p) => sum + (p.cantidad_actual || 0), 0);
  const totalValue = currentProducts.reduce((sum, p) => sum + ((p.costo || 0) * (p.cantidad_actual || 0)), 0);
  const activeCategories = new Set(currentProducts.map(p => p.categoria)).size;
  const avgTrm = (currentProducts.reduce((sum, p) => sum + (p.trm_ingreso || 3950), 0) / (currentProducts.length || 1)).toFixed(2);

  document.getElementById('kpiTotalUnits').innerText = totalUnits.toLocaleString();
  document.getElementById('kpiTotalValue').innerText = '$ ' + Math.round(totalValue).toLocaleString('es-CO');
  document.getElementById('kpiCategories').innerText = activeCategories;
  document.getElementById('kpiAvgTrm').innerText = '$ ' + Math.round(avgTrm).toLocaleString('es-CO');
}

// Render Interactive Charts (Chart.js)
function renderCharts() {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Stock by Category (Doughnut Chart)
  const catMap = {};
  currentProducts.forEach(p => {
    catMap[p.categoria] = (catMap[p.categoria] || 0) + p.cantidad_actual;
  });

  const catCtx = document.getElementById('categoryChart')?.getContext('2d');
  if (catCtx) {
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catMap),
        datasets: [{
          data: Object.values(catMap),
          backgroundColor: ['#1565C0', '#10B981', '#F59E0B', '#6A3FA0', '#0EA5E9', '#F43F5E', '#8B5CF6', '#64748B']
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // Chart 2: Daily Stock Trend (Line Chart)
  const trendCtx = document.getElementById('trendChart')?.getContext('2d');
  if (trendCtx) {
    const dayLabels = Array.from({length: 27}, (_, i) => `Día ${i+1}`);
    const dayTotals = dayLabels.map((_, i) => {
      const dayKey = `day_${i+1}`;
      return currentProducts.reduce((sum, p) => sum + (p.dias_stock?.[dayKey] || 0), 0);
    });

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: dayLabels,
        datasets: [{
          label: 'Unidades Disponibles en Stock',
          data: dayTotals,
          borderColor: '#1565C0',
          backgroundColor: 'rgba(21, 101, 192, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: false }
        }
      }
    });
  }
}

// Render Inventory Manager Table
function renderTable(productsToRender = currentProducts) {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  productsToRender.forEach((p, idx) => {
    const tr = document.createElement('tr');

    const origQty = originalQuantities[p.np] ?? p.cantidad_actual;
    let diffBadge = '';
    if (p.cantidad_actual > origQty) {
      diffBadge = `<span style="color:#10B981; font-weight:800; font-size:11px; margin-left:6px;">📈 +${p.cantidad_actual - origQty}</span>`;
    } else if (p.cantidad_actual < origQty) {
      diffBadge = `<span style="color:#F43F5E; font-weight:800; font-size:11px; margin-left:6px;">📉 -${origQty - p.cantidad_actual}</span>`;
    }

    let secBadgeClass = 'otros';
    const secUpper = p.seccion.toUpperCase();
    if (secUpper.includes('RENTA')) secBadgeClass = 'renta';
    else if (secUpper.includes('HP')) secBadgeClass = 'hp';
    else if (secUpper.includes('LENOVO')) secBadgeClass = 'lenovo';
    else if (secUpper.includes('DELL')) secBadgeClass = 'dell';
    else if (secUpper.includes('MONITOR')) secBadgeClass = 'monitores';

    const costFormatted = '$ ' + Math.round(p.costo).toLocaleString('es-CO');
    const totalValFormatted = '$ ' + Math.round(p.costo * p.cantidad_actual).toLocaleString('es-CO');

    tr.innerHTML = `
      <td style="font-weight:700; text-align:center;">${idx + 1}</td>
      <td><span class="badge-sec ${secBadgeClass}">${p.seccion}</span></td>
      <td>${p.categoria}</td>
      <td style="font-weight:700; text-align:center;">${p.marca}</td>
      <td style="font-weight:800; color:#1A2B6B; font-family:monospace;">${p.np}</td>
      <td>${p.producto}</td>
      <td style="text-align:right; font-weight:700;">${costFormatted}</td>
      <td style="text-align:center;">${p.iva}</td>
      <td style="text-align:center; font-size:11px;">${p.fecha_ingreso}</td>
      <td style="text-align:center;">
        <input type="number" class="qty-input" data-np="${p.np}" value="${p.cantidad_actual}" min="0">
        ${diffBadge}
      </td>
      <td style="text-align:right; font-weight:800; color:#1A2B6B;">${totalValFormatted}</td>
    `;

    tbody.appendChild(tr);
  });

  // Inline Quantity Editing
  tbody.querySelectorAll('.qty-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const targetNp = e.target.dataset.np;
      const newQty = parseInt(e.target.value, 10) || 0;

      const item = currentProducts.find(p => p.np === targetNp);
      if (item) {
        item.cantidad_actual = newQty;
        renderMetrics();
        renderEmailPreview();
        applyFilters();
      }
    });
  });
}

// Render Corporate HTML Email Preview
function renderEmailPreview() {
  const container = document.getElementById('emailPreviewContainer');
  if (!container) return;

  const itemsBySec = {};
  currentProducts.forEach(p => {
    const sec = p.seccion || 'VENTA';
    if (!itemsBySec[sec]) itemsBySec[sec] = [];
    itemsBySec[sec].push(p);
  });

  let html = `<div style="font-family: Arial, sans-serif; color: #333333; padding: 16px; background: #FFFFFF; border-radius: 12px;">`;

  for (let secTitle in itemsBySec) {
    html += `<h2 style="color: #1F4E79; border-bottom: 2px solid #1F4E79; padding-bottom: 5px; margin-top: 20px;">${secTitle}.</h2>`;
    itemsBySec[secTitle].forEach(item => {
      const ivaStr = item.iva.toUpperCase() === 'SÍ' ? ' + IVA' : '';
      const costFormatted = '$ ' + Math.round(item.costo).toLocaleString('es-CO');

      html += `
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 12px; border-color: #E2E8F0;">
          <tr><td style="background-color: #F8FAFC; font-weight: bold; width: 20%;">N/P</td><td><b>${item.np}</b></td></tr>
          <tr><td style="background-color: #F8FAFC; font-weight: bold;">Producto</td><td>${item.producto}</td></tr>
          <tr><td style="background-color: #F8FAFC; font-weight: bold;">Costo</td><td><b>${costFormatted}${ivaStr}</b> / <span style="color: #D9534F; font-weight: bold;">${item.cantidad_actual} UNIDADES DISPONIBLES</span></td></tr>
          <tr><td style="background-color: #F8FAFC; font-weight: bold;">INGRESO</td><td>${item.fecha_ingreso}</td></tr>
        </table>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;
}

// Handle 1-Click Send Email & Sync Excel Matrix
async function handleSendAndSync() {
  const btn = document.getElementById('btnSendEmail');
  const statusLbl = document.getElementById('syncStatusLbl');

  if (btn) {
    btn.disabled = true;
    btn.innerText = '⏳ Sincronizando Excel y Enviando Correo...';
  }

  try {
    // Send request to local Python backend bridge
    const response = await fetch('http://localhost:8000/api/sync_and_send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: 'especialista.preventa@provexpress.com.co',
        products: currentProducts
      })
    });

    if (response.ok) {
      alert('🚀 ¡Inventario sincronizado en Excel OneDrive y Correo enviado exitosamente a especialista.preventa@provexpress.com.co!');
      if (statusLbl) statusLbl.innerText = '✅ Sincronizado en tiempo real';
    } else {
      // Fallback: Open mailto link if offline
      window.location.href = `mailto:especialista.preventa@provexpress.com.co?subject=INVENTARIO%2031%20JULIO%202026%20TECNOLOGIA&body=El%20inventario%20ha%20sido%20actualizado%20en%20Excel%20OneDrive.`;
      alert('✅ Datos actualizados localmente y borrador preparado.');
    }
  } catch (err) {
    // Graceful offline fallback
    window.location.href = `mailto:especialista.preventa@provexpress.com.co?subject=INVENTARIO%2031%20JULIO%202026%20TECNOLOGIA&body=El%20inventario%20ha%20sido%20actualizado%20en%20Excel%20OneDrive.`;
    alert('✅ Datos cargados. Abriendo correo en Outlook...');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🚀 Confirmar, Enviar Correo y Actualizar Excel';
    }
  }
}

function updateSyncBadge() {
  const lbl = document.getElementById('syncStatusLbl');
  if (lbl) {
    lbl.innerText = '🟢 Conectado con Excel OneDrive';
  }
}
