/* ==========================================
   FITTRACK — APP.JS
   Complete fitness tracking logic
   ========================================== */

'use strict';

// ==========================================
// STATE & STORAGE
// ==========================================
const STORAGE_KEY = 'fittrack_data';
let state = {
  profil: {},
  mesures: [],       // [{date, poids, taille, notes}]
  aliments: {},      // {date: {matin:[], midi:[], soir:[], collation:[]}}
  activites: [],     // [{date, type, duration, intensity, cals, details}]
};

// Expose globalement pour firebase-sync.js
Object.defineProperty(window, 'state', {
  get: () => state,
  set: (v) => { state = v; },
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch(e) { console.warn('Load state error:', e); }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Déclenche la sync Firebase si connecté (débouncé 2s)
  if (window.firebaseSync?.save) window.firebaseSync.save(state);
}

// Recharge toute l'UI (appelé après chargement depuis Firestore)
window.refreshAllUI = function() {
  updateKPIs();
  updateIMC();
  renderMesuresHistory();
  renderMeals();
  renderActivityHistory();
  loadProfil();
  updateAutoCalcs();
  buildWeightChart();
  buildWaistChart();
  buildCalorieRing();
};

// Expose toast pour firebase-sync.js
// toast() est déjà global — accessible depuis firebase-sync.js sans wrapper

// ==========================================
// FOOD DATABASE (kcal/100g + macros)
// ==========================================
const FOOD_DB = [
  // Fruits
  { name: 'Pomme',             cal: 52,  prot: 0.3, carbs: 14, fat: 0.2, emoji: '🍎' },
  { name: 'Banane',            cal: 89,  prot: 1.1, carbs: 23, fat: 0.3, emoji: '🍌' },
  { name: 'Orange',            cal: 47,  prot: 0.9, carbs: 12, fat: 0.1, emoji: '🍊' },
  { name: 'Fraises',           cal: 32,  prot: 0.7, carbs: 7.7, fat: 0.3, emoji: '🍓' },
  { name: 'Raisin',            cal: 69,  prot: 0.7, carbs: 18, fat: 0.2, emoji: '🍇' },
  { name: 'Myrtilles',         cal: 57,  prot: 0.7, carbs: 14, fat: 0.3, emoji: '🫐' },
  // Légumes
  { name: 'Brocoli',           cal: 34,  prot: 2.8, carbs: 7,  fat: 0.4, emoji: '🥦' },
  { name: 'Carotte',           cal: 41,  prot: 0.9, carbs: 10, fat: 0.2, emoji: '🥕' },
  { name: 'Tomate',            cal: 18,  prot: 0.9, carbs: 3.9, fat: 0.2, emoji: '🍅' },
  { name: 'Épinards',          cal: 23,  prot: 2.9, carbs: 3.6, fat: 0.4, emoji: '🥬' },
  { name: 'Courgette',         cal: 17,  prot: 1.2, carbs: 3.1, fat: 0.3, emoji: '🥒' },
  { name: 'Avocat',            cal: 160, prot: 2,   carbs: 9,  fat: 15,  emoji: '🥑' },
  // Protéines
  { name: 'Blanc de poulet',   cal: 165, prot: 31,  carbs: 0,  fat: 3.6, emoji: '🍗' },
  { name: 'Steak bœuf (maigre)', cal: 200, prot: 26, carbs: 0, fat: 10,  emoji: '🥩' },
  { name: 'Saumon',            cal: 208, prot: 20,  carbs: 0,  fat: 13,  emoji: '🐟' },
  { name: 'Thon en boîte',     cal: 132, prot: 28,  carbs: 0,  fat: 1.7, emoji: '🐟' },
  { name: 'Œufs entiers',      cal: 155, prot: 13,  carbs: 1.1, fat: 11, emoji: '🥚' },
  { name: 'Crevettes',         cal: 99,  prot: 24,  carbs: 0,  fat: 0.3, emoji: '🦐' },
  { name: 'Jambon blanc',      cal: 107, prot: 19,  carbs: 0.6, fat: 3,  emoji: '🍖' },
  // Laitages
  { name: 'Yaourt nature 0%',  cal: 54,  prot: 5.7, carbs: 7.7, fat: 0.1, emoji: '🥛' },
  { name: 'Yaourt grec',       cal: 97,  prot: 9,   carbs: 3.6, fat: 5,  emoji: '🥛' },
  { name: 'Fromage blanc 0%',  cal: 47,  prot: 8,   carbs: 4,  fat: 0.2, emoji: '🫙' },
  { name: 'Lait demi-écrémé',  cal: 47,  prot: 3.4, carbs: 4.7, fat: 1.6, emoji: '🥛' },
  { name: 'Emmental',          cal: 378, prot: 27,  carbs: 0,  fat: 30,  emoji: '🧀' },
  // Féculents
  { name: 'Riz cuit',          cal: 130, prot: 2.7, carbs: 28, fat: 0.3, emoji: '🍚' },
  { name: 'Pâtes cuites',      cal: 158, prot: 5.8, carbs: 31, fat: 0.9, emoji: '🍝' },
  { name: 'Pain complet',      cal: 247, prot: 9,   carbs: 48, fat: 3.4, emoji: '🍞' },
  { name: 'Pain blanc',        cal: 267, prot: 9,   carbs: 55, fat: 3,   emoji: '🥖' },
  { name: 'Quinoa cuit',       cal: 120, prot: 4.4, carbs: 22, fat: 1.9, emoji: '🌾' },
  { name: 'Pomme de terre',    cal: 77,  prot: 2,   carbs: 17, fat: 0.1, emoji: '🥔' },
  { name: 'Patate douce',      cal: 86,  prot: 1.6, carbs: 20, fat: 0.1, emoji: '🍠' },
  { name: 'Flocons d\'avoine', cal: 370, prot: 13,  carbs: 66, fat: 7,   emoji: '🌾' },
  // Légumineuses
  { name: 'Lentilles cuites',  cal: 116, prot: 9,   carbs: 20, fat: 0.4, emoji: '🫘' },
  { name: 'Pois chiches',      cal: 164, prot: 9,   carbs: 27, fat: 2.6, emoji: '🫘' },
  // Huiles & matières grasses
  { name: 'Huile d\'olive',    cal: 884, prot: 0,   carbs: 0,  fat: 100, emoji: '🫒' },
  { name: 'Beurre',            cal: 717, prot: 0.9, carbs: 0.1, fat: 81, emoji: '🧈' },
  // Boissons
  { name: 'Jus d\'orange',     cal: 45,  prot: 0.7, carbs: 10, fat: 0.2, emoji: '🥤' },
  { name: 'Lait végétal avoine', cal: 46, prot: 1.2, carbs: 9, fat: 1.2, emoji: '🥤' },
  // Sport / suppléments
  { name: 'Whey protéine',     cal: 379, prot: 80,  carbs: 5,  fat: 4,   emoji: '💊' },
  { name: 'Barre de céréales', cal: 380, prot: 6,   carbs: 70, fat: 8,   emoji: '🍫' },
  { name: 'Amandes',           cal: 579, prot: 21,  carbs: 22, fat: 50,  emoji: '🥜' },
  { name: 'Noix',              cal: 654, prot: 15,  carbs: 14, fat: 65,  emoji: '🥜' },
  // Plats courants
  { name: 'Pizza margherita',  cal: 266, prot: 11,  carbs: 33, fat: 10,  emoji: '🍕' },
  { name: 'Burger bœuf',       cal: 295, prot: 17,  carbs: 24, fat: 14,  emoji: '🍔' },
  { name: 'Salade César',      cal: 120, prot: 6,   carbs: 5,  fat: 9,   emoji: '🥗' },
  { name: 'Soupe de légumes',  cal: 45,  prot: 2,   carbs: 8,  fat: 0.5, emoji: '🍲' },
  { name: 'Chocolat noir 70%', cal: 598, prot: 8,   carbs: 46, fat: 43,  emoji: '🍫' },
  { name: 'Miel',              cal: 304, prot: 0.3, carbs: 82, fat: 0,   emoji: '🍯' },
];

// ==========================================
// MET VALUES (Metabolic Equivalent of Task)
// ==========================================
const MET = {
  musculation: { faible: 3.5, modere: 5.0, eleve: 6.5 },
  footing:     { faible: 7.0, modere: 9.8, eleve: 12.0 },
  trail:       { faible: 9.0, modere: 11.5, eleve: 14.0 },
  basketball:  { faible: 6.0, modere: 8.0, eleve: 10.5 },
  velo:        { faible: 5.5, modere: 8.0, eleve: 11.0 },
  natation:    { faible: 6.0, modere: 8.3, eleve: 11.0 },
  marche:      { faible: 3.0, modere: 4.5, eleve: 6.0 },
};
const ACTIVITY_LABELS = {
  musculation: '💪 Musculation',
  footing:     '🏃 Footing',
  trail:       '⛰️ Trail',
  basketball:  '🏀 Basketball',
  velo:        '🚴 Vélo',
  natation:    '🏊 Natation',
  marche:      '🚶 Marche',
};

// ==========================================
// CHART INSTANCES
// ==========================================
let chartWeight = null;
let chartWaist  = null;
let chartCalRing = null;
let currentPeriod = 7;

// ==========================================
// CHARTS
// ==========================================
function buildCharts() {
  buildWeightChart();
  buildWaistChart();
  buildCalorieRing();
}

function getWeightData(days) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86400000);
  return state.mesures
    .filter(m => new Date(m.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function buildWeightChart() {
  const ctx = document.getElementById('chart-weight');
  if (!ctx) return;
  const data = getWeightData(currentPeriod);
  const labels = data.map(m => formatDateShort(m.date));
  const values = data.map(m => m.poids);

  if (chartWeight) chartWeight.destroy();
  chartWeight = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Poids (kg)',
        data: values,
        borderColor: '#3dffa0',
        backgroundColor: 'rgba(61,255,160,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#3dffa0',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
      }]
    },
    options: chartOptions('Poids (kg)', 'kg')
  });
}

function buildWaistChart() {
  const ctx = document.getElementById('chart-waist');
  if (!ctx) return;
  const data = getWeightData(90).filter(m => m.taille);
  const labels = data.map(m => formatDateShort(m.date));
  const values = data.map(m => m.taille);

  if (chartWaist) chartWaist.destroy();
  chartWaist = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tour de taille (cm)',
        data: values,
        borderColor: '#4fc3f7',
        backgroundColor: 'rgba(79,195,247,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#4fc3f7',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: chartOptions('Tour de taille (cm)', 'cm')
  });
}

function chartOptions(label, unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a2236',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#8a9dc0',
        bodyColor: '#f0f4ff',
        callbacks: {
          label: ctx => ` ${ctx.parsed.y} ${unit}`,
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#4a5c7a', font: { size: 11 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#4a5c7a', font: { size: 11 } }
      }
    }
  };
}

function buildCalorieRing() {
  const ctx = document.getElementById('chart-calories-ring');
  if (!ctx) return;
  const today = getToday();
  const calIn = getDayCalories(today);
  const calOut = getDayActivityCals(today);
  const bmr = calcBMR();
  const total = bmr + calOut;

  const net = calIn - calOut - bmr;
  document.getElementById('ring-cal-value').textContent = (net > 0 ? '+' : '') + Math.round(net);
  document.getElementById('leg-in').textContent = Math.round(calIn) + ' kcal';
  document.getElementById('leg-out').textContent = Math.round(calOut) + ' kcal';
  document.getElementById('leg-bmr').textContent = bmr ? Math.round(bmr) + ' kcal' : '—';

  if (chartCalRing) chartCalRing.destroy();
  chartCalRing = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ingérées', 'Brûlées sport', 'Métabolisme'],
      datasets: [{
        data: [calIn || 1, calOut || 0.01, bmr || 0.01],
        backgroundColor: ['rgba(61,255,160,0.8)', 'rgba(255,140,66,0.8)', 'rgba(79,195,247,0.8)'],
        borderColor: ['#3dffa0', '#ff8c42', '#4fc3f7'],
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2236',
          titleColor: '#8a9dc0',
          bodyColor: '#f0f4ff',
        }
      }
    }
  });
}

// ==========================================
// KPI UPDATE
// ==========================================
function updateKPIs() {
  const sorted = [...state.mesures].sort((a,b) => new Date(b.date) - new Date(a.date));
  if (sorted.length > 0) {
    const latest = sorted[0];
    document.getElementById('kpi-poids').textContent = latest.poids + ' kg';
    if (sorted.length > 1) {
      const prev = sorted[1];
      const diff = (latest.poids - prev.poids).toFixed(1);
      const el = document.getElementById('kpi-poids-delta');
      el.textContent = (diff > 0 ? '▲ +' : '▼ ') + diff + ' kg vs précédent';
      el.className = 'kpi-delta ' + (diff > 0 ? 'negative' : 'positive');
    }
    if (latest.taille) {
      document.getElementById('kpi-taille').textContent = latest.taille + ' cm';
      if (sorted.length > 1 && sorted[1].taille) {
        const diff = (latest.taille - sorted[1].taille).toFixed(1);
        const el = document.getElementById('kpi-taille-delta');
        el.textContent = (diff > 0 ? '▲ +' : '▼ ') + diff + ' cm vs précédent';
        el.className = 'kpi-delta ' + (diff > 0 ? 'negative' : 'positive');
      }
    }
  }

  const today = getToday();
  const calIn = getDayCalories(today);
  const calOut = getDayActivityCals(today);
  document.getElementById('kpi-cal-in').textContent = Math.round(calIn) + ' kcal';
  document.getElementById('kpi-cal-out').textContent = Math.round(calOut) + ' kcal';

  // Score journée
  const goal = getCalorieGoal();
  if (goal > 0) {
    const pct = Math.min(100, Math.round((calIn / goal) * 100));
    document.getElementById('score-value').textContent = pct + '%';
  }
}

function updateIMC() {
  const p = state.profil;
  const sorted = [...state.mesures].sort((a,b) => new Date(b.date) - new Date(a.date));
  if (!p.taille || sorted.length === 0) return;
  const poids = sorted[0].poids;
  const tailleMetre = p.taille / 100;
  const imc = poids / (tailleMetre * tailleMetre);
  const imcRound = imc.toFixed(1);

  let categorie = '', color = '';
  if (imc < 18.5)      { categorie = 'Insuffisance pondérale'; color = '#4fc3f7'; }
  else if (imc < 25)   { categorie = 'Poids normal ✅';        color = '#3dffa0'; }
  else if (imc < 30)   { categorie = 'Surpoids';               color = '#ffd54f'; }
  else if (imc < 35)   { categorie = 'Obésité modérée';        color = '#ff8c42'; }
  else                 { categorie = 'Obésité sévère';          color = '#ff5e7a'; }

  // IMC bar position: 15 → 40 mapped to 0→100%
  const pct = Math.min(100, Math.max(0, ((imc - 15) / 25) * 100));
  const el = document.getElementById('imc-content');
  el.innerHTML = `
    <div class="imc-value-row" style="margin-bottom:12px;">
      <div class="imc-val-item"><span class="imc-val-label">IMC</span><span class="imc-val-value" style="color:${color}">${imcRound}</span></div>
      <div class="imc-val-item"><span class="imc-val-label">Catégorie</span><span class="imc-val-value" style="color:${color};font-size:15px">${categorie}</span></div>
      <div class="imc-val-item"><span class="imc-val-label">Poids idéal</span><span class="imc-val-value">${(22 * tailleMetre * tailleMetre).toFixed(1)} kg</span></div>
    </div>
    <div class="imc-bar-wrapper"><div class="imc-marker" style="left:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:#4a5c7a;">
      <span>Maigreur &lt;18.5</span><span>Normal 18.5–25</span><span>Surpoids 25–30</span><span>Obésité &gt;30</span>
    </div>`;
}

// ==========================================
// ALIMENTATION
// ==========================================
let currentMealSlot = 'matin';

function getAlimDay(date) {
  if (!state.aliments[date]) {
    state.aliments[date] = { matin: [], midi: [], soir: [], collation: [] };
  }
  return state.aliments[date];
}

function getDayCalories(date) {
  const day = state.aliments[date];
  if (!day) return 0;
  let total = 0;
  ['matin','midi','soir','collation'].forEach(slot => {
    (day[slot] || []).forEach(item => total += item.cal);
  });
  return total;
}

function getDayMacros(date) {
  const day = state.aliments[date];
  const macros = { carbs: 0, prot: 0, fat: 0 };
  if (!day) return macros;
  ['matin','midi','soir','collation'].forEach(slot => {
    (day[slot] || []).forEach(item => {
      macros.carbs += item.carbs || 0;
      macros.prot  += item.prot  || 0;
      macros.fat   += item.fat   || 0;
    });
  });
  return macros;
}

function renderMeals() {
  const date = document.getElementById('alim-date').value;
  const day = getAlimDay(date);
  ['matin','midi','soir','collation'].forEach(slot => {
    const container = document.getElementById('items-' + slot);
    const calEl = document.getElementById('cal-' + slot);
    let slotCal = 0;
    container.innerHTML = '';
    (day[slot] || []).forEach((item, idx) => {
      slotCal += item.cal;
      const div = document.createElement('div');
      div.className = 'food-item';
      div.innerHTML = `
        <span class="food-item-name">${item.emoji || '🍽️'} ${item.name}</span>
        <span class="food-item-qty">${item.qty}g</span>
        <span class="food-item-cal">${Math.round(item.cal)} kcal</span>
        <button class="food-item-del" onclick="removeFood('${slot}', ${idx}, '${date}')">✕</button>`;
      container.appendChild(div);
    });
    calEl.textContent = Math.round(slotCal) + ' kcal';
  });

  const total = getDayCalories(date);
  document.getElementById('daily-total-cal').textContent = Math.round(total) + ' kcal';

  const goal = getCalorieGoal();
  const vsGoalEl = document.getElementById('daily-cal-vs-goal');
  if (goal > 0) {
    const diff = total - goal;
    vsGoalEl.textContent = ` / Objectif: ${goal} kcal (${diff >= 0 ? '+' : ''}${Math.round(diff)} kcal)`;
    vsGoalEl.style.color = Math.abs(diff) < 200 ? '#3dffa0' : diff > 0 ? '#ff8c42' : '#4fc3f7';
  }

  // Macros
  const m = getDayMacros(date);
  document.getElementById('macro-carbs').textContent = Math.round(m.carbs) + 'g';
  document.getElementById('macro-prot').textContent  = Math.round(m.prot)  + 'g';
  document.getElementById('macro-fat').textContent   = Math.round(m.fat)   + 'g';
  const maxMacro = Math.max(m.carbs, m.prot, m.fat, 1);
  document.getElementById('bar-carbs').style.width = (m.carbs / maxMacro * 100) + '%';
  document.getElementById('bar-prot').style.width  = (m.prot  / maxMacro * 100) + '%';
  document.getElementById('bar-fat').style.width   = (m.fat   / maxMacro * 100) + '%';
}

function removeFood(slot, idx, date) {
  state.aliments[date][slot].splice(idx, 1);
  saveState();
  renderMeals();
  updateKPIs();
  buildCalorieRing();
  toast('Aliment supprimé');
}

// --- MODAL ---
function openFoodModal(slot) {
  currentMealSlot = slot;
  const titles = { matin: '☀️ Petit-déjeuner', midi: '🌤️ Déjeuner', soir: '🌙 Dîner', collation: '🍎 Collation' };
  document.getElementById('modal-meal-title').textContent = 'Ajouter — ' + titles[slot];
  document.getElementById('food-search').value = '';
  document.getElementById('food-results').innerHTML = '';
  document.getElementById('manual-food-name').value = '';
  document.getElementById('manual-food-qty').value = '100';
  document.getElementById('manual-food-cal').value = '';
  document.getElementById('manual-food-prot').value = '';
  document.getElementById('manual-food-carbs').value = '';
  document.getElementById('manual-food-fat').value = '';
  document.getElementById('food-modal').classList.add('open');
  setTimeout(() => document.getElementById('food-search').focus(), 100);
}

function closeFoodModal(event) {
  if (!event || event.target === document.getElementById('food-modal')) {
    document.getElementById('food-modal').classList.remove('open');
  }
}

function searchFood() {
  const q = document.getElementById('food-search').value.toLowerCase().trim();
  const container = document.getElementById('food-results');
  container.innerHTML = '';
  if (q.length < 1) return;
  const results = FOOD_DB.filter(f => f.name.toLowerCase().includes(q)).slice(0, 12);
  if (results.length === 0) {
    container.innerHTML = '<p style="color:#4a5c7a;font-size:12px;text-align:center;padding:10px">Aucun aliment trouvé. Ajoutez-le manuellement.</p>';
    return;
  }
  results.forEach(food => {
    const div = document.createElement('div');
    div.className = 'food-result-item';
    div.innerHTML = `
      <div>
        <span class="food-result-name">${food.emoji || ''} ${food.name}</span>
        <span class="food-result-info">P:${food.prot}g • G:${food.carbs}g • L:${food.fat}g pour 100g</span>
      </div>
      <span class="food-result-cal">${food.cal} kcal/100g</span>`;
    div.addEventListener('click', () => selectFood(food));
    container.appendChild(div);
  });
}

function selectFood(food) {
  document.getElementById('manual-food-name').value = food.name;
  document.getElementById('manual-food-qty').value = '100';
  document.getElementById('manual-food-cal').value = food.cal;
  document.getElementById('manual-food-prot').value = food.prot;
  document.getElementById('manual-food-carbs').value = food.carbs;
  document.getElementById('manual-food-fat').value = food.fat;
  document.querySelector('.manual-food-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // Auto-update on qty change
  const qtyInput = document.getElementById('manual-food-qty');
  qtyInput.oninput = () => {
    const qty = parseFloat(qtyInput.value) || 100;
    const factor = qty / 100;
    document.getElementById('manual-food-cal').value   = +(food.cal   * factor).toFixed(1);
    document.getElementById('manual-food-prot').value  = +(food.prot  * factor).toFixed(1);
    document.getElementById('manual-food-carbs').value = +(food.carbs * factor).toFixed(1);
    document.getElementById('manual-food-fat').value   = +(food.fat   * factor).toFixed(1);
  };
}

function addManualFood() {
  const name   = document.getElementById('manual-food-name').value.trim();
  const qty    = parseFloat(document.getElementById('manual-food-qty').value) || 100;
  const cal    = parseFloat(document.getElementById('manual-food-cal').value) || 0;
  const prot   = parseFloat(document.getElementById('manual-food-prot').value) || 0;
  const carbs  = parseFloat(document.getElementById('manual-food-carbs').value) || 0;
  const fat    = parseFloat(document.getElementById('manual-food-fat').value) || 0;
  if (!name) { toast('Entrez un nom d\'aliment', 'error'); return; }

  const emoji = FOOD_DB.find(f => f.name === name)?.emoji || '🍽️';
  const date = document.getElementById('alim-date').value;
  const day = getAlimDay(date);
  day[currentMealSlot].push({ name, qty, cal, prot, carbs, fat, emoji });
  saveState();
  renderMeals();
  updateKPIs();
  buildCalorieRing();
  closeFoodModal();
  toast(`✅ ${name} ajouté (${Math.round(cal)} kcal)`);
}

// ==========================================
// ACTIVITES
// ==========================================
function getDayActivityCals(date) {
  return state.activites
    .filter(a => a.date === date)
    .reduce((sum, a) => sum + (a.cals || 0), 0);
}

function getWeekActivityCals() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  monday.setHours(0,0,0,0);
  return state.activites
    .filter(a => new Date(a.date) >= monday)
    .reduce((sum, a) => sum + (a.cals || 0), 0);
}

function updateActivityForm() {
  const type = document.getElementById('act-type').value;
  document.getElementById('trail-fields').style.display  = type === 'trail'  ? '' : 'none';
  document.getElementById('footing-fields').style.display = type === 'footing' ? '' : 'none';
  document.getElementById('muscu-fields').style.display   = type === 'musculation' ? '' : 'none';
}

function calcActivityCals(type, intensity, durationMin, extraData) {
  const weight = getWeight() || 75;
  let met = MET[type]?.[intensity] || 5;
  let cals = met * weight * (durationMin / 60);

  let details = `MET: ${met} × ${weight}kg × ${(durationMin/60).toFixed(2)}h`;

  // Footing: refine with speed/distance
  if (type === 'footing' && extraData.distance && extraData.distance > 0) {
    // ~1 kcal per kg per km (classic formula)
    const calsFromDist = 1.0 * weight * extraData.distance;
    cals = (cals + calsFromDist) / 2;
    details += `\n📍 Distance: ${extraData.distance} km (~${Math.round(calsFromDist)} kcal)`;
  }

  // Trail: add elevation bonus
  if (type === 'trail') {
    if (extraData.denivele && extraData.denivele > 0) {
      // ~10 kcal per 100m D+ per 70kg
      const elevBonus = (extraData.denivele / 100) * (weight / 70) * 10;
      cals += elevBonus;
      details += `\n⛰️ D+${extraData.denivele}m → +${Math.round(elevBonus)} kcal`;
    }
    if (extraData.distance) {
      details += `\n📍 Distance: ${extraData.distance} km`;
    }
  }

  // Musculation EPOC bonus (afterburn)
  if (type === 'musculation' && intensity === 'eleve') {
    const epoc = cals * 0.12;
    cals += epoc;
    details += `\n⚡ Afterburn EPOC estimé: +${Math.round(epoc)} kcal`;
  }

  return { cals: Math.round(cals), details };
}

document.getElementById('btn-calc-activity')?.addEventListener('click', () => {
  const type = document.getElementById('act-type').value;
  const intensity = document.getElementById('act-intensity').value;
  const duration = parseFloat(document.getElementById('act-duration').value);
  const date = document.getElementById('act-date').value;

  if (!duration || duration < 1) { toast('Entrez une durée valide', 'error'); return; }
  if (!date) { toast('Sélectionnez une date', 'error'); return; }

  const extraData = {};
  if (type === 'footing') {
    extraData.distance = parseFloat(document.getElementById('foot-distance').value) || 0;
    extraData.vitesse  = parseFloat(document.getElementById('foot-vitesse').value)  || 0;
  }
  if (type === 'trail') {
    extraData.distance  = parseFloat(document.getElementById('trail-distance').value)  || 0;
    extraData.denivele  = parseFloat(document.getElementById('trail-denivele').value)  || 0;
  }

  const { cals, details } = calcActivityCals(type, intensity, duration, extraData);

  // Show result
  document.getElementById('cal-result-value').textContent = cals;
  document.getElementById('cal-result-details').innerHTML = details.replace(/\n/g, '<br>');
  document.getElementById('cal-result-box').style.display = '';

  // Save activity
  const muscu_type = type === 'musculation' ? document.getElementById('muscu-type').value : '';
  state.activites.push({
    date, type, intensity, duration, cals,
    muscu_type,
    extra: extraData,
    details,
    label: ACTIVITY_LABELS[type] + (muscu_type ? ` (${muscu_type})` : ''),
  });
  saveState();
  renderActivityHistory();
  updateKPIs();
  buildCalorieRing();
  toast(`🔥 ${cals} kcal brûlées enregistrées !`);
});

function renderActivityHistory() {
  const container = document.getElementById('activity-history');
  const sorted = [...state.activites].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  container.innerHTML = '';
  if (sorted.length === 0) {
    container.innerHTML = '<p class="history-empty">Aucune activité enregistrée</p>';
    document.getElementById('week-cal-total').textContent = '0 kcal';
    return;
  }
  sorted.forEach((act, i) => {
    const realIdx = state.activites.findIndex(a =>
      a.date === act.date && a.type === act.type && a.duration === act.duration && a.cals === act.cals);
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span class="history-date">${formatDateShort(act.date)}</span>
      <div class="history-main">
        <strong>${act.label}</strong>
        <span>${act.duration} min • ${act.intensity}</span>
      </div>
      <span class="history-badge">🔥 ${act.cals} kcal</span>
      <button class="btn btn-danger" onclick="deleteActivity(${realIdx})">✕</button>`;
    container.appendChild(div);
  });
  document.getElementById('week-cal-total').textContent = Math.round(getWeekActivityCals()) + ' kcal';
}

function deleteActivity(idx) {
  state.activites.splice(idx, 1);
  saveState();
  renderActivityHistory();
  updateKPIs();
  buildCalorieRing();
  toast('Activité supprimée');
}

// ==========================================
// MESURES
// ==========================================
document.getElementById('btn-save-mesure')?.addEventListener('click', () => {
  const date  = document.getElementById('input-date-mesure').value;
  const poids = parseFloat(document.getElementById('input-poids').value);
  const taille = parseFloat(document.getElementById('input-taille-cm').value);
  const notes = document.getElementById('input-notes-mesure').value;
  if (!date) { toast('Sélectionnez une date', 'error'); return; }
  if (!poids) { toast('Entrez un poids valide', 'error'); return; }

  // Update or add
  const existing = state.mesures.findIndex(m => m.date === date);
  const entry = { date, poids, taille: taille || null, notes };
  if (existing >= 0) state.mesures[existing] = entry;
  else state.mesures.push(entry);

  saveState();
  renderMesuresHistory();
  buildWeightChart();
  buildWaistChart();
  updateKPIs();
  updateIMC();
  toast('✅ Mesure enregistrée !');
});

function renderMesuresHistory() {
  const container = document.getElementById('mesures-history');
  const sorted = [...state.mesures].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  container.innerHTML = '';
  if (sorted.length === 0) {
    container.innerHTML = '<p class="history-empty">Aucune mesure enregistrée</p>';
    return;
  }
  sorted.forEach((m, displayIdx) => {
    const realIdx = state.mesures.findIndex(x => x.date === m.date);
    const prev = sorted[displayIdx + 1];
    let delta = '';
    if (prev) {
      const d = (m.poids - prev.poids).toFixed(1);
      delta = `<span style="color:${d > 0 ? '#ff5e7a' : '#3dffa0'}">${d > 0 ? '▲ +' : '▼ '}${d} kg</span>`;
    }
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span class="history-date">${formatDateFr(m.date)}</span>
      <div class="history-main">
        <strong>${m.poids} kg${m.taille ? ' • ' + m.taille + ' cm' : ''}</strong>
        <span>${delta}${m.notes ? ' — ' + m.notes : ''}</span>
      </div>
      <button class="btn btn-danger" onclick="deleteMesure(${realIdx})">✕</button>`;
    container.appendChild(div);
  });
}

function deleteMesure(idx) {
  state.mesures.splice(idx, 1);
  saveState();
  renderMesuresHistory();
  buildWeightChart();
  buildWaistChart();
  updateKPIs();
  updateIMC();
  toast('Mesure supprimée');
}

// ==========================================
// PROFIL
// ==========================================
function loadProfil() {
  const p = state.profil;
  if (p.nom)   document.getElementById('profil-nom').value = p.nom;
  if (p.age)   document.getElementById('profil-age').value = p.age;
  if (p.sexe)  document.getElementById('profil-sexe').value = p.sexe;
  if (p.taille) document.getElementById('profil-taille').value = p.taille;
  if (p.objectifPoids) document.getElementById('profil-objectif-poids').value = p.objectifPoids;
  if (p.objectifCal)   document.getElementById('profil-objectif-cal').value = p.objectifCal;
  if (p.activiteNiveau) document.getElementById('profil-activite-niveau').value = p.activiteNiveau;

  // Update avatar letter
  if (p.nom) document.querySelector('.avatar').textContent = p.nom[0].toUpperCase();
}

document.getElementById('btn-save-profil')?.addEventListener('click', () => {
  state.profil = {
    nom:            document.getElementById('profil-nom').value,
    age:            parseInt(document.getElementById('profil-age').value) || null,
    sexe:           document.getElementById('profil-sexe').value,
    taille:         parseFloat(document.getElementById('profil-taille').value) || null,
    objectifPoids:  parseFloat(document.getElementById('profil-objectif-poids').value) || null,
    objectifCal:    parseFloat(document.getElementById('profil-objectif-cal').value) || null,
    activiteNiveau: parseFloat(document.getElementById('profil-activite-niveau').value),
  };
  saveState();
  updateAutoCalcs();
  updateIMC();
  updateKPIs();
  buildCalorieRing();
  if (state.profil.nom) document.querySelector('.avatar').textContent = state.profil.nom[0].toUpperCase();
  toast('✅ Profil sauvegardé !');
});

function calcBMR() {
  const p = state.profil;
  const sorted = [...state.mesures].sort((a,b) => new Date(b.date) - new Date(a.date));
  if (!p.age || !p.taille || sorted.length === 0) return 0;
  const poids = sorted[0].poids;
  // Mifflin-St Jeor
  if (p.sexe === 'homme') return Math.round(10 * poids + 6.25 * p.taille - 5 * p.age + 5);
  return Math.round(10 * poids + 6.25 * p.taille - 5 * p.age - 161);
}

function getCalorieGoal() {
  if (state.profil.objectifCal) return state.profil.objectifCal;
  const bmr = calcBMR();
  const niveau = state.profil.activiteNiveau || 1.55;
  return Math.round(bmr * niveau);
}

function getWeight() {
  const sorted = [...state.mesures].sort((a,b) => new Date(b.date) - new Date(a.date));
  return sorted.length > 0 ? sorted[0].poids : null;
}

function updateAutoCalcs() {
  const p = state.profil;
  const container = document.getElementById('auto-calcs');
  const bmr = calcBMR();
  const tdee = bmr ? Math.round(bmr * (p.activiteNiveau || 1.55)) : 0;
  const goal = getCalorieGoal();

  if (!bmr) {
    container.innerHTML = '<p class="imc-hint">Renseignez votre profil pour voir les calculs.</p>';
    return;
  }

  const poids = getWeight();
  const objectifPoids = p.objectifPoids;
  let deficitInfo = '';
  if (objectifPoids && poids) {
    const diff = poids - objectifPoids;
    if (Math.abs(diff) > 0.5) {
      const calDeficit = diff > 0 ? Math.round(tdee - 500) : Math.round(tdee + 300);
      deficitInfo = `
        <div class="calc-block">
          <div class="calc-block-title">${diff > 0 ? '📉 Objectif perte de poids' : '📈 Objectif prise de masse'}</div>
          <div class="calc-block-value" style="color:${diff > 0 ? '#ff8c42' : '#3dffa0'}">${Math.abs(diff).toFixed(1)} kg ${diff > 0 ? 'à perdre' : 'à prendre'}</div>
          <div class="calc-block-sub">Suggestion: ${calDeficit} kcal/jour (${diff > 0 ? '-500' : '+300'} kcal/jour)</div>
          <div class="calc-block-sub" style="margin-top:4px">Durée estimée: ~${Math.ceil(Math.abs(diff) / 0.5)} semaines</div>
        </div>`;
    }
  }

  container.innerHTML = `
    <div class="calc-block">
      <div class="calc-block-title">🔥 Métabolisme de base (BMR)</div>
      <div class="calc-block-value">${bmr} kcal/jour</div>
      <div class="calc-block-sub">Formule Mifflin-St Jeor</div>
    </div>
    <div class="calc-block">
      <div class="calc-block-title">⚡ Dépense totale (TDEE)</div>
      <div class="calc-block-value" style="color:#4fc3f7">${tdee} kcal/jour</div>
      <div class="calc-block-sub">BMR × facteur d'activité (${p.activiteNiveau || 1.55})</div>
    </div>
    <div class="calc-block">
      <div class="calc-block-title">🎯 Objectif calorique</div>
      <div class="calc-block-value" style="color:#3dffa0">${goal} kcal/jour</div>
      <div class="calc-block-sub">${p.objectifCal ? 'Défini manuellement' : 'Calculé automatiquement'}</div>
    </div>
    <div class="calc-block">
      <div class="calc-block-title">🧬 Répartition macro conseillée</div>
      <div class="calc-block-value" style="font-size:14px;gap:12px;display:flex;flex-wrap:wrap">
        <span style="color:#ffd54f">G: ${Math.round(goal * 0.45 / 4)}g</span>
        <span style="color:#3dffa0">P: ${Math.round(goal * 0.30 / 4)}g</span>
        <span style="color:#a78bfa">L: ${Math.round(goal * 0.25 / 9)}g</span>
      </div>
      <div class="calc-block-sub">45% Glucides • 30% Protéines • 25% Lipides</div>
    </div>
    ${deficitInfo}`;
}

// ==========================================
// NAVIGATION
// ==========================================
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  const navEl  = document.getElementById('nav-' + page);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

  if (page === 'dashboard') {
    setTimeout(() => {
      buildWeightChart();
      buildWaistChart();
      buildCalorieRing();
    }, 100);
  }
  if (page === 'alimentation') renderMeals();
  if (page === 'activite') renderActivityHistory();
  if (page === 'profil') { updateAutoCalcs(); }
}

// ==========================================
// HELPERS
// ==========================================
function getToday() {
  return new Date().toISOString().split('T')[0];
}
function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
function formatDateFr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type === 'error' ? 'error' : type === 'info' ? 'info' : '');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ==========================================
// INIT
// ==========================================
function init() {
  loadState();

  // Set today's date in all date fields
  const today = getToday();
  ['input-date-mesure', 'alim-date', 'act-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Topbar date
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Period buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = parseInt(btn.dataset.period);
      buildWeightChart();
    });
  });

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main-content');
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
  });
  document.getElementById('menu-btn')?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });

  // Load profil
  loadProfil();

  // Render histories
  renderMesuresHistory();
  renderActivityHistory();
  updateActivityForm();

  // Dashboard
  updateKPIs();
  updateIMC();
  setTimeout(buildCharts, 200);

  // Splash screen
  const splash = document.getElementById('splash');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 500);
    }, 1200);
  }

  // Init Firebase (après le reste pour ne pas bloquer l'UI)
  setTimeout(() => {
    if (window.firebaseSync) window.firebaseSync.init();
  }, 500);
}

// ESC close modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeFoodModal();
});

document.addEventListener('DOMContentLoaded', init);

// ==========================================
// PWA — SERVICE WORKER & INSTALL BANNER
// ==========================================
let deferredInstallPrompt = null;

// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ SW enregistré:', reg.scope))
      .catch(err => console.warn('SW erreur:', err));
  });
}

// Bannière d'installation PWA (Android/Chrome)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('pwa-banner');
  if (banner) {
    banner.style.display = 'flex';
    banner.style.animation = 'slideDown 0.4s ease';
  }
});

document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    toast('🎉 FitTrack installé sur votre écran d\'accueil !');
    document.getElementById('pwa-banner').style.display = 'none';
  }
  deferredInstallPrompt = null;
});

document.getElementById('pwa-banner-close')?.addEventListener('click', () => {
  document.getElementById('pwa-banner').style.display = 'none';
});

// App installée
window.addEventListener('appinstalled', () => {
  toast('✅ Application installée avec succès !');
  document.getElementById('pwa-banner').style.display = 'none';
});

