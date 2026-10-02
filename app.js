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
  { name: 'Pomme',             cal: 52,  prot: 0.3, carbs: 14, fat: 0.2, emoji: '🍎', unit: 'pomme', unitG: 180 },
  { name: 'Banane',            cal: 89,  prot: 1.1, carbs: 23, fat: 0.3, emoji: '🍌', unit: 'banane', unitG: 120 },
  { name: 'Orange',            cal: 47,  prot: 0.9, carbs: 12, fat: 0.1, emoji: '🍊', unit: 'orange', unitG: 150 },
  { name: 'Fraises',           cal: 32,  prot: 0.7, carbs: 7.7, fat: 0.3, emoji: '🍓' },
  { name: 'Raisin',            cal: 69,  prot: 0.7, carbs: 18, fat: 0.2, emoji: '🍇' },
  { name: 'Myrtilles',         cal: 57,  prot: 0.7, carbs: 14, fat: 0.3, emoji: '🫐' },
  // Légumes
  { name: 'Brocoli',           cal: 34,  prot: 2.8, carbs: 7,  fat: 0.4, emoji: '🥦' },
  { name: 'Carotte',           cal: 41,  prot: 0.9, carbs: 10, fat: 0.2, emoji: '🥕', unit: 'carotte', unitG: 80 },
  { name: 'Tomate',            cal: 18,  prot: 0.9, carbs: 3.9, fat: 0.2, emoji: '🍅', unit: 'tomate', unitG: 120 },
  { name: 'Épinards',          cal: 23,  prot: 2.9, carbs: 3.6, fat: 0.4, emoji: '🥬' },
  { name: 'Courgette',         cal: 17,  prot: 1.2, carbs: 3.1, fat: 0.3, emoji: '🥒', unit: 'courgette', unitG: 200 },
  { name: 'Avocat',            cal: 160, prot: 2,   carbs: 9,  fat: 15,  emoji: '🥑', unit: 'avocat', unitG: 150 },
  // Protéines
  { name: 'Blanc de poulet',   cal: 165, prot: 31,  carbs: 0,  fat: 3.6, emoji: '🍗', unit: 'filet', unitG: 150 },
  { name: 'Steak bœuf (maigre)', cal: 200, prot: 26, carbs: 0, fat: 10,  emoji: '🥩', unit: 'steak', unitG: 150 },
  { name: 'Saumon',            cal: 208, prot: 20,  carbs: 0,  fat: 13,  emoji: '🐟', unit: 'pavé', unitG: 150 },
  { name: 'Thon en boîte',     cal: 132, prot: 28,  carbs: 0,  fat: 1.7, emoji: '🐟', unit: 'boîte', unitG: 130 },
  { name: 'Œuf',               cal: 155, prot: 13,  carbs: 1.1, fat: 11, emoji: '🥚', unit: 'œuf', unitG: 60 },
  { name: 'Crevettes',         cal: 99,  prot: 24,  carbs: 0,  fat: 0.3, emoji: '🦐' },
  { name: 'Jambon blanc',      cal: 107, prot: 19,  carbs: 0.6, fat: 3,  emoji: '🍖', unit: 'tranche', unitG: 30 },
  // Laitages
  { name: 'Yaourt nature 0%',  cal: 54,  prot: 5.7, carbs: 7.7, fat: 0.1, emoji: '🥛', unit: 'pot', unitG: 125 },
  { name: 'Yaourt grec',       cal: 97,  prot: 9,   carbs: 3.6, fat: 5,  emoji: '🥛', unit: 'pot', unitG: 150 },
  { name: 'Fromage blanc 0%',  cal: 47,  prot: 8,   carbs: 4,  fat: 0.2, emoji: '🫙', unit: 'pot', unitG: 100 },
  { name: 'Lait demi-écrémé',  cal: 47,  prot: 3.4, carbs: 4.7, fat: 1.6, emoji: '🥛', unit: 'verre', unitG: 200 },
  { name: 'Emmental',          cal: 378, prot: 27,  carbs: 0,  fat: 30,  emoji: '🧀', unit: 'portion', unitG: 30 },
  // Féculents
  { name: 'Riz cuit',          cal: 130, prot: 2.7, carbs: 28, fat: 0.3, emoji: '🍚', unit: 'assiette', unitG: 200 },
  { name: 'Pâtes cuites',      cal: 158, prot: 5.8, carbs: 31, fat: 0.9, emoji: '🍝', unit: 'assiette', unitG: 200 },
  { name: 'Pain complet',      cal: 247, prot: 9,   carbs: 48, fat: 3.4, emoji: '🍞', unit: 'tranche', unitG: 30 },
  { name: 'Pain blanc',        cal: 267, prot: 9,   carbs: 55, fat: 3,   emoji: '🥖', unit: 'morceau', unitG: 50 },
  { name: 'Quinoa cuit',       cal: 120, prot: 4.4, carbs: 22, fat: 1.9, emoji: '🌾' },
  { name: 'Pomme de terre',    cal: 77,  prot: 2,   carbs: 17, fat: 0.1, emoji: '🥔', unit: 'pomme de terre', unitG: 150 },
  { name: 'Patate douce',      cal: 86,  prot: 1.6, carbs: 20, fat: 0.1, emoji: '🍠', unit: 'patate', unitG: 200 },
  { name: 'Flocons d\'avoine', cal: 370, prot: 13,  carbs: 66, fat: 7,   emoji: '🌾', unit: 'portion', unitG: 40 },
  // Légumineuses
  { name: 'Lentilles cuites',  cal: 116, prot: 9,   carbs: 20, fat: 0.4, emoji: '🫘' },
  { name: 'Pois chiches',      cal: 164, prot: 9,   carbs: 27, fat: 2.6, emoji: '🫘' },
  // Huiles & matières grasses
  { name: 'Huile d\'olive',    cal: 884, prot: 0,   carbs: 0,  fat: 100, emoji: '🫒', unit: 'cuillère', unitG: 10 },
  { name: 'Beurre',            cal: 717, prot: 0.9, carbs: 0.1, fat: 81, emoji: '🧈', unit: 'noisette', unitG: 10 },
  // Boissons
  { name: 'Jus d\'orange',     cal: 45,  prot: 0.7, carbs: 10, fat: 0.2, emoji: '🥤', unit: 'verre', unitG: 200 },
  { name: 'Lait végétal avoine', cal: 46, prot: 1.2, carbs: 9, fat: 1.2, emoji: '🥤', unit: 'verre', unitG: 200 },
  // Sport / suppléments
  { name: 'Whey protéine',     cal: 379, prot: 80,  carbs: 5,  fat: 4,   emoji: '💊', unit: 'dose', unitG: 30 },
  { name: 'Barre de céréales', cal: 380, prot: 6,   carbs: 70, fat: 8,   emoji: '🍫', unit: 'barre', unitG: 35 },
  { name: 'Amandes',           cal: 579, prot: 21,  carbs: 22, fat: 50,  emoji: '🥜', unit: 'poignée', unitG: 30 },
  { name: 'Noix',              cal: 654, prot: 15,  carbs: 14, fat: 65,  emoji: '🥜', unit: 'poignée', unitG: 30 },
  // Plats courants
  { name: 'Pizza margherita',  cal: 266, prot: 11,  carbs: 33, fat: 10,  emoji: '🍕', unit: 'part', unitG: 150 },
  { name: 'Burger bœuf',       cal: 295, prot: 17,  carbs: 24, fat: 14,  emoji: '🍔', unit: 'burger', unitG: 200 },
  { name: 'Salade César',      cal: 120, prot: 6,   carbs: 5,  fat: 9,   emoji: '🥗', unit: 'bol', unitG: 250 },
  { name: 'Soupe de légumes',  cal: 45,  prot: 2,   carbs: 8,  fat: 0.5, emoji: '🍲', unit: 'bol', unitG: 300 },
  { name: 'Chocolat noir 70%', cal: 598, prot: 8,   carbs: 46, fat: 43,  emoji: '🍫', unit: 'carré', unitG: 10 },
  { name: 'Miel',              cal: 304, prot: 0.3, carbs: 82, fat: 0,   emoji: '🍯', unit: 'cuillère', unitG: 15 },
];

// ==========================================
// FOOD CACHE (aliments recherchés en ligne)
// ==========================================
const FOOD_CACHE_KEY = 'fittrack_food_cache';
let foodCache = [];
function loadFoodCache() {
  try {
    const raw = localStorage.getItem(FOOD_CACHE_KEY);
    if (raw) foodCache = JSON.parse(raw);
  } catch(e) { foodCache = []; }
}
function saveFoodCache() {
  localStorage.setItem(FOOD_CACHE_KEY, JSON.stringify(foodCache));
}
function addToFoodCache(food) {
  if (foodCache.find(f => f.name.toLowerCase() === food.name.toLowerCase())) return;
  foodCache.push(food);
  if (foodCache.length > 500) foodCache.shift();
  saveFoodCache();
}
loadFoodCache();

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
  const out = getDayActivityCals(date);
  const vsGoalEl = document.getElementById('daily-cal-vs-goal');
  if (goal > 0) {
    const budgetTotal = goal + out;
    const remaining = Math.round(budgetTotal - total);
    
    if (remaining >= 0) {
      vsGoalEl.innerHTML = `<br><span style="color: #3dffa0; font-weight:600;">✅ Restant : ${remaining} kcal</span>`;
    } else {
      vsGoalEl.innerHTML = `<br><span style="color: #ff5e7a; font-weight:600;">⚠️ Dépassement : ${Math.abs(remaining)} kcal</span>`;
    }
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

let searchTimeout = null;
let selectedFoodBase = null;

// Normalise les accents et ligatures pour la recherche
function normalizeSearch(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprime les accents
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae'); // ligatures
}

function searchFood() {
  const rawQ = document.getElementById('food-search').value.trim();
  const q = normalizeSearch(rawQ);
  const container = document.getElementById('food-results');
  container.innerHTML = '';
  if (q.length < 2) return;

  // 1. Cherche dans la base locale (insensible aux accents)
  const localResults = FOOD_DB.filter(f => normalizeSearch(f.name).includes(q));
  
  // 2. Cherche dans le cache hors-ligne
  const cacheResults = foodCache.filter(f =>
    normalizeSearch(f.name).includes(q) &&
    !localResults.find(l => l.name.toLowerCase() === f.name.toLowerCase())
  );

  const combined = [...localResults, ...cacheResults].slice(0, 10);

  if (combined.length > 0) {
    renderFoodResults(combined, container);
  }

  // 3. Cherche en ligne (multi-sources) avec délai
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (!navigator.onLine) {
      if (combined.length === 0) {
        container.innerHTML = '<p style="color:#4a5c7a;font-size:12px;text-align:center;padding:10px">📶 Hors-ligne — aucun résultat local trouvé</p>';
      }
      return;
    }

    const searchIndicator = document.createElement('div');
    searchIndicator.className = 'api-search-indicator';
    searchIndicator.innerHTML = '🔍 Recherche dans les bases de données...';
    container.appendChild(searchIndicator);

    let apiResults = [];

    // --- SOURCE 1 : OpenFoodFacts (produits packagés) ---
    try {
      const r1 = await fetch(`https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(rawQ)}&fields=product_name,product_name_fr,nutriments&page_size=6`);
      const d1 = await r1.json();
      const off = (d1.products || []).filter(p => {
        const name = p.product_name_fr || p.product_name;
        return name && p.nutriments && p.nutriments['energy-kcal_100g'] > 0;
      }).map(p => {
        const name = p.product_name_fr || p.product_name;
        return {
          name: name.length > 45 ? name.substring(0, 45) + '…' : name,
          cal:   +(p.nutriments['energy-kcal_100g'] || 0).toFixed(1),
          prot:  +(p.nutriments['proteins_100g'] || 0).toFixed(1),
          carbs: +(p.nutriments['carbohydrates_100g'] || 0).toFixed(1),
          fat:   +(p.nutriments['fat_100g'] || 0).toFixed(1),
          emoji: '🛒', source: 'openfoodfacts',
        };
      }).slice(0, 5);
      apiResults.push(...off);
    } catch(e) { console.warn('OpenFoodFacts error:', e); }

    // --- SOURCE 2 : USDA FoodData Central (aliments génériques) ---
    try {
      const r2 = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(rawQ)}&pageSize=5&api_key=DEMO_KEY`);
      const d2 = await r2.json();
      const usda = (d2.foods || []).filter(f => {
        const n = f.foodNutrients || [];
        return f.description && n.find(x => x.nutrientName === 'Energy');
      }).map(f => {
        const n = f.foodNutrients || [];
        const get = (name) => +(n.find(x => x.nutrientName === name)?.value || 0).toFixed(1);
        return {
          name: f.description.length > 45 ? f.description.substring(0, 45) + '…' : f.description,
          cal:   get('Energy'),
          prot:  get('Protein'),
          carbs: get('Carbohydrate, by difference'),
          fat:   get('Total lipid (fat)'),
          emoji: '🇺🇸', source: 'usda',
        };
      }).filter(f => !apiResults.find(a => normalizeSearch(a.name) === normalizeSearch(f.name)))
        .slice(0, 4);
      apiResults.push(...usda);
    } catch(e) { console.warn('USDA error:', e); }

    searchIndicator.remove();

    // Filtrer les doublons avec les résultats locaux
    apiResults = apiResults.filter(f => !combined.find(c => normalizeSearch(c.name) === normalizeSearch(f.name)));

    // Affichage résultats en ligne
    if (apiResults.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'food-results-separator';
      const sources = [...new Set(apiResults.map(f => f.source === 'openfoodfacts' ? '🛒 OpenFoodFacts' : '🇺🇸 USDA'))].join(' • ');
      sep.innerHTML = `🌐 Résultats en ligne (${sources})`;
      container.appendChild(sep);
      renderFoodResults(apiResults, container);
      apiResults.forEach(f => addToFoodCache(f));
    }

    // --- SOURCE 3 : Bouton IA si rien trouvé ---
    if (combined.length === 0 && apiResults.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:16px;">
          <p style="color:#4a5c7a;font-size:12px;margin-bottom:12px;">Aucun aliment trouvé dans les bases de données.</p>
          <button class="btn btn-primary" id="btn-ask-ai" onclick="askAIForFood('${rawQ.replace(/'/g, "\\'")}')">
            🤖 Demander à l'IA (Gemini)
          </button>
          <p style="color:#4a5c7a;font-size:10px;margin-top:8px;">L'IA va estimer les valeurs nutritionnelles</p>
        </div>`;
    } else if (combined.length === 0 && apiResults.length > 0) {
      // Proposer aussi l'IA en bas
      const aiBtn = document.createElement('div');
      aiBtn.className = 'food-results-separator';
      aiBtn.style.cursor = 'pointer';
      aiBtn.innerHTML = `<span onclick="askAIForFood('${rawQ.replace(/'/g, "\\'")}')" style="color:#a78bfa;cursor:pointer">🤖 Pas satisfait ? Demander à l'IA Gemini</span>`;
      container.appendChild(aiBtn);
    }
  }, 600);
}

// ==========================================
// GEMINI AI INTEGRATION
// ==========================================
async function askAIForFood(foodName) {
  let apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    apiKey = prompt("🤖 Pour utiliser l'IA Gemini, veuillez entrer votre clé API (obtenable sur aistudio.google.com) :");
    if (!apiKey) return;
    localStorage.setItem('gemini_api_key', apiKey);
  }

  const btn = document.getElementById('btn-ask-ai');
  if (btn) btn.innerHTML = '⏳ Analyse en cours...';

  try {
    const promptText = `Donne-moi les valeurs nutritionnelles moyennes pour 100g de l'aliment/plat suivant : "${foodName}".
Réponds UNIQUEMENT avec un objet JSON strict au format exact suivant, sans aucun autre texte (n'inclus pas de balises markdown comme \`\`\`json) :
{"cal": 120, "prot": 10.5, "carbs": 15.2, "fat": 3.1}`;

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates[0].content.parts[0].text.trim().replace(/```json/g, '').replace(/```/g, '');
    const nut = JSON.parse(text);

    const aiFood = {
      name: foodName + ' (Estimé)',
      cal: +(nut.cal || 0).toFixed(1),
      prot: +(nut.prot || 0).toFixed(1),
      carbs: +(nut.carbs || 0).toFixed(1),
      fat: +(nut.fat || 0).toFixed(1),
      emoji: '✨', source: 'gemini'
    };

    const container = document.getElementById('food-results');
    container.innerHTML = '';
    renderFoodResults([aiFood], container);
    addToFoodCache(aiFood); // On le met en cache pour les prochaines fois !
    toast('✅ Valeurs estimées par IA');

  } catch (err) {
    console.error('Gemini error:', err);
    alert("Erreur avec l'IA : " + err.message + "\nSi le problème persiste avec la clé API, rechargez la page pour en saisir une nouvelle.");
    if (err.message.includes('API_KEY_INVALID') || err.message.includes('key')) {
      localStorage.removeItem('gemini_api_key');
    }
    if (btn) btn.innerHTML = '🤖 Demander à l\'IA (Gemini)';
  }
}

function renderFoodResults(results, container) {
  results.forEach(food => {
    const div = document.createElement('div');
    div.className = 'food-result-item';
    const unitLabel = food.unit ? ` • 1 ${food.unit} = ${food.unitG}g` : '';
    const sourceTag = food.source === 'openfoodfacts'
      ? '<span class="food-source-tag">OFF</span>'
      : (foodCache.find(f => f.name === food.name) ? '<span class="food-source-tag cache">💾</span>' : '');
    div.innerHTML = `
      <div>
        <span class="food-result-name">${food.emoji || '🍽️'} ${food.name} ${sourceTag}</span>
        <span class="food-result-info">P:${food.prot}g • G:${food.carbs}g • L:${food.fat}g${unitLabel}</span>
      </div>
      <span class="food-result-cal">${food.cal} kcal/100g</span>`;
    div.addEventListener('click', () => selectFood(food));
    container.appendChild(div);
  });
}

function selectFood(food) {
  selectedFoodBase = food;
  document.getElementById('manual-food-name').value = food.name;
  
  const unitSelect = document.getElementById('manual-food-unit');
  const qtyInput = document.getElementById('manual-food-qty');
  
  if (food.unit) {
    unitSelect.innerHTML = `<option value="g">grammes</option><option value="unit" selected>× ${food.unit} (${food.unitG}g)</option>`;
    qtyInput.value = '1';
    updateFoodFromQty(food, 1, 'unit');
  } else {
    unitSelect.innerHTML = '<option value="g">grammes</option>';
    qtyInput.value = '100';
    updateFoodFromQty(food, 100, 'g');
  }
  
  document.querySelector('.manual-food-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const updateFields = () => {
    const qty = parseFloat(qtyInput.value) || 1;
    const unit = unitSelect.value;
    updateFoodFromQty(food, qty, unit);
  };
  qtyInput.oninput = updateFields;
  unitSelect.onchange = updateFields;
  
  if (food.source === 'openfoodfacts') addToFoodCache(food);
}

function updateFoodFromQty(food, qty, unit) {
  let grams;
  if (unit === 'unit' && food.unitG) {
    grams = qty * food.unitG;
  } else {
    grams = qty;
  }
  const factor = grams / 100;
  document.getElementById('manual-food-cal').value   = +(food.cal   * factor).toFixed(1);
  document.getElementById('manual-food-prot').value  = +(food.prot  * factor).toFixed(1);
  document.getElementById('manual-food-carbs').value = +(food.carbs * factor).toFixed(1);
  document.getElementById('manual-food-fat').value   = +(food.fat   * factor).toFixed(1);
  const gramsLabel = document.getElementById('qty-grams-label');
  if (gramsLabel && unit === 'unit') {
    gramsLabel.textContent = `= ${Math.round(grams)}g`;
    gramsLabel.style.display = '';
  } else if (gramsLabel) {
    gramsLabel.style.display = 'none';
  }
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
function getNowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function formatDateShort(dateStr) {
  const isDateTime = dateStr.includes('T');
  const d = new Date(isDateTime ? dateStr : dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
function formatDateFr(dateStr) {
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ' à');
  }
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
    if (el) {
      if (el.type === 'datetime-local') el.value = getNowLocal();
      else el.value = today;
    }
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

