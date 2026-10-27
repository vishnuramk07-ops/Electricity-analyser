/**
 * Electricity Bill Estimator & Power Consumption Analyzer
 * Web Application Logic (ES6+)
 * Faithful implementation of Java MVC logic with live reactivity
 */

// ============================================================================
// DEFAULT DATASETS & STATE
// ============================================================================

const DEFAULT_APPLIANCES = [
  { id: 1, name: "Inverter AC (1.5 Ton)", category: "Cooling", wattage: 1500.0, qty: 1, hours: 8.0, days: 30 },
  { id: 2, name: "Refrigerator (Frost-Free)", category: "Kitchen", wattage: 250.0, qty: 1, hours: 8.0, days: 30 },
  { id: 3, name: "Ceiling Fan", category: "Cooling", wattage: 75.0, qty: 4, hours: 12.0, days: 30 },
  { id: 4, name: "Smart LED TV (55\")", category: "Entertainment", wattage: 100.0, qty: 1, hours: 5.0, days: 30 },
  { id: 5, name: "LED Bulbs (9W)", category: "Lighting", wattage: 9.0, qty: 8, hours: 6.0, days: 30 },
  { id: 6, name: "Microwave Oven", category: "Kitchen", wattage: 1200.0, qty: 1, hours: 0.5, days: 30 },
  { id: 7, name: "Washing Machine", category: "Cleaning", wattage: 500.0, qty: 1, hours: 1.5, days: 20 },
  { id: 8, name: "Water Heater / Geyser", category: "Heating", wattage: 2000.0, qty: 1, hours: 1.0, days: 30 },
  { id: 9, name: "Workstation / Laptop", category: "Utility", wattage: 85.0, qty: 2, hours: 8.0, days: 25 },
  { id: 10, name: "Water Pump (1 HP)", category: "Utility", wattage: 750.0, qty: 1, hours: 1.0, days: 30 }
];

const DEFAULT_TARIFF = {
  tariffName: "Standard Domestic Progressive Tariff",
  currencySymbol: "₹",
  fixedCharge: 80.0,
  fuelSurchargePercent: 5.0,
  taxPercent: 9.0,
  slabs: [
    { minUnits: 0.0, maxUnits: 100.0, ratePerUnit: 3.50, description: "Lifeline / Tier 1" },
    { minUnits: 100.0, maxUnits: 200.0, ratePerUnit: 4.80, description: "Moderate / Tier 2" },
    { minUnits: 200.0, maxUnits: 400.0, ratePerUnit: 6.50, description: "High / Tier 3" },
    { minUnits: 400.0, maxUnits: null, ratePerUnit: 8.00, description: "Heavy / Tier 4" }
  ]
};

const HISTORICAL_TREND = [
  { month: "May 2026", kwh: 580.0, cost: 4120.0 },
  { month: "Jun 2026", kwh: 620.0, cost: 4480.0 },
  { month: "Jul 2026", kwh: 595.0, cost: 4260.0 },
  { month: "Aug 2026", kwh: 540.0, cost: 3790.0 },
  { month: "Sep 2026", kwh: 510.0, cost: 3530.0 }
];

// App State
let appliances = JSON.parse(localStorage.getItem('powercalc_appliances')) || [...DEFAULT_APPLIANCES];
let tariff = JSON.parse(localStorage.getItem('powercalc_tariff')) || { ...DEFAULT_TARIFF };
let monthlyBudget = parseFloat(localStorage.getItem('powercalc_budget')) || 3500.0;
let simSettings = {}; // { app_id: { enabled: bool, hours: num } }

// Helper: Calculate single appliance monthly kWh
function calculateApplianceKwh(app) {
  return (app.wattage * app.qty * app.hours * app.days) / 1000.0;
}

// Helper: Currency formatting
function fmtCurrency(val) {
  return tariff.currencySymbol + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// BILL ESTIMATOR ENGINE (PROGRESSIVE SLAB STRATEGY)
// ============================================================================

function computeProgressiveBill(totalUnits, tariffConfig = tariff) {
  let remaining = totalUnits;
  let energyCharges = 0.0;
  const slabCharges = [];

  for (const slab of tariffConfig.slabs) {
    if (remaining <= 0) {
      slabCharges.push({ slab, unitsBilled: 0, cost: 0 });
      continue;
    }

    const slabCapacity = (slab.maxUnits === null) ? Infinity : (slab.maxUnits - slab.minUnits);
    const unitsInThisSlab = Math.min(remaining, slabCapacity);
    const costForSlab = unitsInThisSlab * slab.ratePerUnit;

    energyCharges += costForSlab;
    remaining -= unitsInThisSlab;

    slabCharges.push({
      slab,
      unitsBilled: unitsInThisSlab,
      cost: costForSlab
    });
  }

  const fixed = tariffConfig.fixedCharge;
  const fuel = (energyCharges * tariffConfig.fuelSurchargePercent) / 100.0;
  const tax = ((energyCharges + fuel) * tariffConfig.taxPercent) / 100.0;
  const total = energyCharges + fixed + fuel + tax;

  return {
    totalUnits,
    energyCharges,
    fixedCharge: fixed,
    fuelSurcharge: fuel,
    tax,
    grandTotal: total,
    slabCharges
  };
}

// ============================================================================
// UI RENDERING & DATA BINDINGS
// ============================================================================

function recalculateAndRender() {
  // 1. Calculate Total System Load
  let totalKwh = 0.0;
  appliances.forEach(a => {
    totalKwh += calculateApplianceKwh(a);
  });

  const bill = computeProgressiveBill(totalKwh);

  // 2. Update Top Header Bar
  document.getElementById('hdr-total-kwh').textContent = `${totalKwh.toFixed(2)} kWh`;
  document.getElementById('hdr-total-cost').textContent = fmtCurrency(bill.grandTotal);

  // 3. Update Budget Badges & Progress
  updateBudgetUI(bill.grandTotal);

  // 4. Update Tab 1 KPIs & Table
  document.getElementById('kpi-kwh').innerHTML = `${totalKwh.toFixed(2)} <span class="unit">kWh</span>`;
  document.getElementById('kpi-bill').textContent = fmtCurrency(bill.grandTotal);
  document.getElementById('kpi-count-sub').textContent = `${appliances.length} active devices`;
  document.getElementById('kpi-daily').innerHTML = `${(totalKwh / 30.0).toFixed(2)} <span class="unit">kWh/day</span>`;

  // Peak Appliance
  if (appliances.length > 0) {
    const sorted = [...appliances].sort((a, b) => calculateApplianceKwh(b) - calculateApplianceKwh(a));
    const peak = sorted[0];
    const peakKwh = calculateApplianceKwh(peak);
    document.getElementById('kpi-peak-app').textContent = peak.name;
    document.getElementById('kpi-peak-sub').textContent = `${peakKwh.toFixed(1)} kWh (${((peakKwh / totalKwh) * 100).toFixed(1)}% share)`;
  } else {
    document.getElementById('kpi-peak-app').textContent = "None";
    document.getElementById('kpi-peak-sub').textContent = "No appliances added";
  }

  renderAppliancesTable(totalKwh);

  // 5. Update Tab 2: Bill Breakdown
  renderSlabTable(bill);

  // 6. Update Tab 3: Analytics Charts
  renderCharts(totalKwh);

  // 7. Update Tab 4: Simulator Controls
  renderSimulator(totalKwh, bill.grandTotal);

  // 8. Update Tab 5: Smart Suggestions
  renderSuggestions(totalKwh);

  // 9. Update Tab 6: Tariff Editor
  renderTariffEditor();

  // Save to LocalStorage
  localStorage.setItem('powercalc_appliances', JSON.stringify(appliances));
  localStorage.setItem('powercalc_tariff', JSON.stringify(tariff));
  localStorage.setItem('powercalc_budget', monthlyBudget.toString());
}

// ----------------------------------------------------------------------------
// Budget Tracker Logic
// ----------------------------------------------------------------------------
function updateBudgetUI(grandTotal) {
  const badge = document.getElementById('hdr-budget-badge');
  const bar = document.getElementById('budget-progress-bar');
  const txt = document.getElementById('budget-status-text');
  const pctTxt = document.getElementById('budget-pct-text');
  const input = document.getElementById('budget-input');

  input.value = monthlyBudget;
  const pct = monthlyBudget > 0 ? (grandTotal / monthlyBudget) * 100.0 : 0;
  bar.style.width = Math.min(100, pct) + '%';
  pctTxt.textContent = `${pct.toFixed(1)}%`;

  badge.className = 'badge';
  bar.className = 'progress-bar-fill';

  if (grandTotal > monthlyBudget) {
    const overrun = grandTotal - monthlyBudget;
    badge.classList.add('badge-danger');
    badge.textContent = `⚠️ Over Budget by ${fmtCurrency(overrun)}`;
    bar.classList.add('danger');
    txt.textContent = `Budget exceeded by ${fmtCurrency(overrun)} (${pct.toFixed(1)}% consumed)`;
  } else if (pct >= 80.0) {
    badge.classList.add('badge-warning');
    badge.textContent = `⚠️ Approaching Limit (${pct.toFixed(0)}%)`;
    bar.classList.add('warning');
    txt.textContent = `Approaching budget threshold (${pct.toFixed(1)}% consumed)`;
  } else {
    badge.classList.add('badge-success');
    badge.textContent = `✓ Within Budget`;
    txt.textContent = `${fmtCurrency(monthlyBudget - grandTotal)} remaining under monthly allowance`;
  }
}

// ----------------------------------------------------------------------------
// Tab 1: Appliances Table
// ----------------------------------------------------------------------------
function renderAppliancesTable(totalKwh) {
  const tbody = document.getElementById('appliances-tbody');
  tbody.innerHTML = '';

  appliances.forEach((app, idx) => {
    const kwh = calculateApplianceKwh(app);
    const share = totalKwh > 0 ? ((kwh / totalKwh) * 100.0).toFixed(1) : "0.0";

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(app.name)}</strong></td>
      <td><span class="badge badge-neutral">${app.category}</span></td>
      <td>${app.wattage} W</td>
      <td>${app.qty}</td>
      <td>${app.hours} hrs</td>
      <td>${app.days} days</td>
      <td><strong>${kwh.toFixed(2)}</strong></td>
      <td>${share}%</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editAppliance(${app.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAppliance(${app.id})">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------------------------------
// Tab 2: Progressive Slab Breakdown
// ----------------------------------------------------------------------------
function renderSlabTable(bill) {
  const tbody = document.getElementById('slab-tbody');
  tbody.innerHTML = '';

  bill.slabCharges.forEach(item => {
    const range = item.slab.maxUnits === null 
      ? `> ${item.slab.minUnits} units` 
      : `${item.slab.minUnits} - ${item.slab.maxUnits} units`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.slab.description}</strong></td>
      <td>${range}</td>
      <td>${fmtCurrency(item.slab.ratePerUnit)} / unit</td>
      <td>${item.unitsBilled.toFixed(2)}</td>
      <td><strong>${fmtCurrency(item.cost)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('inv-energy-charges').textContent = fmtCurrency(bill.energyCharges);
  document.getElementById('inv-fixed-charges').textContent = fmtCurrency(bill.fixedCharge);
  document.getElementById('inv-fuel-pct').textContent = tariff.fuelSurchargePercent.toFixed(1);
  document.getElementById('inv-fuel-charge').textContent = fmtCurrency(bill.fuelSurcharge);
  document.getElementById('inv-tax-pct').textContent = tariff.taxPercent.toFixed(1);
  document.getElementById('inv-tax-charge').textContent = fmtCurrency(bill.tax);
  document.getElementById('inv-grand-total').textContent = fmtCurrency(bill.grandTotal);
  document.getElementById('tariff-badge-name').textContent = tariff.tariffName;
}

// ----------------------------------------------------------------------------
// Tab 3: Visual Analytics (HTML5 Canvas Charts)
// ----------------------------------------------------------------------------
const WARM_PALETTE = ['#b87333', '#c4882b', '#4e805b', '#8c6d46', '#c24c34', '#7a6b5e', '#5c4e42', '#d4a373', '#2b2118', '#6b7c63'];

function renderCharts(totalKwh) {
  drawDonutChart(totalKwh);
  drawBarChart();
  drawLineChart();
}

function drawDonutChart(totalKwh) {
  const canvas = document.getElementById('chart-pie');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (appliances.length === 0 || totalKwh === 0) {
    ctx.fillStyle = '#7a6b5e';
    ctx.font = '14px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
    return;
  }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outerRadius = 100;
  const innerRadius = 55;
  let startAngle = -Math.PI / 2;

  const legendContainer = document.getElementById('pie-legend');
  legendContainer.innerHTML = '';

  appliances.forEach((app, i) => {
    const kwh = calculateApplianceKwh(app);
    const sliceAngle = (kwh / totalKwh) * (2 * Math.PI);
    const color = WARM_PALETTE[i % WARM_PALETTE.length];

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    startAngle += sliceAngle;

    // Legend item
    const leg = document.createElement('div');
    leg.className = 'legend-item';
    leg.innerHTML = `
      <span class="legend-dot" style="background:${color};"></span>
      <span>${escapeHtml(app.name)} (${((kwh / totalKwh) * 100).toFixed(0)}%)</span>
    `;
    legendContainer.appendChild(leg);
  });

  // Center Text in Donut
  ctx.fillStyle = '#2b2118';
  ctx.font = 'bold 15px Plus Jakarta Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${totalKwh.toFixed(0)} kWh`, cx, cy - 8);
  ctx.font = '11px Plus Jakarta Sans';
  ctx.fillStyle = '#7a6b5e';
  ctx.fillText('Monthly', cx, cy + 12);
}

function drawBarChart() {
  const canvas = document.getElementById('chart-bar');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Group by category
  const categories = {};
  appliances.forEach(app => {
    const kwh = calculateApplianceKwh(app);
    categories[app.category] = (categories[app.category] || 0) + kwh;
  });

  const catNames = Object.keys(categories);
  if (catNames.length === 0) return;

  const maxVal = Math.max(...Object.values(categories), 10);
  const chartHeight = 200;
  const chartBottom = 240;
  const barWidth = Math.min(42, (canvas.width - 80) / catNames.length - 12);

  ctx.strokeStyle = '#e5dcd0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, chartBottom);
  ctx.lineTo(canvas.width - 20, chartBottom);
  ctx.stroke();

  catNames.forEach((cat, idx) => {
    const val = categories[cat];
    const barHeight = (val / maxVal) * chartHeight;
    const x = 50 + idx * (barWidth + 16);
    const y = chartBottom - barHeight;

    ctx.fillStyle = WARM_PALETTE[idx % WARM_PALETTE.length];
    ctx.fillRect(x, y, barWidth, barHeight);

    // Label on top
    ctx.fillStyle = '#2b2118';
    ctx.font = 'bold 10.5px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(`${val.toFixed(0)}`, x + barWidth / 2, y - 6);

    // Category bottom label
    ctx.fillStyle = '#7a6b5e';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.fillText(cat.substring(0, 8), x + barWidth / 2, chartBottom + 16);
  });
}

function drawLineChart() {
  const canvas = document.getElementById('chart-line');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const data = HISTORICAL_TREND;
  const maxKwh = Math.max(...data.map(d => d.kwh), 700);
  const chartBottom = 210;
  const chartTop = 30;
  const chartHeight = chartBottom - chartTop;

  // Grid lines
  ctx.strokeStyle = '#f2ebe1';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = chartBottom - (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(canvas.width - 30, y);
    ctx.stroke();

    ctx.fillStyle = '#8c7b6c';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round((i / 4) * maxKwh)}`, 44, y + 3);
  }

  // Plot line
  const xStep = (canvas.width - 100) / (data.length - 1);
  ctx.beginPath();
  ctx.strokeStyle = '#b87333';
  ctx.lineWidth = 3;

  data.forEach((d, idx) => {
    const x = 60 + idx * xStep;
    const y = chartBottom - (d.kwh / maxKwh) * chartHeight;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots & Labels
  data.forEach((d, idx) => {
    const x = 60 + idx * xStep;
    const y = chartBottom - (d.kwh / maxKwh) * chartHeight;

    ctx.fillStyle = '#b87333';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2b2118';
    ctx.font = 'bold 11px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(`${d.kwh} kWh`, x, y - 12);
    ctx.font = '10px Plus Jakarta Sans';
    ctx.fillStyle = '#7a6b5e';
    ctx.fillText(fmtCurrency(d.cost), x, y + 18);
    ctx.fillText(d.month, x, chartBottom + 18);
  });
}

// ----------------------------------------------------------------------------
// Tab 4: What-If Simulator
// ----------------------------------------------------------------------------
function renderSimulator(baseKwh, baseCost) {
  const container = document.getElementById('sim-sliders-container');
  if (!container) return;

  // Initialize simulator state if not exists
  appliances.forEach(app => {
    if (!simSettings[app.id]) {
      simSettings[app.id] = { enabled: true, hours: app.hours };
    }
  });

  container.innerHTML = '';

  appliances.forEach(app => {
    const state = simSettings[app.id];
    const row = document.createElement('div');
    row.className = 'sim-item-row';
    row.innerHTML = `
      <div class="sim-item-header">
        <span class="sim-item-name">${escapeHtml(app.name)}</span>
        <span class="sim-item-val" id="sim-val-${app.id}">${state.enabled ? state.hours + ' hrs/day' : 'OFF'}</span>
      </div>
      <div class="sim-slider-wrap">
        <label class="toggle-switch">
          <input type="checkbox" id="sim-toggle-${app.id}" ${state.enabled ? 'checked' : ''} onchange="onSimToggle(${app.id}, this.checked)">
          <span>Active</span>
        </label>
        <input type="range" id="sim-range-${app.id}" min="0.5" max="24" step="0.5" value="${state.hours}" 
               ${!state.enabled ? 'disabled' : ''} oninput="onSimHoursChange(${app.id}, this.value)">
      </div>
    `;
    container.appendChild(row);
  });

  updateSimResults(baseKwh, baseCost);
}

function onSimToggle(id, enabled) {
  simSettings[id].enabled = enabled;
  document.getElementById(`sim-range-${id}`).disabled = !enabled;
  document.getElementById(`sim-val-${id}`).textContent = enabled ? `${simSettings[id].hours} hrs/day` : 'OFF';
  recalcSimMetrics();
}

function onSimHoursChange(id, hours) {
  simSettings[id].hours = parseFloat(hours);
  document.getElementById(`sim-val-${id}`).textContent = `${hours} hrs/day`;
  recalcSimMetrics();
}

function recalcSimMetrics() {
  let baseKwh = 0.0;
  appliances.forEach(a => baseKwh += calculateApplianceKwh(a));
  const baseBill = computeProgressiveBill(baseKwh);

  updateSimResults(baseKwh, baseBill.grandTotal);
}

function updateSimResults(baseKwh, baseBill) {
  let simKwh = 0.0;
  appliances.forEach(app => {
    const state = simSettings[app.id];
    if (state && state.enabled) {
      simKwh += (app.wattage * app.qty * state.hours * app.days) / 1000.0;
    }
  });

  const simBill = computeProgressiveBill(simKwh);
  const deltaKwh = baseKwh - simKwh;
  const deltaCash = baseBill - simBill.grandTotal;

  document.getElementById('sim-base-bill').textContent = fmtCurrency(baseBill);
  document.getElementById('sim-base-kwh').textContent = `${baseKwh.toFixed(1)} kWh/mo`;
  document.getElementById('sim-new-bill').textContent = fmtCurrency(simBill.grandTotal);
  document.getElementById('sim-new-kwh').textContent = `${simKwh.toFixed(1)} kWh/mo`;

  document.getElementById('sim-delta-kwh').textContent = `${Math.max(0, deltaKwh).toFixed(2)} kWh / month`;
  document.getElementById('sim-delta-cash').textContent = `${fmtCurrency(Math.max(0, deltaCash))} / month`;
  document.getElementById('sim-delta-annual').textContent = `${fmtCurrency(Math.max(0, deltaCash) * 12.0)} / year`;
}

// ----------------------------------------------------------------------------
// Tab 5: Smart Suggestions
// ----------------------------------------------------------------------------
function renderSuggestions(totalKwh) {
  const container = document.getElementById('suggestions-cards-grid');
  if (!container) return;
  container.innerHTML = '';

  const suggestions = [];

  // Rule 1: Thermostat
  const ac = appliances.find(a => a.name.toLowerCase().includes('ac') || a.category === 'Cooling');
  if (ac) {
    const acKwh = calculateApplianceKwh(ac);
    const potKwh = acKwh * 0.18;
    suggestions.push({
      title: "🌡️ Thermostat Optimization",
      body: `Raising your Air Conditioner temperature setpoint by 3°C (e.g., from 21°C to 24°C) saves ~18% of compressor energy without reducing comfort.`,
      savings: `Save ~${potKwh.toFixed(1)} kWh/mo (≈ ${fmtCurrency(potKwh * 6.50)} / month)`
    });
  }

  // Rule 2: 5-Star Upgrade
  const fridge = appliances.find(a => a.name.toLowerCase().includes('refrigerator'));
  if (fridge) {
    suggestions.push({
      title: "⭐ 5-Star Inverter Upgrade",
      body: `Upgrading to a BEE 5-star inverter refrigerator reduces energy consumption by ~40% over older non-inverter models. Estimated payback period: 18-24 months.`,
      savings: `Save ~${(calculateApplianceKwh(fridge) * 0.4).toFixed(1)} kWh/mo`
    });
  }

  // Rule 3: Standby / Vampire Load
  const tv = appliances.find(a => a.category === 'Entertainment');
  if (tv) {
    suggestions.push({
      title: "🔌 Standby / Vampire Load Elimination",
      body: `Entertainment systems and electronics consume 5-10W in standby mode continuously. Using smart power strips with master-slave cutoffs eliminates phantom draws.`,
      savings: `Save ≈ ${fmtCurrency(120.0)} / month`
    });
  }

  // Rule 4: LED Lighting
  suggestions.push({
    title: "💡 High-Efficiency LED Retrofits",
    body: `Ensure all household fixtures use modern 9W LED lamps rather than legacy CFLs or halogen spotlights, slashing lighting power by up to 80%.`,
    savings: `Save ~15-30 kWh / month`
  });

  suggestions.forEach(s => {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.innerHTML = `
      <div>
        <div class="sug-header">
          <h3 class="sug-title">${s.title}</h3>
        </div>
        <p class="sug-body">${s.body}</p>
      </div>
      <div class="sug-savings">${s.savings}</div>
    `;
    container.appendChild(card);
  });
}

// ----------------------------------------------------------------------------
// Tab 6: Tariff Editor
// ----------------------------------------------------------------------------
function renderTariffEditor() {
  const tbody = document.getElementById('tariff-edit-tbody');
  tbody.innerHTML = '';

  tariff.slabs.forEach((slab, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(slab.description)}" onchange="updateSlabProp(${idx}, 'description', this.value)" style="width:140px;"></td>
      <td><input type="number" value="${slab.minUnits}" onchange="updateSlabProp(${idx}, 'minUnits', parseFloat(this.value))" style="width:80px;"></td>
      <td><input type="text" value="${slab.maxUnits === null ? '' : slab.maxUnits}" placeholder="∞ (Unlimited)" onchange="updateSlabProp(${idx}, 'maxUnits', this.value === '' ? null : parseFloat(this.value))" style="width:100px;"></td>
      <td><input type="number" step="0.1" value="${slab.ratePerUnit}" onchange="updateSlabProp(${idx}, 'ratePerUnit', parseFloat(this.value))" style="width:80px;"></td>
      <td><button class="btn btn-danger btn-sm" onclick="removeSlab(${idx})">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('tf-name').value = tariff.tariffName;
  document.getElementById('tf-currency').value = tariff.currencySymbol;
  document.getElementById('tf-fixed').value = tariff.fixedCharge;
  document.getElementById('tf-fuel').value = tariff.fuelSurchargePercent;
  document.getElementById('tf-tax').value = tariff.taxPercent;
}

function updateSlabProp(idx, prop, val) {
  tariff.slabs[idx][prop] = val;
  recalculateAndRender();
}

function removeSlab(idx) {
  if (tariff.slabs.length <= 1) {
    alert("At least one slab tier is required.");
    return;
  }
  tariff.slabs.splice(idx, 1);
  recalculateAndRender();
}

// ============================================================================
// EVENT HANDLERS & MODAL ACTIONS
// ============================================================================

// Form submission (Add / Edit)
document.getElementById('appliance-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const idVal = document.getElementById('app-id').value;
  const name = document.getElementById('app-name').value.trim();
  const category = document.getElementById('app-category').value;
  const wattage = parseFloat(document.getElementById('app-wattage').value);
  const qty = parseInt(document.getElementById('app-qty').value);
  const hours = parseFloat(document.getElementById('app-hours').value);
  const days = parseInt(document.getElementById('app-days').value);

  if (idVal) {
    // Edit existing
    const idx = appliances.findIndex(a => a.id === parseInt(idVal));
    if (idx !== -1) {
      appliances[idx] = { id: parseInt(idVal), name, category, wattage, qty, hours, days };
    }
  } else {
    // Add new
    const newId = appliances.length > 0 ? Math.max(...appliances.map(a => a.id)) + 1 : 1;
    appliances.push({ id: newId, name, category, wattage, qty, hours, days });
  }

  resetForm();
  recalculateAndRender();
});

function editAppliance(id) {
  const app = appliances.find(a => a.id === id);
  if (!app) return;

  document.getElementById('app-id').value = app.id;
  document.getElementById('app-name').value = app.name;
  document.getElementById('app-category').value = app.category;
  document.getElementById('app-wattage').value = app.wattage;
  document.getElementById('app-qty').value = app.qty;
  document.getElementById('app-hours').value = app.hours;
  document.getElementById('app-days').value = app.days;

  document.getElementById('form-title').textContent = "Edit Appliance";
  document.getElementById('btn-save-app').textContent = "💾 Update Appliance";
  document.getElementById('btn-cancel-edit').style.display = 'inline-flex';
  updateLiveCalcPreview();

  // Switch to appliances tab
  switchTab('tab-appliances');
}

function deleteAppliance(id) {
  if (confirm("Are you sure you want to delete this appliance?")) {
    appliances = appliances.filter(a => a.id !== id);
    delete simSettings[id];
    recalculateAndRender();
  }
}

function resetForm() {
  document.getElementById('app-id').value = '';
  document.getElementById('app-name').value = '';
  document.getElementById('app-wattage').value = '';
  document.getElementById('app-qty').value = 1;
  document.getElementById('app-hours').value = 8;
  document.getElementById('app-days').value = 30;

  document.getElementById('form-title').textContent = "Add New Appliance";
  document.getElementById('btn-save-app').textContent = "➕ Add Appliance";
  document.getElementById('btn-cancel-edit').style.display = 'none';
  updateLiveCalcPreview();
}

document.getElementById('btn-cancel-edit').addEventListener('click', resetForm);

// Reset Defaults
document.getElementById('btn-reset-defaults').addEventListener('click', () => {
  if (confirm("Reset active inventory to the 10 standard pre-configured household appliances?")) {
    appliances = [...DEFAULT_APPLIANCES];
    simSettings = {};
    recalculateAndRender();
  }
});

// Update Budget
document.getElementById('btn-update-budget').addEventListener('click', () => {
  const val = parseFloat(document.getElementById('budget-input').value);
  if (val > 0) {
    monthlyBudget = val;
    recalculateAndRender();
    alert(`Monthly budget updated to ${fmtCurrency(val)}`);
  }
});

// Reset Simulator
document.getElementById('btn-reset-sim').addEventListener('click', () => {
  simSettings = {};
  appliances.forEach(app => {
    simSettings[app.id] = { enabled: true, hours: app.hours };
  });
  recalculateAndRender();
});

// Apply Simulator Settings to Master Inventory
document.getElementById('btn-apply-sim').addEventListener('click', () => {
  if (confirm("Apply simulated run-hours and deactivated states directly to your active appliances database?")) {
    appliances = appliances.filter(app => {
      const state = simSettings[app.id];
      if (state && !state.enabled) return false; // remove deactivated
      if (state) app.hours = state.hours;
      return true;
    });
    recalculateAndRender();
    alert("Simulated settings successfully applied to your active database!");
  }
});

// Tariff Form Save
document.getElementById('tariff-rates-form').addEventListener('submit', (e) => {
  e.preventDefault();
  tariff.tariffName = document.getElementById('tf-name').value;
  tariff.currencySymbol = document.getElementById('tf-currency').value;
  tariff.fixedCharge = parseFloat(document.getElementById('tf-fixed').value);
  tariff.fuelSurchargePercent = parseFloat(document.getElementById('tf-fuel').value);
  tariff.taxPercent = parseFloat(document.getElementById('tf-tax').value);

  recalculateAndRender();
  alert("Tariff scheme configuration saved!");
});

// Reset Tariff
document.getElementById('btn-reset-tariff').addEventListener('click', () => {
  if (confirm("Restore default progressive tariff rates?")) {
    tariff = JSON.parse(JSON.stringify(DEFAULT_TARIFF));
    recalculateAndRender();
  }
});

// Add Slab Tier
document.getElementById('btn-add-slab').addEventListener('click', () => {
  const last = tariff.slabs[tariff.slabs.length - 1];
  const newMin = last && last.maxUnits !== null ? last.maxUnits : 400;
  tariff.slabs.push({
    minUnits: newMin,
    maxUnits: newMin + 200,
    ratePerUnit: 9.0,
    description: `Tier ${tariff.slabs.length + 1}`
  });
  recalculateAndRender();
});

// CSV Export
document.getElementById('btn-export-csv').addEventListener('click', () => {
  let totalKwh = 0.0;
  appliances.forEach(a => totalKwh += calculateApplianceKwh(a));

  let csv = "Appliance Name,Category,Wattage (W),Quantity,Hours/Day,Days/Month,Monthly kWh,Bill Share (%)\n";
  appliances.forEach(a => {
    const kwh = calculateApplianceKwh(a);
    const share = totalKwh > 0 ? ((kwh / totalKwh) * 100.0).toFixed(2) : "0.00";
    csv += `"${a.name}","${a.category}",${a.wattage},${a.qty},${a.hours},${a.days},${kwh.toFixed(2)},${share}%\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Electricity_Audit_Report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Live Dynamic Audit Report (View & Print to PDF)
const btnPrintLive = document.getElementById('btn-print-live-report');
if (btnPrintLive) {
  btnPrintLive.addEventListener('click', () => {
    let totalKwh = 0.0;
    appliances.forEach(a => totalKwh += calculateApplianceKwh(a));
    const bill = computeProgressiveBill(totalKwh);

    let savedUser = { name: "Vishnuram & Vidyadharan", role: "ADMIN" };
    try {
      const u = JSON.parse(localStorage.getItem('powercalc_user'));
      if (u && u.name) savedUser = u;
    } catch(e) {}

    // Find peak appliance
    let peakApp = null;
    let peakKwh = 0;
    appliances.forEach(a => {
      const k = calculateApplianceKwh(a);
      if (k > peakKwh) { peakKwh = k; peakApp = a; }
    });

    const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

    // Category breakdown
    const catMap = {};
    appliances.forEach(a => {
      const k = calculateApplianceKwh(a);
      catMap[a.category] = (catMap[a.category] || 0) + k;
    });

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Electricity Audit Report - ${savedUser.name}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #2b2118; background: #fff; margin: 0; padding: 10px; font-size: 11px; line-height: 1.4; }
    .header-bar { border-bottom: 2px solid #b87333; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 18px; font-weight: 800; color: #b87333; margin: 0 0 4px; }
    .subtitle { font-size: 10px; color: #7a6b5e; margin: 0; }
    .meta-box { background: #f7f3ed; border: 1px solid #e5dcd0; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; font-size: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
    .metric-card { border: 1px solid #e5dcd0; background: #faf7f2; border-radius: 6px; padding: 8px 10px; text-align: center; }
    .metric-lbl { font-size: 8.5px; font-weight: 700; color: #7a6b5e; letter-spacing: 0.5px; }
    .metric-val { font-size: 16px; font-weight: 800; color: #2b2118; margin: 4px 0 2px; }
    .metric-val.amber { color: #b87333; }
    .section-title { font-size: 12px; font-weight: 800; color: #b87333; border-bottom: 1px solid #e5dcd0; padding-bottom: 3px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
    th { background: #f3ece1; color: #2b2118; font-weight: 700; text-align: left; padding: 5px 6px; border: 1px solid #e5dcd0; }
    td { padding: 4.5px 6px; border: 1px solid #e5dcd0; }
    tr:nth-child(even) td { background: #faf8f5; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .highlight-row { background: #f0e6d8 !important; font-weight: 700; }
    .recs-box { background: #f7f3ed; border: 1px solid #e5dcd0; border-left: 4px solid #b87333; padding: 8px 12px; border-radius: 4px; margin-bottom: 14px; }
    .recs-box ul { margin: 4px 0 0 16px; padding: 0; }
    .recs-box li { margin-bottom: 4px; font-size: 9.5px; }
    .footer-note { text-align: center; font-size: 8.5px; color: #7a6b5e; border-top: 1px solid #e5dcd0; padding-top: 8px; margin-top: 16px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background: #fef3c7; border: 1px solid #f59e0b; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
    <span>⚡ <strong>Print to PDF / Save as PDF:</strong> Click the button on the right to save this report as an official PDF file.</span>
    <button onclick="window.print()" style="background: #b87333; color: #fff; border: none; padding: 6px 14px; font-weight: 700; border-radius: 4px; cursor: pointer;">🖨️ Print / Save as PDF</button>
  </div>

  <div class="header-bar">
    <div>
      <h1 class="title">⚡ Electricity Bill Estimator & Energy Audit Report</h1>
      <p class="subtitle">Comprehensive Energy Consumption Analysis • Progressive Slab Tariff Engine • All Features Included</p>
    </div>
    <div style="text-align: right;">
      <span style="font-size: 9px; font-weight: 700; color: #4e805b; background: #eaf5ee; border: 1px solid rgba(78,128,91,0.3); padding: 3px 8px; border-radius: 12px;">✓ VERIFIED AUDIT</span>
    </div>
  </div>

  <div class="meta-box">
    <div><strong>Consumer Name:</strong> ${escapeHtml(savedUser.name)}</div>
    <div><strong>Account ID / Role:</strong> EB-2026-9481 (${escapeHtml(savedUser.role)})</div>
    <div><strong>Audit Timestamp:</strong> ${nowStr}</div>
    <div><strong>Tariff Model:</strong> ${escapeHtml(tariff.tariffName)}</div>
    <div><strong>Currency:</strong> ${tariff.currencySymbol} (INR)</div>
    <div><strong>Status:</strong> Active Calculation</div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-lbl">TOTAL LOAD</div>
      <div class="metric-val">${totalKwh.toFixed(2)} <span style="font-size: 10px;">kWh</span></div>
      <span style="font-size: 8.5px; color: #7a6b5e;">${appliances.length} active devices</span>
    </div>
    <div class="metric-card">
      <div class="metric-lbl">ESTIMATED BILL</div>
      <div class="metric-val amber">${fmtCurrency(bill.grandTotal)}</div>
      <span style="font-size: 8.5px; color: #7a6b5e;">Slabs + Fixed + Surcharges</span>
    </div>
    <div class="metric-card">
      <div class="metric-lbl">DAILY AVERAGE</div>
      <div class="metric-val">${(totalKwh / 30.0).toFixed(2)} <span style="font-size: 10px;">kWh/d</span></div>
      <span style="font-size: 8.5px; color: #7a6b5e;">Household baseline</span>
    </div>
    <div class="metric-card">
      <div class="metric-lbl">PEAK LOAD DEVICE</div>
      <div class="metric-val" style="font-size: 12px; color: #c24c34;">${peakApp ? escapeHtml(peakApp.name) : '-'}</div>
      <span style="font-size: 8.5px; color: #7a6b5e;">${peakKwh.toFixed(1)} kWh (${totalKwh > 0 ? ((peakKwh/totalKwh)*100).toFixed(1) : 0}%)</span>
    </div>
  </div>

  <div class="section-title">1. Progressive Slab Billing Breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Tier Description</th>
        <th>Unit Range</th>
        <th class="text-right">Units Billed</th>
        <th class="text-right">Rate</th>
        <th class="text-right">Slab Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${bill.slabBreakdown.map(sb => `
        <tr>
          <td><strong>${escapeHtml(sb.slab.description || 'Tier')}</strong></td>
          <td>${sb.slab.minUnits} - ${sb.slab.maxUnits === null ? 'Above' : sb.slab.maxUnits} kWh</td>
          <td class="text-right">${sb.unitsBilled.toFixed(2)} kWh</td>
          <td class="text-right">${tariff.currencySymbol}${sb.slab.ratePerUnit.toFixed(2)}</td>
          <td class="text-right font-bold">${fmtCurrency(sb.cost)}</td>
        </tr>
      `).join('')}
      <tr class="highlight-row">
        <td colspan="2">Energy Charges Subtotal</td>
        <td class="text-right">${totalKwh.toFixed(2)} kWh</td>
        <td class="text-right">-</td>
        <td class="text-right font-bold">${fmtCurrency(bill.energyCharges)}</td>
      </tr>
      <tr>
        <td colspan="4">Fixed Infrastructure & Meter Charge</td>
        <td class="text-right font-bold">${fmtCurrency(bill.fixedCharge)}</td>
      </tr>
      <tr>
        <td colspan="4">Fuel Adjustment Surcharge (FAC @ ${tariff.fuelSurchargePercent.toFixed(1)}%)</td>
        <td class="text-right font-bold">${fmtCurrency(bill.fuelSurcharge)}</td>
      </tr>
      <tr>
        <td colspan="4">State Electricity Duty / VAT (@ ${tariff.taxPercent.toFixed(1)}%)</td>
        <td class="text-right font-bold">${fmtCurrency(bill.tax)}</td>
      </tr>
      <tr class="highlight-row" style="font-size: 11.5px; background: #e8ded0 !important;">
        <td colspan="4"><strong>NET PAYABLE ESTIMATED BILL</strong></td>
        <td class="text-right font-bold" style="color: #b87333;">${fmtCurrency(bill.grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">2. Complete Household Appliance Inventory (All Features)</div>
  <table>
    <thead>
      <tr>
        <th>Appliance Name</th>
        <th>Category</th>
        <th class="text-right">Power (W)</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Hrs/Day</th>
        <th class="text-right">Days</th>
        <th class="text-right">Monthly kWh</th>
        <th class="text-right">Share (%)</th>
        <th class="text-right">Est. Cost</th>
      </tr>
    </thead>
    <tbody>
      ${appliances.map(a => {
        const k = calculateApplianceKwh(a);
        const s = totalKwh > 0 ? (k / totalKwh) * 100.0 : 0;
        const c = totalKwh > 0 ? (k / totalKwh) * bill.grandTotal : 0;
        return `
          <tr>
            <td><strong>${escapeHtml(a.name)}</strong></td>
            <td>${escapeHtml(a.category)}</td>
            <td class="text-right">${a.wattage}</td>
            <td class="text-right">${a.qty}</td>
            <td class="text-right">${a.hours}</td>
            <td class="text-right">${a.days}</td>
            <td class="text-right font-bold">${k.toFixed(2)}</td>
            <td class="text-right">${s.toFixed(1)}%</td>
            <td class="text-right font-bold">${fmtCurrency(c)}</td>
          </tr>
        `;
      }).join('')}
      <tr class="highlight-row">
        <td><strong>TOTALS</strong></td>
        <td><strong>${appliances.length} Devices</strong></td>
        <td class="text-right">-</td>
        <td class="text-right">${appliances.reduce((acc, x) => acc + x.qty, 0)}</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right"><strong>${totalKwh.toFixed(2)} kWh</strong></td>
        <td class="text-right"><strong>100.0%</strong></td>
        <td class="text-right font-bold" style="color: #b87333;">${fmtCurrency(bill.grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">3. Smart Energy Conservation Recommendations</div>
  <div class="recs-box">
    <strong>Actionable Energy Reduction Interventions:</strong>
    <ul>
      <li><strong>Air Conditioning Setpoint:</strong> Maintain AC at 24°C instead of 18°C. Reduces compressor duty cycle by 24%, saving ~₹650/month and preventing Tier 4 heavy slab escalation.</li>
      <li><strong>Geyser Auto-Cutoff:</strong> Reduce water heater duration to 45 minutes daily; install a smart timer to save ~₹108/month.</li>
      <li><strong>Off-Peak Operation:</strong> Shift high-draw loads (Water Pump, Washing Machine) to off-peak morning periods to balance household demand.</li>
      <li><strong>Standby Load Elimination:</strong> Unplug workstations and entertainment appliances when idle to stop vampire energy draw.</li>
    </ul>
  </div>

  <div class="footer-note">
    Electricity Bill Estimator & Power Consumption Analyzer • Easwari Engineering College • Department of Artificial Intelligence & Data Science<br/>
    Certified Digital Energy Audit Document • Generated Programmatically
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => window.print(), 350);
    });
  <\/script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();
    } else {
      alert("Please allow popups to view and print the live audit report PDF.");
    }
  });
}

// Monthly Snapshot
document.getElementById('btn-snapshot-month').addEventListener('click', () => {
  let totalKwh = 0.0;
  appliances.forEach(a => totalKwh += calculateApplianceKwh(a));
  const bill = computeProgressiveBill(totalKwh);

  const monthStr = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
  HISTORICAL_TREND.push({
    month: monthStr,
    kwh: Math.round(totalKwh),
    cost: Math.round(bill.grandTotal)
  });
  if (HISTORICAL_TREND.length > 6) HISTORICAL_TREND.shift();

  drawLineChart();
  alert(`Monthly snapshot for ${monthStr} (${totalKwh.toFixed(1)} kWh / ${fmtCurrency(bill.grandTotal)}) saved to historical database!`);
});

// Form live preview
function updateLiveCalcPreview() {
  const w = parseFloat(document.getElementById('app-wattage').value) || 0;
  const q = parseInt(document.getElementById('app-qty').value) || 0;
  const h = parseFloat(document.getElementById('app-hours').value) || 0;
  const d = parseInt(document.getElementById('app-days').value) || 0;
  const kwh = (w * q * h * d) / 1000.0;
  document.getElementById('form-calc-preview').textContent = `${kwh.toFixed(2)} kWh / month`;
}

['app-wattage', 'app-qty', 'app-hours', 'app-days'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateLiveCalcPreview);
});

// Tab Navigation Switching
function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const btn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  const pane = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (pane) pane.classList.add('active');

  if (tabId === 'tab-analytics') {
    let totalKwh = 0.0;
    appliances.forEach(a => totalKwh += calculateApplianceKwh(a));
    setTimeout(() => renderCharts(totalKwh), 50);
  }
}

document.querySelectorAll('.nav-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    switchTab(tabBtn.getAttribute('data-tab'));
  });
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  // Restore user session if logged in via login.html
  try {
    const savedUser = JSON.parse(localStorage.getItem('powercalc_user'));
    if (savedUser && savedUser.name) {
      const roleEl = document.getElementById('hdr-user-role');
      const nameEl = document.getElementById('hdr-user-name');
      if (roleEl) roleEl.textContent = savedUser.role || 'USER';
      if (nameEl) nameEl.textContent = `👤 ${savedUser.name}`;
    }
  } catch (e) {
    console.warn('Could not read user session', e);
  }

  // Clicking brand logo returns to main view (tab-appliances) smoothly
  const brandLogo = document.getElementById('brand-logo');
  if (brandLogo) {
    brandLogo.addEventListener('click', (e) => {
      // If user is already on index.html, return directly to main appliances calculator tab
      e.preventDefault();
      switchTab('tab-appliances');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  recalculateAndRender();
});
