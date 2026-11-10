/* ============================================================
   RENT PAY — Loyers par zone, Réparations, Impôts trimestriels & Mobile Money
   app.js
   ============================================================ */

const STORAGE_KEY = 'rentPay_db_v5';

const OFFICIAL_SITES = [
  'Yopougon Studios',
  'Yopougon magasins',
  'Angré studios',
  'Yopougon Kotibet',
  'Panneaux publicitaires sur la dalle de Yopougon'
];

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const MONTHS_SHORT = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'
];

const MM_PROVIDERS = [
  { name: 'Orange Money',       color: '#d97724', prefix: 'OM' },
  { name: 'Wave',               color: '#469ec7', prefix: 'WV' },
  { name: 'MTN Mobile Money',   color: '#cbb247', prefix: 'MTN' },
  { name: 'Moov Money',         color: '#489c71', prefix: 'MV' },
  { name: 'Flooz / TMoney',     color: '#926db8', prefix: 'FLZ' },
  { name: 'Espèces / Virement', color: '#8e939e', prefix: 'ESP' },
];

const REPAIR_STATUS = {
  todo:       { label: 'À faire',  cls: 'badge-late' },
  inprogress: { label: 'En cours', cls: 'badge-partial' },
  done:       { label: 'Terminée', cls: 'badge-paid' },
};

const REPAIR_PRIORITY = {
  haute:   { label: 'Haute',   cls: 'badge-late' },
  moyenne: { label: 'Moyenne', cls: 'badge-partial' },
  basse:   { label: 'Basse',   cls: 'badge-stopped' },
};

/* ── HELPERS ─────────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtCFA(amount, showSign = false) {
  const n = Math.round(Number(amount) || 0);
  const formatted = Math.abs(n).toLocaleString('fr-FR') + ' FCFA';
  if (showSign && n > 0) return '+' + formatted;
  if (n < 0) return '-' + formatted;
  return formatted;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function periodKey(year, month) {
  return `${year}-${pad2(month)}`;
}

function fmtPeriodLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

function fmtDateFR(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00').getTime();
  const b = new Date(toISO + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

function sum(arr, fn) {
  return arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
}

function getProviderMeta(providerName) {
  return MM_PROVIDERS.find(p => p.name === providerName) || MM_PROVIDERS[0];
}

function renderMMPill(providerName) {
  if (!providerName) return '<span class="text-muted">—</span>';
  const p = getProviderMeta(providerName);
  return `<span class="mm-pill"><span class="mm-dot-inline" style="background:${p.color};"></span>${esc(p.name)}</span>`;
}

function renderUnitNo(t) {
  return t && t.unitNo ? `<span class="unit-no">${esc(t.unitNo)}</span>` : '<span class="text-muted">—</span>';
}

function renderPhone(t) {
  return t && t.phone ? esc(t.phone) : '<span class="text-muted">Non renseigné</span>';
}

function buildMapsUrl(t) {
  if (t.gps && /^https?:\/\//i.test(t.gps.trim())) return t.gps.trim();
  const query = t.gps && t.gps.trim() ? t.gps.trim() : `${t.address || ''}, ${t.city || ''}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function renderLocationCell(t) {
  return `
    <div class="loc-cell">
      <span class="loc-city">📍 ${esc(t.city || 'Zone non renseignée')}</span>
      ${t.address ? `<span class="loc-addr">${esc(t.address)}</span>` : ''}
      <a class="loc-map-link" href="${esc(buildMapsUrl(t))}" target="_blank" rel="noopener noreferrer">Voir sur la carte ↗</a>
    </div>
  `;
}

function tenantOptionLabel(t) {
  return `${t.unitNo ? 'N° ' + t.unitNo + ' — ' : ''}${t.name} — ${t.unit} (${t.city})`;
}

/* ── DONNÉES ISSUES DU FICHIER EXCEL (2020–2026) ──────────── */
function defaultTaxDueDate(year, quarter) {
  const q = Number(quarter);
  if (q === 1) return `${year}-04-15`;
  if (q === 2) return `${year}-07-15`;
  if (q === 3) return `${year}-10-15`;
  return `${Number(year) + 1}-01-15`;
}

function createSeedData() {
  const base = { status: 'active', stopDate: null, stopReason: '', stopNotes: '', dueDay: 5, prefMM: 'Orange Money', phone: '', gps: '' };

  const tenants = [
    /* 1. SITE : Yopougon Studios (10 Studios) */
    {
      ...base, id: 'PAL-S1', unitNo: 'STUDIO N°1', name: 'Ambeu Seka Marie Viviane', phone: '',
      unit: 'Studio N°1 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S2', unitNo: 'STUDIO N°2', name: 'Tiekou Gnandjia Hortense', phone: '',
      unit: 'Studio N°2 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S3', unitNo: 'STUDIO N°3', name: 'Monnet Bonny Fortune (Dabila Ouattara)', phone: '07 09 50 04 44',
      unit: 'Studio N°3 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios (Réf. Ouattara Seydou Korientis)',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S4', unitNo: 'STUDIO N°4', name: 'Koukougnon Bernadine', phone: '',
      unit: 'Studio N°4 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 110000, startDate: '2020-01-01', prefMM: 'MTN Mobile Money',
      rentHistory: [{ from: '2020-01', amount: 55000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S5', unitNo: 'STUDIO N°5', name: 'Dakin Abachinou Agnès', phone: '',
      unit: 'Studio N°5 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S6', unitNo: 'STUDIO N°6', name: 'Assoua Djomi Hervé Adonis', phone: '',
      unit: 'Studio N°6 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S7', unitNo: 'STUDIO N°7', name: 'Ahipo Gnahoua Norbert', phone: '',
      unit: 'Studio N°7 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S8', unitNo: 'STUDIO N°8', name: 'Dohou Ablet Roger', phone: '',
      unit: 'Studio N°8 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'MTN Mobile Money',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },
    {
      ...base, id: 'PAL-S9', unitNo: 'STUDIO N°9', name: 'Tra-Lou Bouzie Émilienne', phone: '',
      unit: 'Studio N°9 — Yopougon Studios (Inoccupé Jan-Sept 2026)', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Orange Money',
      rentHistory: [
        { from: '2020-01', amount: 55000 },
        { from: '2025-06', amount: 50000 },
        { from: '2026-01', amount: 0 },
        { from: '2026-10', amount: 70000 }
      ]
    },
    {
      ...base, id: 'PAL-S10', unitNo: 'STUDIO N°10', name: 'Kansole Sidonie', phone: '',
      unit: 'Studio N°10 — Yopougon Studios', city: 'Yopougon Studios', address: 'Yopougon Studios',
      monthlyRent: 70000, deposit: 100000, startDate: '2020-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2020-01', amount: 50000 }, { from: '2026-10', amount: 70000 }]
    },

    /* 2. SITE : Yopougon magasins (6 Magasins) */
    {
      ...base, id: 'PAL-M1', unitNo: 'MAGASIN N°1', name: 'Kouassi Edgard Eloh', phone: '',
      unit: 'Magasin N°1 — Yopougon magasins', city: 'Yopougon magasins', address: 'Yopougon magasins — Façade commerciale',
      monthlyRent: 160000, deposit: 260000, startDate: '2020-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2020-01', amount: 130000 }, { from: '2026-10', amount: 160000 }]
    },
    {
      ...base, id: 'PAL-M2', unitNo: 'MAGASIN N°2', name: 'Boulangerie Kambou', phone: '',
      unit: 'Magasin N°2 (Boulangerie) — Yopougon magasins', city: 'Yopougon magasins', address: 'Yopougon magasins — Façade commerciale',
      monthlyRent: 310000, deposit: 520000, startDate: '2020-01-01', prefMM: 'Espèces / Virement',
      rentHistory: [{ from: '2020-01', amount: 260000 }, { from: '2026-10', amount: 310000 }]
    },
    {
      ...base, id: 'PAL-M3', unitNo: 'MAGASIN N°3', name: 'Diabagaté Mariame', phone: '',
      unit: 'Magasin N°3 — Yopougon magasins', city: 'Yopougon magasins', address: 'Yopougon magasins — Façade commerciale',
      monthlyRent: 75000, deposit: 120000, startDate: '2020-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2020-01', amount: 60000 }, { from: '2026-10', amount: 75000 }]
    },
    {
      ...base, id: 'PAL-M4', unitNo: 'MAGASIN N°4', name: 'Roch Émilienne', phone: '',
      unit: 'Magasin N°4 — Yopougon magasins', city: 'Yopougon magasins', address: 'Yopougon magasins — Façade commerciale',
      monthlyRent: 75000, deposit: 120000, startDate: '2020-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2020-01', amount: 60000 }, { from: '2026-10', amount: 75000 }]
    },
    {
      ...base, id: 'PAL-M5', unitNo: 'MAGASIN N°5', name: 'Danho Odon', phone: '',
      unit: 'Magasin N°5 — Yopougon magasins', city: 'Yopougon magasins', address: 'Yopougon magasins — Façade commerciale',
      monthlyRent: 75000, deposit: 120000, startDate: '2020-01-01', prefMM: 'MTN Mobile Money',
      rentHistory: [{ from: '2020-01', amount: 60000 }, { from: '2026-10', amount: 75000 }]
    },
    {
      ...base, id: 'PAL-M6', unitNo: 'MAGASIN N°6', name: 'Kouadio Kouamé Hugues O.', phone: '',
      unit: 'Magasin N°6 — Yopougon magasins', city: 'Yopougon magasins', address: 'Yopougon magasins — Façade commerciale',
      monthlyRent: 90000, deposit: 140000, startDate: '2020-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2020-01', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },

    /* 3. SITE : Angré studios (10 Studios) */
    {
      ...base, id: 'ANG-S1', unitNo: 'STUDIO N°1', name: 'Djé Adjoua Romaine (ex-Ahou Catherine)', phone: '',
      unit: 'Studio N°1 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 100000, deposit: 140000, startDate: '2023-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-09', amount: 100000 }]
    },
    {
      ...base, id: 'ANG-S2', unitNo: 'STUDIO N°2', name: 'Kouassi Amenani Nathalie', phone: '',
      unit: 'Studio N°2 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 140000, startDate: '2023-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },
    {
      ...base, id: 'ANG-S3', unitNo: 'STUDIO N°3', name: 'Kouamé Ludovic', phone: '',
      unit: 'Studio N°3 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 140000, startDate: '2023-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },
    {
      ...base, id: 'ANG-S4', unitNo: 'STUDIO N°4', name: 'Doua Monné Pristyl (ex-Oué Hervé)', phone: '',
      unit: 'Studio N°4 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 100000, deposit: 140000, startDate: '2023-01-01', prefMM: 'MTN Mobile Money',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-08', amount: 100000 }]
    },
    {
      ...base, id: 'ANG-S5', unitNo: 'STUDIO N°5', name: 'Charlotte Vany', phone: '',
      unit: 'Studio N°5 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 160000, startDate: '2023-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2023-01', amount: 80000 }, { from: '2026-10', amount: 90000 }]
    },
    {
      ...base, id: 'ANG-S6', unitNo: 'STUDIO N°6', name: 'Konan Anthelme', phone: '',
      unit: 'Studio N°6 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 140000, startDate: '2023-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },
    {
      ...base, id: 'ANG-S7', unitNo: 'STUDIO N°7', name: 'Mana Abdoulaye (ex-Diarrassouba Lamine)', phone: '',
      unit: 'Studio N°7 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 140000, startDate: '2023-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },
    {
      ...base, id: 'ANG-S8', unitNo: 'STUDIO N°8', name: 'Soté Toussaint Dougoué (ex-Tchotch Freddy)', phone: '',
      unit: 'Studio N°8 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 100000, deposit: 140000, startDate: '2023-01-01', prefMM: 'MTN Mobile Money',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-08', amount: 100000 }]
    },
    {
      ...base, id: 'ANG-S9', unitNo: 'STUDIO N°9', name: 'Hourry Désiré', phone: '',
      unit: 'Studio N°9 — Angré studios (Reprise Août 2026)', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 140000, startDate: '2026-08-01', prefMM: 'Wave',
      rentHistory: [{ from: '2026-08', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },
    {
      ...base, id: 'ANG-S10', unitNo: 'STUDIO N°10', name: 'Assemian Alfred', phone: '',
      unit: 'Studio N°10 — Angré studios', city: 'Angré studios', address: 'Cocody Angré studios',
      monthlyRent: 90000, deposit: 140000, startDate: '2023-01-01', prefMM: 'Orange Money',
      rentHistory: [{ from: '2023-01', amount: 70000 }, { from: '2026-10', amount: 90000 }]
    },

    /* 4. SITE : Yopougon Kotibet (Villa) */
    {
      ...base, id: 'KOT-1', unitNo: 'VILLA', name: 'OULAI Feh Diego', phone: '',
      unit: 'Villa — Yopougon Kotibet (Entrée Mars 2022)', city: 'Yopougon Kotibet',
      address: 'Yopougon Kotibet — Villa principale', monthlyRent: 250000, deposit: 500000,
      startDate: '2022-03-01', prefMM: 'Espèces / Virement',
      rentHistory: [{ from: '2022-03', amount: 250000 }]
    },

    /* 5. SITE : Panneaux publicitaires sur la dalle de Yopougon */
    {
      ...base, id: 'PAN-1', unitNo: 'PANNEAU N°1', name: 'Régie Publicitaire — Dalle de Yopougon', phone: '',
      unit: 'Panneau publicitaire sur la dalle de Yopougon', city: 'Panneaux publicitaires sur la dalle de Yopougon',
      address: 'Dalle de Yopougon', monthlyRent: 150000, deposit: 0,
      startDate: '2024-01-01', prefMM: 'Wave',
      rentHistory: [{ from: '2024-01', amount: 150000 }]
    },
  ];

  const payments = [];
  let seq = 1000;
  function addPay(tenantId, period, amount, datePaid, provider = 'Orange Money', phone = '', note = 'Règlement loyer (Excel)') {
    if (!amount || amount <= 0) return;
    const pMeta = getProviderMeta(provider);
    seq++;
    payments.push({
      id: 'PAY-' + seq,
      tenantId,
      period,
      amount,
      datePaid: datePaid || `${period}-05`,
      provider,
      phone,
      ref: `${pMeta.prefix}-${period.replace('-', '')}-${seq}`,
      note
    });
  }

  /* ── PAIEMENTS 2024 (issus du classeur Excel) ── */
  [3, 4, 5].forEach(m => addPay('KOT-1', periodKey(2024, m), 250000, '2024-05-04', 'Espèces / Virement'));
  const pal2024Full = [
    ['PAL-S1', 50000], ['PAL-S2', 50000], ['PAL-S3', 50000], ['PAL-S4', 55000], ['PAL-S5', 50000],
    ['PAL-S6', 50000], ['PAL-S7', 50000], ['PAL-S8', 50000], ['PAL-S9', 55000], ['PAL-S10', 50000],
    ['PAL-M1', 130000], ['PAL-M2', 260000], ['PAL-M3', 60000], ['PAL-M4', 60000], ['PAL-M5', 60000], ['PAL-M6', 70000]
  ];
  for (let m = 1; m <= 12; m++) {
    const ym = periodKey(2024, m);
    pal2024Full.forEach(([id, amt]) => addPay(id, ym, amt, `${ym}-05`, 'Orange Money'));
    ['ANG-S1', 'ANG-S2', 'ANG-S3', 'ANG-S6', 'ANG-S7', 'ANG-S8', 'ANG-S10'].forEach(id => addPay(id, ym, 70000, `${ym}-05`, 'Wave'));
    addPay('ANG-S4', ym, m === 6 ? 150000 : 70000, `${ym}-05`, 'MTN Mobile Money');
    addPay('ANG-S5', ym, 80000, `${ym}-05`, 'Orange Money');
  }

  /* ── PAIEMENTS 2025 (issus du classeur Excel) ── */
  // 1. SIDECI KOTIBET : Août-Nov payés le 05/11/2025, Déc payé le 05/12/2025 (1 250 000 FCFA)
  [8, 9, 10, 11].forEach(m => addPay('KOT-1', periodKey(2025, m), 250000, '2025-11-05', 'Espèces / Virement'));
  addPay('KOT-1', '2025-12', 250000, '2025-12-05', 'Espèces / Virement');

  // 2. SIDECI PALAIS 2025
  for (let m = 1; m <= 12; m++) {
    const ym = periodKey(2025, m);
    addPay('PAL-S1', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-S2', ym, 50000, `${ym}-05`, 'Orange Money');
    addPay('PAL-S3', ym, 50000, `${ym}-05`, 'Orange Money', '07 09 50 04 44');
    addPay('PAL-S4', ym, m === 7 ? 70000 : 55000, `${ym}-05`, 'MTN Mobile Money');
    addPay('PAL-S5', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-S6', ym, 50000, `${ym}-05`, 'Orange Money');
    addPay('PAL-S7', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-S8', ym, 50000, `${ym}-05`, 'MTN Mobile Money');
    addPay('PAL-S10', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-M1', ym, 130000, `${ym}-05`, 'Orange Money');
    addPay('PAL-M2', ym, 260000, `${ym}-05`, 'Espèces / Virement');
    addPay('PAL-M3', ym, 60000, `${ym}-05`, 'Wave');
    addPay('PAL-M4', ym, 60000, `${ym}-05`, 'Orange Money');
    addPay('PAL-M5', ym, 60000, `${ym}-05`, 'MTN Mobile Money');
    addPay('PAL-M6', ym, 70000, `${ym}-05`, 'Wave');
  }
  // Studio 9 Palais en 2025 : Mars 75k, Avr 55k, Mai 55k, Oct 50k
  addPay('PAL-S9', '2025-03', 75000, '2025-03-08', 'Orange Money');
  addPay('PAL-S9', '2025-04', 55000, '2025-04-04', 'Orange Money');
  addPay('PAL-S9', '2025-05', 55000, '2025-05-05', 'Orange Money');
  addPay('PAL-S9', '2025-10', 50000, '2025-10-08', 'Orange Money');

  // 3. ANGRÉ MAHOU 2025
  for (let m = 1; m <= 12; m++) {
    const ym = periodKey(2025, m);
    ['ANG-S1', 'ANG-S2', 'ANG-S3', 'ANG-S7', 'ANG-S10'].forEach(id => addPay(id, ym, 70000, `${ym}-05`, 'Wave'));
    if (m <= 10) addPay('ANG-S4', ym, 70000, `${ym}-05`, 'MTN Mobile Money');
    addPay('ANG-S5', ym, (m >= 9 && m <= 11) ? 70000 : 80000, `${ym}-05`, 'Orange Money');
    if (m <= 11) addPay('ANG-S6', ym, 70000, `${ym}-05`, 'Wave');
  }
  addPay('ANG-S8', '2025-02', 120000, '2025-02-20', 'MTN Mobile Money');
  addPay('ANG-S8', '2025-04', 70000, '2025-05-05', 'MTN Mobile Money');
  addPay('ANG-S8', '2025-05', 80000, '2025-06-15', 'MTN Mobile Money');

  /* ── PAIEMENTS 2026 (issus du classeur Excel, à jour en Octobre 2026) ── */
  // 1. SIDECI KOTIBET : Jan-Août 2026 payés (2 000 000 FCFA), Sept-Déc non payés
  addPay('KOT-1', '2026-01', 250000, '2026-03-19', 'Espèces / Virement');
  addPay('KOT-1', '2026-02', 250000, '2026-03-19', 'Espèces / Virement');
  addPay('KOT-1', '2026-03', 250000, '2026-03-19', 'Espèces / Virement');
  addPay('KOT-1', '2026-04', 250000, '2026-04-24', 'Espèces / Virement');
  addPay('KOT-1', '2026-05', 250000, '2026-07-06', 'Espèces / Virement');
  addPay('KOT-1', '2026-06', 250000, '2026-07-06', 'Espèces / Virement');
  addPay('KOT-1', '2026-07', 250000, '2026-07-06', 'Espèces / Virement');
  addPay('KOT-1', '2026-08', 250000, '2026-07-06', 'Espèces / Virement');

  // 2. SIDECI PALAIS 2026 (Révision des loyers en Octobre 2026)
  for (let m = 1; m <= 9; m++) {
    const ym = periodKey(2026, m);
    addPay('PAL-S1', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-S2', ym, 50000, `${ym}-05`, 'Orange Money');
    if (m <= 8) addPay('PAL-S3', ym, 50000, `${ym}-05`, 'Orange Money', '07 09 50 04 44');
    addPay('PAL-S5', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-S6', ym, 50000, `${ym}-05`, 'Orange Money');
    addPay('PAL-S7', ym, 50000, `${ym}-05`, 'Wave');
    addPay('PAL-S8', ym, 50000, `${ym}-05`, 'MTN Mobile Money');
    addPay('PAL-S10', ym, m === 6 ? 49505 : 50000, `${ym}-05`, 'Wave');
    addPay('PAL-M1', ym, 130000, `${ym}-05`, 'Orange Money');
    addPay('PAL-M2', ym, 260000, `${ym}-05`, 'Espèces / Virement');
    addPay('PAL-M3', ym, 60000, `${ym}-05`, 'Wave');
    addPay('PAL-M4', ym, 60000, `${ym}-05`, 'Orange Money');
    addPay('PAL-M5', ym, m === 2 ? 60600 : 60000, `${ym}-05`, 'MTN Mobile Money');
    addPay('PAL-M6', ym, 70000, `${ym}-05`, 'Wave');
  }
  // Studio 4 (Koukougnon Bernadine) — versements irréguliers en 2026
  addPay('PAL-S4', '2026-01', 40000, '2026-01-13', 'MTN Mobile Money', '', 'Acompte Janvier');
  addPay('PAL-S4', '2026-02', 75000, '2026-02-07', 'MTN Mobile Money', '', 'Loyer Février + reliquat');
  addPay('PAL-S4', '2026-04', 110000, '2026-04-28', 'MTN Mobile Money', '', 'Règlement groupé');
  addPay('PAL-S4', '2026-05', 75000, '2026-05-05', 'MTN Mobile Money');
  addPay('PAL-S4', '2026-06', 55000, '2026-06-15', 'MTN Mobile Money');
  addPay('PAL-S4', '2026-07', 55000, '2026-07-08', 'MTN Mobile Money');
  addPay('PAL-S4', '2026-09', 75000, '2026-09-14', 'MTN Mobile Money');

  // Octobre 2026 — SIDECI PALAIS (nouveaux tarifs : Studios 70k, Mag1 160k, Mag2 310k, Mag3-5 75k, Mag6 90k)
  addPay('PAL-S1', '2026-10', 70000, '2026-10-16', 'Wave');
  // PAL-S2, PAL-S3, PAL-S4, PAL-S9 : non payés en Octobre 2026
  addPay('PAL-S5', '2026-10', 70000, '2026-10-08', 'Wave');
  addPay('PAL-S6', '2026-10', 70000, '2026-10-06', 'Orange Money');
  addPay('PAL-S7', '2026-10', 70000, '2026-10-03', 'Wave');
  addPay('PAL-S8', '2026-10', 70000, '2026-10-06', 'MTN Mobile Money');
  addPay('PAL-S10', '2026-10', 70000, '2026-10-11', 'Wave');
  addPay('PAL-M1', '2026-10', 160000, '2026-10-12', 'Orange Money');
  addPay('PAL-M2', '2026-10', 260000, '2026-10-11', 'Espèces / Virement', '', 'Ancien tarif versé (Reste 50 000 FCFA sur nouveau loyer 310 000)');
  addPay('PAL-M3', '2026-10', 75000, '2026-10-06', 'Wave');
  addPay('PAL-M4', '2026-10', 75000, '2026-10-13', 'Orange Money');
  addPay('PAL-M5', '2026-10', 75000, '2026-10-07', 'MTN Mobile Money');
  addPay('PAL-M6', '2026-10', 90000, '2026-10-03', 'Wave');

  // 3. SOGEFIHA 2026 : Aucun paiement enregistré dans le fichier Excel (100% en arriérés)

  // 4. ANGRÉ MAHOU 2026
  // Studio 1 (Djé Adjoua Romaine) : Sept & Oct payés à 100 000 FCFA
  addPay('ANG-S1', '2026-09', 100000, '2026-09-03', 'Wave');
  addPay('ANG-S1', '2026-10', 100000, '2026-10-06', 'Wave');
  // Studio 2 (Kouassi Amenani Nathalie) : Oct payé à 90 000 FCFA
  addPay('ANG-S2', '2026-10', 90000, '2026-10-06', 'Orange Money');
  // Studio 3 (Kouamé Ludovic) : Fév-Sept payés (70 000) + Oct payé (90 000)
  for (let m = 2; m <= 9; m++) addPay('ANG-S3', periodKey(2026, m), 70000, `2026-${pad2(m)}-09`, 'Wave');
  addPay('ANG-S3', '2026-10', 90000, '2026-10-10', 'Wave');
  // Studio 4 (Doua Monné Pristyl) : Sept & Oct payés à 100 000 FCFA
  addPay('ANG-S4', '2026-09', 100000, '2026-09-07', 'MTN Mobile Money');
  addPay('ANG-S4', '2026-10', 100000, '2026-10-14', 'MTN Mobile Money');
  // Studio 5 (Charlotte Vany) : Oct payé 80 000 sur 90 000 FCFA
  addPay('ANG-S5', '2026-10', 80000, '2026-10-11', 'Orange Money', '', 'Acompte Octobre (reste 10 000 FCFA)');
  // Studio 6 (Konan Anthelme) : Oct payé 90 000 FCFA
  addPay('ANG-S6', '2026-10', 90000, '2026-10-11', 'Wave');
  // Studio 7 (Mana Abdoulaye) : Oct payé 89 110 FCFA sur 90 000 FCFA (frais MM déduits, reste 890 FCFA)
  addPay('ANG-S7', '2026-10', 89110, '2026-10-06', 'Orange Money', '', 'Versement Mobile Money (reste 890 FCFA)');
  // Studio 8 (Soté Toussaint Dougoué) : Août, Sept, Oct payés à 100 000 FCFA
  addPay('ANG-S8', '2026-08', 100000, '2026-08-05', 'MTN Mobile Money');
  addPay('ANG-S8', '2026-09', 100000, '2026-09-09', 'MTN Mobile Money');
  addPay('ANG-S8', '2026-10', 100000, '2026-10-11', 'MTN Mobile Money');
  // Studio 9 (Hourry Désiré) : Oct payé 90 000 FCFA
  addPay('ANG-S9', '2026-10', 90000, '2026-10-09', 'Wave');
  // Studio 10 (Assemian Alfred) : Jan, Avr, Juin, Juil, Août, Sept (70k) + Oct (90k) payés
  [1, 4, 6, 7, 8, 9].forEach(m => addPay('ANG-S10', periodKey(2026, m), 70000, `2026-${pad2(m)}-10`, 'Orange Money'));
  addPay('ANG-S10', '2026-10', 90000, '2026-10-15', 'Orange Money');

  /* ── RÉPARATIONS & TRAVAUX PAR ZONE ── */
  const repairs = [
    { id: 'REP-1', tenantId: 'PAL-S9', title: 'Rénovation peinture & plomberie avant relocation Studio N°9', priority: 'haute', status: 'done', dateReported: '2026-08-15', estimatedCost: 125000, actualCost: 120000, contractor: 'Entreprise Bâtiment Yopougon', notes: 'Remise à neuf effectuée pour passage du loyer à 70 000 FCFA', dateDone: '2026-09-25' },
    { id: 'REP-2', tenantId: 'KOT-1', title: 'Entretien toiture et étanchéité Villa Yopougon Kotibet', priority: 'moyenne', status: 'inprogress', dateReported: '2026-10-05', estimatedCost: 180000, actualCost: 0, contractor: 'Technicien Koné', notes: 'Vérification saison des pluies', dateDone: null },
    { id: 'REP-3', tenantId: 'ANG-S1', title: 'Réfection peinture et serrure (entrée nouveau locataire)', priority: 'moyenne', status: 'done', dateReported: '2026-08-20', estimatedCost: 85000, actualCost: 85000, contractor: 'Artisan Yao', notes: 'Passage du loyer de 70 000 à 100 000 FCFA', dateDone: '2026-08-30' },
    { id: 'REP-4', tenantId: 'PAN-1', title: 'Vérification structure métallique & éclairage Panneau Dalle de Yopougon', priority: 'moyenne', status: 'todo', dateReported: '2026-10-12', estimatedCost: 95000, actualCost: 0, contractor: '', notes: 'Contrôle annuel des panneaux publicitaires sur la dalle de Yopougon', dateDone: null },
  ];

  /* ── IMPÔTS TRIMESTRIELS (275 000 FCFA / trimestre issus du fichier Excel) ── */
  const taxes = [
    // 2024 : 275 000 FCFA / trimestre (1 100 000 FCFA / an)
    {
      id: 'TAX-2024-1', year: 2024, quarter: 1, label: 'Impôt foncier trimestriel (Janv–Mars 2024)',
      amount: 275000, dueDate: '2024-03-31',
      payments: [{ id: 'TP-24-1', date: '2024-02-01', amount: 275000, mode: 'Virement / Chèque DGI', ref: 'DGI-2024-T1' }]
    },
    {
      id: 'TAX-2024-2', year: 2024, quarter: 2, label: 'Impôt foncier trimestriel (Avr–Juin 2024)',
      amount: 275000, dueDate: '2024-06-30',
      payments: [
        { id: 'TP-24-2a', date: '2024-04-04', amount: 93000, mode: 'Espèces / Guichet DGI', ref: 'DGI-2024-T2A' },
        { id: 'TP-24-2b', date: '2024-09-03', amount: 100000, mode: 'Espèces / Guichet DGI', ref: 'DGI-2024-T2B' }
      ]
    },
    {
      id: 'TAX-2024-3', year: 2024, quarter: 3, label: 'Impôt foncier trimestriel (Juil–Sept 2024)',
      amount: 275000, dueDate: '2024-09-30',
      payments: [{ id: 'TP-24-3', date: '2024-12-06', amount: 275000, mode: 'Régularisation DGI Déc. 2024', ref: 'DGI-2024-T3' }]
    },
    {
      id: 'TAX-2024-4', year: 2024, quarter: 4, label: 'Impôt foncier trimestriel (Oct–Déc 2024)',
      amount: 275000, dueDate: '2024-12-31',
      payments: [{ id: 'TP-24-4', date: '2024-12-11', amount: 275000, mode: 'Régularisation DGI Déc. 2024', ref: 'DGI-2024-T4' }]
    },

    // 2025 : 275 000 FCFA / trimestre (T1 payé, T2 payé 277 750 avec 2 750 de pénalité, T3 payé, T4 impayé)
    {
      id: 'TAX-2025-1', year: 2025, quarter: 1, label: 'Impôt foncier trimestriel (Janv–Mars 2025)',
      amount: 275000, dueDate: '2025-03-31',
      payments: [{ id: 'TP-25-1', date: '2024-12-06', amount: 275000, mode: 'Paiement anticipé DGI', ref: 'DGI-2025-T1' }]
    },
    {
      id: 'TAX-2025-2', year: 2025, quarter: 2, label: 'Impôt foncier trimestriel (Avr–Juin 2025 — incl. pénalité 2 750 FCFA)',
      amount: 275000, dueDate: '2025-06-30',
      payments: [{ id: 'TP-25-2', date: '2025-11-24', amount: 277750, mode: 'Guichet DGI (275 000 + 2 750 pénalité)', ref: 'DGI-2025-T2' }]
    },
    {
      id: 'TAX-2025-3', year: 2025, quarter: 3, label: 'Impôt foncier trimestriel (Juil–Sept 2025)',
      amount: 275000, dueDate: '2025-09-30',
      payments: [{ id: 'TP-25-3', date: '2026-06-04', amount: 275000, mode: 'Guichet DGI', ref: 'DGI-2025-T3' }]
    },
    {
      id: 'TAX-2025-4', year: 2025, quarter: 4, label: 'Impôt foncier trimestriel (Oct–Déc 2025)',
      amount: 275000, dueDate: '2025-12-31',
      payments: []
    },

    // 2026 : 275 000 FCFA / trimestre (1 100 000 FCFA / an — en attente de règlement dans le fichier Excel)
    {
      id: 'TAX-2026-1', year: 2026, quarter: 1, label: 'Impôt foncier trimestriel (Janv–Mars 2026)',
      amount: 275000, dueDate: '2026-03-31',
      payments: []
    },
    {
      id: 'TAX-2026-2', year: 2026, quarter: 2, label: 'Impôt foncier trimestriel (Avr–Juin 2026)',
      amount: 275000, dueDate: '2026-06-30',
      payments: []
    },
    {
      id: 'TAX-2026-3', year: 2026, quarter: 3, label: 'Impôt foncier trimestriel (Juil–Sept 2026)',
      amount: 275000, dueDate: '2026-09-30',
      payments: []
    },
    {
      id: 'TAX-2026-4', year: 2026, quarter: 4, label: 'Impôt foncier trimestriel (Oct–Déc 2026)',
      amount: 275000, dueDate: '2026-12-31',
      payments: []
    }
  ];

  return {
    tenants,
    payments,
    repairs,
    taxes,
    settings: {
      taxLateRate: 1.0,
      waveReceiverPhone: '0705180954',
      waveMerchantName: 'Ahyi Rent',
      jekoPaymentLink: 'https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b'
    }
  };
}

/* ── BASE DE DONNÉES (localStorage) ──────────────────────── */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedData();
      saveDB(seed);
      return seed;
    }
    const db = JSON.parse(raw);
    db.tenants = db.tenants || [];
    db.payments = db.payments || [];
    db.repairs = db.repairs || [];
    db.taxes = db.taxes || [];
    db.settings = {
      taxLateRate: 1.5,
      waveReceiverPhone: '0705180954',
      waveMerchantName: 'Ahyi Rent',
      jekoPaymentLink: 'https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b',
      ...(db.settings || {})
    };
    if (!db.settings.jekoPaymentLink) {
      db.settings.jekoPaymentLink = 'https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b';
    }
    delete db.settings.waveApiKey;
    delete db.settings.waveWebhookSecret;
    db.tenants.forEach(t => {
      if (t.unitNo === undefined) t.unitNo = '';
      if (!Array.isArray(t.rentHistory)) t.rentHistory = [];
      if (t.city === undefined) t.city = '';
      if (t.address === undefined) t.address = '';
      if (t.gps === undefined) t.gps = '';
      if (t.phone === undefined) t.phone = '';
    });
    db.taxes.forEach(x => { if (!Array.isArray(x.payments)) x.payments = []; });
    return db;
  } catch (e) {
    return createSeedData();
  }
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function resetDemoData() {
  if (!confirm('Restaurer les données de démonstration ? Toutes les saisies actuelles seront remplacées.')) return;
  saveDB(createSeedData());
  refreshAll();
}

/* ── LOYERS : MONTANTS & HISTORIQUE ──────────────────────── */
function getRentFor(t, ym) {
  const hist = (t.rentHistory || []).slice().sort((a, b) => a.from.localeCompare(b.from));
  if (!hist.length) return Number(t.monthlyRent) || 0;
  let amount = Number(hist[0].amount) || 0;
  hist.forEach(h => { if (h.from <= ym) amount = Number(h.amount) || 0; });
  return amount;
}

function setRentFrom(t, newAmount, fromYM) {
  newAmount = Number(newAmount) || 0;
  if (!fromYM) fromYM = getSelectedPeriodKey();
  if (getRentFor(t, fromYM) === newAmount) return false;
  if (!t.rentHistory) t.rentHistory = [];
  if (!t.rentHistory.length) {
    t.rentHistory.push({ from: (t.startDate || '2000-01-01').slice(0, 7), amount: Number(t.monthlyRent) || 0 });
  }
  t.rentHistory = t.rentHistory.filter(h => h.from !== fromYM);
  t.rentHistory.push({ from: fromYM, amount: newAmount });
  t.rentHistory.sort((a, b) => a.from.localeCompare(b.from));
  t.monthlyRent = t.rentHistory[t.rentHistory.length - 1].amount;
  return true;
}

/* ── CALCULS LOYERS ──────────────────────────────────────── */
function isTenantActiveInPeriod(t, ym) {
  const startYM = (t.startDate || '2000-01-01').slice(0, 7);
  if (ym < startYM) return false;
  if (t.status === 'stopped' && t.stopDate && ym > t.stopDate.slice(0, 7)) return false;
  return true;
}

function computeTenantMonthStatus(db, t, ym) {
  const active = isTenantActiveInPeriod(t, ym);
  const dueDay = Math.min(28, Math.max(1, Number(t.dueDay) || 5));
  const dueDate = `${ym}-${pad2(dueDay)}`;
  const txns = db.payments.filter(p => p.tenantId === t.id && p.period === ym);
  const paid = sum(txns, p => p.amount);
  const expected = active ? getRentFor(t, ym) : 0;
  const remaining = Math.max(0, expected - paid);
  const today = getTodayISO();
  const isLate = active && remaining > 0 && today > dueDate;
  const daysLate = isLate ? daysBetween(dueDate, today) : 0;
  const lastTxn = txns.slice().sort((a, b) => (b.datePaid || '').localeCompare(a.datePaid || ''))[0] || null;

  return { tenant: t, ym, active, dueDate, expected, paid, remaining, diff: paid - expected, txns, lastTxn, isLate, daysLate };
}

function computeMonthAggregate(db, ym) {
  const rows = db.tenants.map(t => computeTenantMonthStatus(db, t, ym));
  const activeRows = rows.filter(r => r.active);
  const expected = sum(activeRows, r => r.expected);
  const paid = sum(rows, r => r.paid);
  const remaining = sum(activeRows, r => r.remaining);
  return {
    ym, rows,
    activeCount: activeRows.length,
    stoppedCount: rows.length - activeRows.length,
    expected, paid, remaining,
    diff: paid - expected,
    rate: expected > 0 ? Math.round((paid / expected) * 100) : 0,
    lateRows: activeRows.filter(r => r.isLate)
  };
}

function computeYearAggregate(db, year) {
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(computeMonthAggregate(db, periodKey(year, m)));
  const expected = sum(months, m => m.expected);
  const paid = sum(months, m => m.paid);
  return {
    year, months, expected, paid,
    remaining: sum(months, m => m.remaining),
    activeTenantMonths: sum(months, m => m.activeCount),
    diff: paid - expected,
    rate: expected > 0 ? Math.round((paid / expected) * 100) : 0
  };
}

function computeTenantRange(db, t, year, m1, m2) {
  let expected = 0, paid = 0, remaining = 0, lateCount = 0, activeMonths = 0;
  for (let m = m1; m <= m2; m++) {
    const st = computeTenantMonthStatus(db, t, periodKey(year, m));
    expected += st.expected;
    paid += st.paid;
    remaining += st.remaining;
    if (st.isLate) lateCount++;
    if (st.active) activeMonths++;
  }
  return { expected, paid, remaining, lateCount, activeMonths };
}

/* ── CALCULS IMPÔTS & INTÉRÊTS DE RETARD ─────────────────── */
/*
 * Intérêts de retard = reste dû × taux mensuel × (jours de retard / 30),
 * calculés par tranche entre chaque paiement effectué après la date limite.
 * Les paiements règlent d'abord le montant principal, puis les intérêts.
 */
function computeTax(tax, ratePercent) {
  const amount = Number(tax.amount) || 0;
  const pays = (tax.payments || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const paid = sum(pays, p => p.amount);
  const r = (Number(ratePercent) || 0) / 100;
  const today = getTodayISO();

  let outstanding = amount;
  let cursor = tax.dueDate;
  let interest = 0;
  pays.forEach(p => {
    if (p.date > cursor) {
      if (outstanding > 0) interest += outstanding * r * daysBetween(cursor, p.date) / 30;
      cursor = p.date;
    }
    outstanding = Math.max(0, outstanding - (Number(p.amount) || 0));
  });
  if (outstanding > 0 && today > cursor) {
    interest += outstanding * r * daysBetween(cursor, today) / 30;
  }
  interest = Math.round(interest);

  const remaining = Math.max(0, amount - paid);
  const interestPaid = Math.max(0, paid - amount);
  const interestDue = Math.max(0, interest - interestPaid);
  const totalDue = remaining + interestDue;
  const daysLate = remaining > 0 && today > tax.dueDate ? daysBetween(tax.dueDate, today) : 0;

  let status = 'pending';
  if (totalDue === 0) status = 'paid';
  else if (remaining === 0 && interestDue > 0) status = 'interest';
  else if (today > tax.dueDate) status = 'late';
  else if (paid > 0) status = 'partial';

  return { tax, amount, paid, remaining, interest, interestPaid, interestDue, totalDue, daysLate, status };
}

function renderTaxBadge(c) {
  if (c.status === 'paid') return '<span class="badge badge-paid">Soldé</span>';
  if (c.status === 'interest') return '<span class="badge badge-late">Intérêts à régler</span>';
  if (c.status === 'late') return `<span class="badge badge-late">En retard (${c.daysLate}j)</span>`;
  if (c.status === 'partial') return '<span class="badge badge-partial">Partiel</span>';
  return '<span class="badge badge-pending">À venir</span>';
}

function getTaxesForYear(db, year) {
  return db.taxes
    .filter(x => Number(x.year) === Number(year))
    .sort((a, b) => a.quarter - b.quarter || a.label.localeCompare(b.label));
}

/* ── PÉRIODE & FILTRES ───────────────────────────────────── */
let selectedMonth = 1;
let selectedYear = 2026;

function initPeriodSelectors() {
  const now = new Date();
  selectedYear = now.getFullYear();
  selectedMonth = now.getMonth() + 1;

  document.getElementById('global-month').innerHTML = MONTHS_FR.map((name, i) =>
    `<option value="${i + 1}" ${i + 1 === selectedMonth ? 'selected' : ''}>${name}</option>`
  ).join('');

  const years = [];
  for (let y = 2024; y <= Math.max(2027, selectedYear + 1); y++) years.push(y);
  document.getElementById('global-year').innerHTML = years.map(y =>
    `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`
  ).join('');
}

function onPeriodChange() {
  selectedMonth = Number(document.getElementById('global-month').value);
  selectedYear = Number(document.getElementById('global-year').value);
  refreshAll();
}

function getSelectedPeriodKey() {
  return periodKey(selectedYear, selectedMonth);
}

function sortZonesOrder(zonesList) {
  return zonesList.slice().sort((a, b) => {
    const ia = OFFICIAL_SITES.indexOf(a);
    const ib = OFFICIAL_SITES.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'fr');
  });
}

function getZones(db) {
  const fromTenants = db.tenants.map(t => (t.city || '').trim()).filter(Boolean);
  const all = Array.from(new Set([...OFFICIAL_SITES, ...fromTenants]));
  return sortZonesOrder(all);
}

function populateZoneFilters(db) {
  const zones = getZones(db);
  ['zone-filter', 'rent-location-filter', 'tenant-filter-location', 'repair-filter-zone'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value || 'all';
    sel.innerHTML = `<option value="all">Toutes les zones (${zones.length})</option>` +
      zones.map(z => `<option value="${esc(z)}" ${z === prev ? 'selected' : ''}>📍 ${esc(z)}</option>`).join('');
  });
  const dl = document.getElementById('zones-datalist');
  if (dl) dl.innerHTML = zones.map(z => `<option value="${esc(z)}"></option>`).join('');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tabName}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-tab="${tabName}"]`)?.classList.add('active');
}

function renderStatusBadge(row) {
  if (!row.active) return '<span class="badge badge-stopped">Bail clôturé</span>';
  if (row.remaining === 0 && row.expected > 0) return '<span class="badge badge-paid">Soldé</span>';
  if (row.isLate && row.paid > 0) return `<span class="badge badge-late">Partiel · Retard ${row.daysLate}j</span>`;
  if (row.isLate) return `<span class="badge badge-late">En retard (${row.daysLate}j)</span>`;
  if (row.paid > 0) return '<span class="badge badge-partial">Partiel</span>';
  return '<span class="badge badge-pending">En attente</span>';
}

/* ── 1. VUE PAR ZONE ─────────────────────────────────────── */
function renderZoneRecap(db) {
  const mode = document.getElementById('zone-mode')?.value || 'month';
  const zoneFilter = document.getElementById('zone-filter')?.value || 'all';
  let m1 = selectedMonth, m2 = selectedMonth;
  let label = fmtPeriodLabel(getSelectedPeriodKey());
  if (mode === 'ytd') { m1 = 1; label = `Janvier → ${MONTHS_FR[selectedMonth - 1]} ${selectedYear}`; }
  if (mode === 'year') { m1 = 1; m2 = 12; label = `Année ${selectedYear} complète`; }
  document.getElementById('zone-period-title').textContent = label;

  const zones = {};
  db.tenants.forEach(t => {
    const zone = t.city || 'Zone non renseignée';
    if (zoneFilter !== 'all' && zone !== zoneFilter) return;
    const r = computeTenantRange(db, t, selectedYear, m1, m2);
    if (r.expected === 0 && r.paid === 0) return;
    (zones[zone] = zones[zone] || []).push({ t, r });
  });

  const zoneNames = sortZonesOrder(Object.keys(zones));
  let html = '';
  let gExp = 0, gPaid = 0, gRem = 0, gCount = 0;

  zoneNames.forEach(zone => {
    const items = zones[zone].sort((a, b) => (a.t.unitNo || '').localeCompare(b.t.unitNo || '', 'fr', { numeric: true }));
    const zExp = sum(items, i => i.r.expected);
    const zPaid = sum(items, i => i.r.paid);
    const zRem = sum(items, i => i.r.remaining);
    gExp += zExp; gPaid += zPaid; gRem += zRem; gCount += items.length;

    html += `<tr class="zone-header-row"><td colspan="9">📍 ${esc(zone)}<span>${items.length} logement(s)</span></td></tr>`;
    items.forEach(({ t, r }) => {
      let badge;
      if (r.remaining === 0) badge = '<span class="badge badge-paid">Soldé</span>';
      else if (r.lateCount > 0) badge = `<span class="badge badge-late">En retard${r.lateCount > 1 ? ` (${r.lateCount} mois)` : ''}</span>`;
      else if (r.paid > 0) badge = '<span class="badge badge-partial">Partiel</span>';
      else badge = '<span class="badge badge-pending">En attente</span>';
      if (t.status === 'stopped') badge += ' <span class="badge badge-stopped">Bail clôturé</span>';

      html += `
        <tr>
          <td>${renderUnitNo(t)}</td>
          <td>${esc(t.unit)}</td>
          <td><strong>${esc(t.name)}</strong></td>
          <td>${renderPhone(t)}</td>
          <td class="num">${fmtCFA(r.expected)}</td>
          <td class="num text-green">${fmtCFA(r.paid)}</td>
          <td class="num ${r.remaining > 0 ? 'text-amber' : 'text-muted'}"><strong>${fmtCFA(r.remaining)}</strong></td>
          <td>${badge}</td>
          <td>${(r.remaining > 0 && t.status === 'active') || r.paid > 0
            ? `<div style="display:flex; gap:5px; flex-wrap:wrap;">
                 ${r.remaining > 0 && t.status === 'active'
                   ? `<button class="btn btn-sm btn-primary" onclick="openJekoModal('${esc(t.id)}', '${getSelectedPeriodKey()}')">🔗 Jèko</button>
                      <button class="btn btn-sm btn-secondary" onclick="openPaymentModal('${esc(t.id)}', '${getSelectedPeriodKey()}')">Encaisser</button>`
                   : ''}
                 ${r.paid > 0
                   ? `<button class="btn btn-sm btn-danger" title="Retirer un paiement en cas d'erreur de saisie" onclick="deleteLastRentPaymentForMonth('${esc(t.id)}', '${getSelectedPeriodKey()}')">✕ Retirer paiement</button>`
                   : ''}
               </div>`
            : '<span class="text-muted">—</span>'}</td>
        </tr>`;
    });
    html += `
      <tr class="zone-subtotal-row">
        <td colspan="4">Sous-total ${esc(zone)}</td>
        <td class="num">${fmtCFA(zExp)}</td>
        <td class="num text-green">${fmtCFA(zPaid)}</td>
        <td class="num text-amber">${fmtCFA(zRem)}</td>
        <td colspan="2">${zExp > 0 ? Math.round((zPaid / zExp) * 100) : 0}% encaissé</td>
      </tr>`;
  });

  document.getElementById('zone-recap-tbody').innerHTML = html ||
    '<tr><td colspan="9" class="text-muted" style="text-align:center; padding:28px;">Aucun loyer sur cette période.</td></tr>';

  document.getElementById('zone-recap-tfoot').innerHTML = `
    <tr>
      <td colspan="4">TOTAL GÉNÉRAL — ${zoneNames.length} zone(s), ${gCount} logement(s)</td>
      <td class="num">${fmtCFA(gExp)}</td>
      <td class="num text-green">${fmtCFA(gPaid)}</td>
      <td class="num text-amber">${fmtCFA(gRem)}</td>
      <td colspan="2">${gExp > 0 ? Math.round((gPaid / gExp) * 100) : 0}% encaissé</td>
    </tr>`;
}

/* ── 1b. TABLEAU DE BORD : MOBILE MONEY, ALERTES, TOTAUX ─── */
function renderDashboard(db) {
  const ym = getSelectedPeriodKey();
  const mAgg = computeMonthAggregate(db, ym);
  const yAgg = computeYearAggregate(db, selectedYear);

  renderZoneRecap(db);

  // Mobile Money
  const yearPayments = db.payments.filter(p => p.period.startsWith(String(selectedYear)));
  const totalYear = sum(yearPayments, p => p.amount);
  document.getElementById('dash-mm-list').innerHTML = MM_PROVIDERS.map(prov => {
    const provSum = sum(yearPayments.filter(p => p.provider === prov.name), p => p.amount);
    const pct = totalYear > 0 ? Math.round((provSum / totalYear) * 100) : 0;
    return `
      <div class="mm-row-item">
        <div class="mm-row-top">
          <span><span class="mm-dot-inline" style="background:${prov.color}; margin-right:6px;"></span>${prov.name}</span>
          <span>${fmtCFA(provSum)} (${pct}%)</span>
        </div>
        <div class="mm-bar-bg"><div class="mm-bar-fill" style="width:${pct}%; background:${prov.color};"></div></div>
      </div>`;
  }).join('');

  // Alertes
  const lateRents = [];
  yAgg.months.forEach(m => m.lateRows.forEach(r => lateRents.push(r)));
  const rate = db.settings.taxLateRate;
  const taxCalcs = getTaxesForYear(db, selectedYear).map(x => computeTax(x, rate));
  const lateTaxes = taxCalcs.filter(c => c.status === 'late' || c.status === 'interest');
  const openRepairs = db.repairs.filter(r => r.status !== 'done');
  const urgentRepairs = openRepairs.filter(r => r.priority === 'haute');

  document.getElementById('nav-late-count').textContent = lateRents.length;
  document.getElementById('nav-repairs-count').textContent = openRepairs.length;
  document.getElementById('nav-taxes-count').textContent = lateTaxes.length;

  const alerts = [];
  lateTaxes.forEach(c => alerts.push(`
    <div class="alert-item">
      <div class="alert-info">
        <h4>Impôt T${c.tax.quarter} ${c.tax.year} — ${esc(c.tax.label)}</h4>
        <p>Reste ${fmtCFA(c.remaining)} + intérêts ${fmtCFA(c.interestDue)} · Total : <strong>${fmtCFA(c.totalDue)}</strong></p>
      </div>
      <button class="btn btn-sm btn-primary" onclick="openTaxPaymentModal('${c.tax.id}')">Payer</button>
    </div>`));
  lateRents.slice(0, 5).forEach(r => alerts.push(`
    <div class="alert-item">
      <div class="alert-info">
        <h4>${r.tenant.unitNo ? 'N° ' + esc(r.tenant.unitNo) + ' — ' : ''}${esc(r.tenant.name)} · ${fmtPeriodLabel(r.ym)}</h4>
        <p>${esc(r.tenant.city)} · Retard ${r.daysLate}j · Reste : <strong>${fmtCFA(r.remaining)}</strong></p>
      </div>
      <button class="btn btn-sm btn-primary" onclick="openPaymentModal('${r.tenant.id}', '${r.ym}')">Encaisser</button>
    </div>`));
  urgentRepairs.forEach(rep => {
    const t = db.tenants.find(x => x.id === rep.tenantId);
    alerts.push(`
      <div class="alert-item alert-stop">
        <div class="alert-info">
          <h4>Réparation urgente : ${esc(rep.title)}</h4>
          <p>${t ? `N° ${esc(t.unitNo)} — ${esc(t.city)}` : ''} · Estimé ${fmtCFA(rep.estimatedCost)}</p>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="switchTab('repairs')">Voir</button>
      </div>`);
  });
  db.tenants.filter(t => t.status === 'stopped').forEach(t => alerts.push(`
    <div class="alert-item alert-stop">
      <div class="alert-info">
        <h4>Bail arrêté : N° ${esc(t.unitNo)} — ${esc(t.name)}</h4>
        <p>${esc(t.unit)} (${esc(t.city)}) · Fin le ${fmtDateFR(t.stopDate)}</p>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="switchTab('tenants')">Voir</button>
    </div>`));

  document.getElementById('dash-alerts-box').innerHTML = alerts.length
    ? alerts.join('') : '<p class="text-muted">Aucune alerte.</p>';

  // Totaux en bas de page
  document.getElementById('totals-sub').textContent =
    `Période : ${fmtPeriodLabel(ym)} · Année ${selectedYear} · ${mAgg.activeCount} logement(s) occupé(s), ${mAgg.stoppedCount} clôturé(s)`;
  document.getElementById('kpi-month-lbl').textContent = `Total à payer (${MONTHS_SHORT[selectedMonth - 1]} ${selectedYear})`;
  document.getElementById('kpi-month-expected').textContent = fmtCFA(mAgg.expected);
  document.getElementById('kpi-active-tenants-sub').textContent = `${mAgg.activeCount} logement(s) actif(s)`;
  document.getElementById('kpi-month-paid').textContent = fmtCFA(mAgg.paid);
  document.getElementById('kpi-month-rate').textContent = `Taux de recouvrement : ${mAgg.rate}%`;
  document.getElementById('kpi-month-remaining').textContent = fmtCFA(mAgg.remaining);
  const diffEl = document.getElementById('kpi-month-diff');
  diffEl.textContent = `Différence du mois : ${fmtCFA(mAgg.diff, true)}`;
  diffEl.className = 'kpi-sub ' + (mAgg.diff >= 0 ? 'text-green' : 'text-red');
  document.getElementById('kpi-year-lbl').textContent = `Encaissé (Année ${selectedYear})`;
  document.getElementById('kpi-year-paid').textContent = fmtCFA(yAgg.paid);
  document.getElementById('kpi-year-diff').textContent = `Sur ${fmtCFA(yAgg.expected)} · Reste : ${fmtCFA(yAgg.remaining)}`;

  document.getElementById('kpi-repairs').textContent = fmtCFA(sum(openRepairs, r => r.estimatedCost));
  document.getElementById('kpi-repairs-sub').textContent = `${openRepairs.length} réparation(s) ouverte(s) · ${urgentRepairs.length} urgente(s)`;

  document.getElementById('kpi-taxes-lbl').textContent = `Impôts reste à payer (${selectedYear})`;
  document.getElementById('kpi-taxes').textContent = fmtCFA(sum(taxCalcs, c => c.totalDue));
  document.getElementById('kpi-taxes-sub').textContent = `Dont intérêts de retard : ${fmtCFA(sum(taxCalcs, c => c.interestDue))}`;
}

/* ── 2. REGISTRE DES LOYERS ──────────────────────────────── */
function renderRentsTable() {
  const db = loadDB();
  const ym = getSelectedPeriodKey();
  const mAgg = computeMonthAggregate(db, ym);
  document.getElementById('rents-period-title').textContent = fmtPeriodLabel(ym);

  const search = (document.getElementById('rent-search')?.value || '').toLowerCase();
  const locFilter = document.getElementById('rent-location-filter')?.value || 'all';
  const statusFilter = document.getElementById('rent-status-filter')?.value || 'all';

  const filtered = mAgg.rows.filter(r => {
    const t = r.tenant;
    if (search && !`${t.unitNo} ${t.name} ${t.unit} ${t.city} ${t.address}`.toLowerCase().includes(search)) return false;
    if (locFilter !== 'all' && t.city !== locFilter) return false;
    if (statusFilter === 'paid' && !(r.active && r.remaining === 0)) return false;
    if (statusFilter === 'partial' && !(r.active && r.paid > 0 && r.remaining > 0)) return false;
    if (statusFilter === 'late' && !r.isLate) return false;
    if (statusFilter === 'pending' && !(r.active && r.paid === 0 && !r.isLate)) return false;
    if (statusFilter === 'stopped' && r.active) return false;
    return true;
  }).sort((a, b) => (a.tenant.city || '').localeCompare(b.tenant.city || '') ||
    (a.tenant.unitNo || '').localeCompare(b.tenant.unitNo || '', 'fr', { numeric: true }));

  document.getElementById('rents-full-tbody').innerHTML = filtered.map(r => `
    <tr>
      <td>${renderUnitNo(r.tenant)}</td>
      <td>
        <strong>${esc(r.tenant.name)}</strong>
        <div class="text-gold" style="font-size:0.75rem; font-weight:600;">${esc(r.tenant.unit)}</div>
        <div class="text-muted" style="font-size:0.72rem;">${renderPhone(r.tenant)}</div>
      </td>
      <td>${renderLocationCell(r.tenant)}</td>
      <td>${r.active ? fmtDateFR(r.dueDate) : '<span class="text-muted">Contrat arrêté</span>'}</td>
      <td>${r.lastTxn ? fmtDateFR(r.lastTxn.datePaid) : '<span class="text-muted">Aucun</span>'}</td>
      <td>${renderMMPill(r.lastTxn ? r.lastTxn.provider : r.tenant.prefMM)}</td>
      <td class="num">${fmtCFA(r.expected)}</td>
      <td class="num text-green"><strong>${fmtCFA(r.paid)}</strong></td>
      <td class="num ${r.remaining > 0 ? 'text-amber' : 'text-muted'}"><strong>${fmtCFA(r.remaining)}</strong></td>
      <td class="num ${r.diff < 0 ? 'text-red' : 'text-green'}">${fmtCFA(r.diff, true)}</td>
      <td>${renderStatusBadge(r)}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${r.active && r.remaining > 0 ? `<button class="btn btn-sm btn-primary" onclick="openJekoModal('${esc(r.tenant.id)}', '${ym}')">🔗 Jèko</button>` : ''}
          ${r.active && r.remaining > 0 ? `<button class="btn btn-sm btn-secondary" onclick="openPaymentModal('${esc(r.tenant.id)}', '${ym}')">Encaisser</button>` : ''}
          ${r.paid > 0 ? `<button class="btn btn-sm btn-ghost" onclick="openReceiptForMonth('${esc(r.tenant.id)}', '${ym}')">Quittance</button>` : ''}
          ${r.paid > 0 ? `<button class="btn btn-sm btn-danger" title="Retirer un paiement en cas d'erreur de saisie" onclick="deleteLastRentPaymentForMonth('${esc(r.tenant.id)}', '${ym}')">✕ Retirer</button>` : ''}
        </div>
      </td>
    </tr>`).join('');

  const totExp = sum(filtered, r => r.expected);
  const totPaid = sum(filtered, r => r.paid);
  const totRem = sum(filtered, r => r.remaining);
  document.getElementById('rents-full-tfoot').innerHTML = `
    <tr>
      <td colspan="6">TOTAL — ${filtered.length} logement(s)</td>
      <td class="num">${fmtCFA(totExp)}</td>
      <td class="num text-green">${fmtCFA(totPaid)}</td>
      <td class="num text-amber">${fmtCFA(totRem)}</td>
      <td class="num ${totPaid - totExp < 0 ? 'text-red' : 'text-green'}">${fmtCFA(totPaid - totExp, true)}</td>
      <td colspan="2">Recouvrement : ${totExp > 0 ? Math.round((totPaid / totExp) * 100) : 0}%</td>
    </tr>`;
}

/* ── 3. DIFFÉRENCES MOIS / ANNÉE ─────────────────────────── */
function renderAnalyticsTab(db) {
  document.getElementById('analytics-year-label').textContent = selectedYear;
  const yAgg = computeYearAggregate(db, selectedYear);
  const maxVal = Math.max(1, ...yAgg.months.map(m => Math.max(m.expected, m.paid)));

  document.getElementById('monthly-bars-chart').innerHTML = yAgg.months.map((m, i) => `
    <div class="mbar-col" title="${MONTHS_FR[i]} ${selectedYear} — À payer : ${fmtCFA(m.expected)} | Payé : ${fmtCFA(m.paid)} | Reste : ${fmtCFA(m.remaining)}">
      <div class="mbar-pair">
        <div class="mbar mbar-expected" style="height:${Math.round((m.expected / maxVal) * 100)}%;"></div>
        <div class="mbar mbar-paid ${m.paid >= m.expected && m.expected > 0 ? '' : 'incomplete'}" style="height:${Math.round((m.paid / maxVal) * 100)}%;"></div>
      </div>
      <span class="mbar-lbl">${MONTHS_SHORT[i]}</span>
    </div>`).join('');

  document.getElementById('monthly-comparison-tbody').innerHTML = yAgg.months.map((m, idx) => {
    const vsPrev = idx > 0 ? m.paid - yAgg.months[idx - 1].paid : 0;
    return `
      <tr style="${idx + 1 === selectedMonth ? 'background:rgba(30,136,229,0.08);' : ''}">
        <td><strong>${MONTHS_FR[idx]} ${selectedYear}</strong></td>
        <td class="num">${m.activeCount}</td>
        <td class="num">${fmtCFA(m.expected)}</td>
        <td class="num text-green"><strong>${fmtCFA(m.paid)}</strong></td>
        <td class="num ${m.remaining > 0 ? 'text-amber' : 'text-muted'}"><strong>${fmtCFA(m.remaining)}</strong></td>
        <td class="num ${m.diff < 0 ? 'text-red' : 'text-green'}"><strong>${fmtCFA(m.diff, true)}</strong></td>
        <td class="num ${vsPrev < 0 ? 'text-amber' : 'text-green'}">${idx === 0 ? '—' : fmtCFA(vsPrev, true)}</td>
        <td><span class="badge ${m.rate === 100 ? 'badge-paid' : m.rate > 0 ? 'badge-partial' : 'badge-stopped'}">${m.rate}%</span></td>
      </tr>`;
  }).join('');

  document.getElementById('monthly-comparison-tfoot').innerHTML = `
    <tr>
      <td>TOTAL ${selectedYear}</td>
      <td class="num">${yAgg.activeTenantMonths}</td>
      <td class="num">${fmtCFA(yAgg.expected)}</td>
      <td class="num text-green">${fmtCFA(yAgg.paid)}</td>
      <td class="num text-amber">${fmtCFA(yAgg.remaining)}</td>
      <td class="num ${yAgg.diff < 0 ? 'text-red' : 'text-green'}">${fmtCFA(yAgg.diff, true)}</td>
      <td class="num">—</td>
      <td><strong>${yAgg.rate}%</strong></td>
    </tr>`;

  const years = Array.from(document.getElementById('global-year').options).map(o => Number(o.value));
  const yearAggs = years.map(y => computeYearAggregate(db, y));
  document.getElementById('yearly-comparison-tbody').innerHTML = yearAggs.map(a => `
    <tr style="${a.year === selectedYear ? 'background:rgba(30,136,229,0.08);' : ''}">
      <td><strong>Année ${a.year}</strong></td>
      <td class="num">${a.activeTenantMonths}</td>
      <td class="num">${fmtCFA(a.expected)}</td>
      <td class="num text-green"><strong>${fmtCFA(a.paid)}</strong></td>
      <td class="num ${a.remaining > 0 ? 'text-amber' : 'text-muted'}"><strong>${fmtCFA(a.remaining)}</strong></td>
      <td class="num ${a.diff < 0 ? 'text-red' : 'text-green'}"><strong>${fmtCFA(a.diff, true)}</strong></td>
      <td><span class="badge ${a.rate >= 90 ? 'badge-paid' : a.rate >= 50 ? 'badge-partial' : 'badge-late'}">${a.rate}%</span></td>
    </tr>`).join('');

  const tExp = sum(yearAggs, a => a.expected);
  const tPaid = sum(yearAggs, a => a.paid);
  document.getElementById('yearly-comparison-tfoot').innerHTML = `
    <tr>
      <td>TOTAL TOUTES ANNÉES</td>
      <td class="num">${sum(yearAggs, a => a.activeTenantMonths)}</td>
      <td class="num">${fmtCFA(tExp)}</td>
      <td class="num text-green">${fmtCFA(tPaid)}</td>
      <td class="num text-amber">${fmtCFA(sum(yearAggs, a => a.remaining))}</td>
      <td class="num ${tPaid - tExp < 0 ? 'text-red' : 'text-green'}">${fmtCFA(tPaid - tExp, true)}</td>
      <td><strong>${tExp > 0 ? Math.round((tPaid / tExp) * 100) : 0}%</strong></td>
    </tr>`;
}

/* ── 4. RETARDS ──────────────────────────────────────────── */
function renderLateTab(db) {
  document.getElementById('late-year-lbl').textContent = selectedYear;
  const items = [];
  for (let m = 1; m <= 12; m++) computeMonthAggregate(db, periodKey(selectedYear, m)).lateRows.forEach(r => items.push(r));

  document.getElementById('late-payments-tbody').innerHTML = items.length ? items.map(r => `
    <tr>
      <td><strong>${fmtPeriodLabel(r.ym)}</strong></td>
      <td>${renderUnitNo(r.tenant)}</td>
      <td><strong>${esc(r.tenant.name)}</strong><div class="text-muted" style="font-size:0.73rem;">${renderPhone(r.tenant)}</div></td>
      <td><div class="text-gold" style="font-weight:600; font-size:0.79rem;">${esc(r.tenant.unit)}</div>${renderLocationCell(r.tenant)}</td>
      <td>${fmtDateFR(r.dueDate)}</td>
      <td><span class="badge badge-late">+${r.daysLate} jours</span></td>
      <td class="num">${fmtCFA(r.expected)}</td>
      <td class="num text-green">${fmtCFA(r.paid)}</td>
      <td class="num text-red"><strong>${fmtCFA(r.remaining)}</strong></td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" onclick="openJekoModal('${esc(r.tenant.id)}', '${r.ym}')">🔗 Lien &amp; QR Jèko</button>
          <button class="btn btn-sm btn-secondary" onclick="openPaymentModal('${esc(r.tenant.id)}', '${r.ym}')">Régulariser</button>
          <button class="btn btn-sm btn-ghost" onclick="openReminderModal('${esc(r.tenant.id)}', '${r.ym}')">Relancer</button>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="10" class="text-muted" style="text-align:center; padding:28px;">Aucun retard de paiement en ${selectedYear}.</td></tr>`;

  document.getElementById('late-payments-tfoot').innerHTML = `
    <tr>
      <td colspan="6">TOTAL DES RETARDS — ${items.length} dossier(s)</td>
      <td class="num">${fmtCFA(sum(items, r => r.expected))}</td>
      <td class="num text-green">${fmtCFA(sum(items, r => r.paid))}</td>
      <td class="num text-red">${fmtCFA(sum(items, r => r.remaining))}</td>
      <td></td>
    </tr>`;
}

/* ── 5. MOBILE MONEY ─────────────────────────────────────── */
function renderMobileMoneyTab() {
  const db = loadDB();
  const filterProv = document.getElementById('mm-filter-provider')?.value || 'all';
  const list = db.payments
    .filter(p => p.period.startsWith(String(selectedYear)))
    .filter(p => filterProv === 'all' || p.provider === filterProv)
    .sort((a, b) => (b.datePaid || '').localeCompare(a.datePaid || ''));

  document.getElementById('mm-transactions-tbody').innerHTML = list.map(p => {
    const t = db.tenants.find(x => x.id === p.tenantId);
    const st = t ? computeTenantMonthStatus(db, t, p.period) : null;
    return `
      <tr>
        <td><strong>${fmtDateFR(p.datePaid)}</strong></td>
        <td><code style="font-size:0.75rem; color:var(--primary);">${esc(p.ref)}</code></td>
        <td>${renderUnitNo(t)}</td>
        <td><strong>${t ? esc(t.name) : 'Inconnu'}</strong><div class="text-muted" style="font-size:0.73rem;">${t ? `${esc(t.unit)} · 📍 ${esc(t.city)}` : ''}</div></td>
        <td>${fmtPeriodLabel(p.period)}</td>
        <td>${renderMMPill(p.provider)}</td>
        <td>${p.phone ? esc(p.phone) : '<span class="text-muted">—</span>'}</td>
        <td class="num text-green"><strong>${fmtCFA(p.amount)}</strong></td>
        <td class="num ${st && st.remaining > 0 ? 'text-amber' : 'text-muted'}">${st ? fmtCFA(st.remaining) : '—'}</td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-sm btn-ghost" onclick="openReceiptForMonth('${esc(p.tenantId)}', '${esc(p.period)}')">Quittance</button>
            <button class="btn btn-sm btn-danger" title="Retirer ce paiement (erreur de saisie)" onclick="deleteRentPayment('${esc(p.id)}')">✕ Retirer</button>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td colspan="10" class="text-muted" style="text-align:center; padding:28px;">Aucun paiement.</td></tr>`;

  document.getElementById('mm-transactions-tfoot').innerHTML = `
    <tr>
      <td colspan="7">TOTAL ENCAISSÉ ${selectedYear} — ${list.length} transaction(s)</td>
      <td class="num text-green">${fmtCFA(sum(list, p => p.amount))}</td>
      <td colspan="2"></td>
    </tr>`;

  const yearPays = db.payments.filter(p => p.period.startsWith(String(selectedYear)));
  document.getElementById('mm-providers-cards').innerHTML = MM_PROVIDERS.map(prov => {
    const txns = yearPays.filter(p => p.provider === prov.name);
    return `
      <div class="mm-provider-card" style="border-top: 2px solid ${prov.color};">
        <div style="display:flex; align-items:center; gap:7px;">
          <span class="mm-dot-inline" style="background:${prov.color};"></span>
          <strong style="font-size:0.82rem;">${prov.name}</strong>
        </div>
        <div class="mmp-amount">${fmtCFA(sum(txns, p => p.amount))}</div>
        <div class="mmp-count">${txns.length} transaction(s) en ${selectedYear}</div>
      </div>`;
  }).join('');
}

/* ── 6. RÉPARATIONS ──────────────────────────────────────── */
function renderRepairsTab() {
  const db = loadDB();
  const statusF = document.getElementById('repair-filter-status')?.value || 'open';
  const zoneF = document.getElementById('repair-filter-zone')?.value || 'all';

  const list = db.repairs.filter(rep => {
    const t = db.tenants.find(x => x.id === rep.tenantId);
    if (statusF === 'open' && rep.status === 'done') return false;
    if (['todo', 'inprogress', 'done'].includes(statusF) && rep.status !== statusF) return false;
    if (zoneF !== 'all' && (!t || t.city !== zoneF)) return false;
    return true;
  }).sort((a, b) => {
    const pr = { haute: 0, moyenne: 1, basse: 2 };
    return (a.status === 'done') - (b.status === 'done') || pr[a.priority] - pr[b.priority] || (b.dateReported || '').localeCompare(a.dateReported || '');
  });

  document.getElementById('repairs-tbody').innerHTML = list.map(rep => {
    const t = db.tenants.find(x => x.id === rep.tenantId);
    const st = REPAIR_STATUS[rep.status] || REPAIR_STATUS.todo;
    const pr = REPAIR_PRIORITY[rep.priority] || REPAIR_PRIORITY.moyenne;
    return `
      <tr>
        <td>${fmtDateFR(rep.dateReported)}</td>
        <td>${renderUnitNo(t)}</td>
        <td>${t ? `<strong>${esc(t.unit)}</strong><div class="text-muted" style="font-size:0.73rem;">📍 ${esc(t.city)}</div>` : '—'}</td>
        <td><strong>${esc(rep.title)}</strong>${rep.notes ? `<div class="text-muted" style="font-size:0.73rem;">${esc(rep.notes)}</div>` : ''}</td>
        <td><span class="badge ${pr.cls}">${pr.label}</span></td>
        <td>${rep.contractor ? esc(rep.contractor) : '<span class="text-muted">—</span>'}</td>
        <td class="num">${fmtCFA(rep.estimatedCost)}</td>
        <td class="num">${rep.actualCost ? fmtCFA(rep.actualCost) : '<span class="text-muted">—</span>'}</td>
        <td><span class="badge ${st.cls}">${st.label}</span>${rep.dateDone ? `<div class="text-muted" style="font-size:0.7rem;">le ${fmtDateFR(rep.dateDone)}</div>` : ''}</td>
        <td>
          <div style="display:flex; gap:6px;">
            ${rep.status !== 'done' ? `<button class="btn btn-sm btn-primary" onclick="markRepairDone('${rep.id}')">Terminer</button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="openRepairModal('${rep.id}')">Modifier</button>
            <button class="btn btn-sm btn-danger" onclick="deleteRepair('${rep.id}')">✕</button>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td colspan="10" class="text-muted" style="text-align:center; padding:28px;">Aucune réparation.</td></tr>`;

  document.getElementById('repairs-tfoot').innerHTML = `
    <tr>
      <td colspan="6">TOTAL — ${list.length} réparation(s) · ${list.filter(r => r.status !== 'done').length} à faire / en cours</td>
      <td class="num">${fmtCFA(sum(list, r => r.estimatedCost))}</td>
      <td class="num">${fmtCFA(sum(list, r => r.actualCost))}</td>
      <td colspan="2"></td>
    </tr>`;
}

function openRepairModal(repairId = null, tenantId = null) {
  const db = loadDB();
  const rep = repairId ? db.repairs.find(r => r.id === repairId) : null;
  const tid = rep ? rep.tenantId : tenantId;

  document.getElementById('repair-modal-title').textContent = rep ? 'Modifier la Réparation' : 'Nouvelle Réparation';
  document.getElementById('rep-tenant').innerHTML = db.tenants
    .slice().sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.unitNo || '').localeCompare(b.unitNo || '', 'fr', { numeric: true }))
    .map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${esc(tenantOptionLabel(t))}</option>`).join('');
  document.getElementById('rep-id').value = rep ? rep.id : '';
  document.getElementById('rep-title').value = rep ? rep.title : '';
  document.getElementById('rep-priority').value = rep ? rep.priority : 'moyenne';
  document.getElementById('rep-status').value = rep ? rep.status : 'todo';
  document.getElementById('rep-date').value = rep ? rep.dateReported : getTodayISO();
  document.getElementById('rep-estimated').value = rep ? (rep.estimatedCost || '') : '';
  document.getElementById('rep-actual').value = rep ? (rep.actualCost || '') : '';
  document.getElementById('rep-contractor').value = rep ? (rep.contractor || '') : '';
  document.getElementById('rep-notes').value = rep ? (rep.notes || '') : '';
  document.getElementById('repair-modal').classList.add('open');
}

function submitRepair(e) {
  e.preventDefault();
  const db = loadDB();
  const id = document.getElementById('rep-id').value;
  const status = document.getElementById('rep-status').value;
  const payload = {
    tenantId: document.getElementById('rep-tenant').value,
    title: document.getElementById('rep-title').value.trim(),
    priority: document.getElementById('rep-priority').value,
    status,
    dateReported: document.getElementById('rep-date').value,
    estimatedCost: Number(document.getElementById('rep-estimated').value) || 0,
    actualCost: Number(document.getElementById('rep-actual').value) || 0,
    contractor: document.getElementById('rep-contractor').value.trim(),
    notes: document.getElementById('rep-notes').value.trim(),
  };

  if (id) {
    const rep = db.repairs.find(r => r.id === id);
    if (rep) {
      Object.assign(rep, payload);
      if (status === 'done' && !rep.dateDone) rep.dateDone = getTodayISO();
      if (status !== 'done') rep.dateDone = null;
    }
  } else {
    db.repairs.push({ id: 'REP-' + Date.now(), ...payload, dateDone: status === 'done' ? getTodayISO() : null });
  }
  saveDB(db);
  closeModal('repair-modal');
  refreshAll();
}

function markRepairDone(id) {
  const db = loadDB();
  const rep = db.repairs.find(r => r.id === id);
  if (!rep) return;
  const input = prompt(`Coût réel de la réparation « ${rep.title} » (FCFA) :`, rep.actualCost || rep.estimatedCost || 0);
  if (input === null) return;
  rep.actualCost = Number(String(input).replace(/\s/g, '')) || 0;
  rep.status = 'done';
  rep.dateDone = getTodayISO();
  saveDB(db);
  refreshAll();
}

function deleteRepair(id) {
  if (!confirm('Supprimer cette réparation ?')) return;
  const db = loadDB();
  db.repairs = db.repairs.filter(r => r.id !== id);
  saveDB(db);
  refreshAll();
}

/* ── 7. IMPÔTS TRIMESTRIELS ──────────────────────────────── */
function renderTaxesTab(db) {
  const rate = db.settings.taxLateRate;
  document.getElementById('tax-year-lbl').textContent = selectedYear;
  document.getElementById('tax-hist-year-lbl').textContent = selectedYear;
  const rateInput = document.getElementById('tax-rate');
  if (rateInput && document.activeElement !== rateInput) rateInput.value = rate;
  document.getElementById('tax-rate-note').innerHTML =
    `Intérêt de retard appliqué : <strong>${rate}% par mois</strong>, calculé au prorata des jours sur le reste à payer après la date limite. ` +
    `Les paiements règlent d'abord le montant principal, puis les intérêts.`;

  const calcs = getTaxesForYear(db, selectedYear).map(x => computeTax(x, rate));

  // Cartes par trimestre
  document.getElementById('tax-quarter-cards').innerHTML = [1, 2, 3, 4].map(q => {
    const qc = calcs.filter(c => Number(c.tax.quarter) === q);
    const late = qc.some(c => c.status === 'late' || c.status === 'interest');
    const due = qc.length ? qc.map(c => fmtDateFR(c.tax.dueDate)).filter((v, i, a) => a.indexOf(v) === i).join(', ') : '—';
    let badge = '<span class="badge badge-stopped">Aucun impôt</span>';
    if (qc.length) {
      const total = sum(qc, c => c.totalDue);
      badge = total === 0 ? '<span class="badge badge-paid">Soldé</span>'
        : late ? '<span class="badge badge-late">En retard</span>'
        : sum(qc, c => c.paid) > 0 ? '<span class="badge badge-partial">Partiel</span>'
        : '<span class="badge badge-pending">À venir</span>';
    }
    return `
      <div class="quarter-card ${late ? 'qc-late' : ''}">
        <div class="qc-head"><span class="qc-title">T${q} ${selectedYear}</span>${badge}</div>
        <div class="qc-line"><span>Date limite</span><span>${due}</span></div>
        <div class="qc-line"><span>À payer</span><strong>${fmtCFA(sum(qc, c => c.amount))}</strong></div>
        <div class="qc-line"><span>Déjà payé</span><strong class="text-green">${fmtCFA(sum(qc, c => c.paid))}</strong></div>
        <div class="qc-line"><span>Reste à payer</span><strong class="text-amber">${fmtCFA(sum(qc, c => c.remaining))}</strong></div>
        <div class="qc-line"><span>Intérêts de retard</span><strong class="text-red">${fmtCFA(sum(qc, c => c.interestDue))}</strong></div>
        <div class="qc-line qc-total"><span>Total à régler</span><strong>${fmtCFA(sum(qc, c => c.totalDue))}</strong></div>
      </div>`;
  }).join('');

  // Tableau détaillé
  document.getElementById('taxes-tbody').innerHTML = calcs.map(c => `
    <tr>
      <td><strong>T${c.tax.quarter} ${c.tax.year}</strong></td>
      <td>${esc(c.tax.label)}</td>
      <td>${fmtDateFR(c.tax.dueDate)}</td>
      <td class="num">${fmtCFA(c.amount)}</td>
      <td class="num text-green">${fmtCFA(c.paid)}</td>
      <td class="num ${c.remaining > 0 ? 'text-amber' : 'text-muted'}"><strong>${fmtCFA(c.remaining)}</strong></td>
      <td>${c.daysLate > 0 ? `<span class="badge badge-late">+${c.daysLate} jours</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="num ${c.interestDue > 0 ? 'text-red' : 'text-muted'}">
        ${fmtCFA(c.interestDue)}
        ${c.interestPaid > 0 ? `<div class="text-muted" style="font-size:0.7rem;">(${fmtCFA(c.interestPaid)} déjà réglés)</div>` : ''}
      </td>
      <td class="num"><strong>${fmtCFA(c.totalDue)}</strong></td>
      <td>${renderTaxBadge(c)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${c.totalDue > 0 ? `<button class="btn btn-sm btn-primary" onclick="openTaxPaymentModal('${c.tax.id}')">Payer</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="openTaxModal('${c.tax.id}')">Modifier</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTax('${c.tax.id}')">✕</button>
        </div>
      </td>
    </tr>`).join('') ||
    `<tr><td colspan="11" class="text-muted" style="text-align:center; padding:28px;">Aucun impôt saisi pour ${selectedYear}. Cliquez sur « + Ajouter un impôt ».</td></tr>`;

  document.getElementById('taxes-tfoot').innerHTML = `
    <tr>
      <td colspan="3">TOTAL IMPÔTS ${selectedYear}</td>
      <td class="num">${fmtCFA(sum(calcs, c => c.amount))}</td>
      <td class="num text-green">${fmtCFA(sum(calcs, c => c.paid))}</td>
      <td class="num text-amber">${fmtCFA(sum(calcs, c => c.remaining))}</td>
      <td></td>
      <td class="num text-red">${fmtCFA(sum(calcs, c => c.interestDue))}</td>
      <td class="num">${fmtCFA(sum(calcs, c => c.totalDue))}</td>
      <td colspan="2"></td>
    </tr>`;

  // Historique des paiements
  const hist = [];
  calcs.forEach(c => (c.tax.payments || []).forEach(p => hist.push({ tax: c.tax, p })));
  hist.sort((a, b) => (b.p.date || '').localeCompare(a.p.date || ''));
  document.getElementById('tax-payments-tbody').innerHTML = hist.map(({ tax, p }) => `
    <tr>
      <td><strong>${fmtDateFR(p.date)}</strong></td>
      <td>T${tax.quarter} ${tax.year}</td>
      <td>${esc(tax.label)}</td>
      <td>${esc(p.mode || '—')}${p.ref ? ` · <code style="font-size:0.75rem; color:var(--primary);">${esc(p.ref)}</code>` : ''}</td>
      <td class="num text-green"><strong>${fmtCFA(p.amount)}</strong></td>
      <td><button class="btn btn-sm btn-ghost" onclick="deleteTaxPayment('${tax.id}', '${p.id}')">Supprimer</button></td>
    </tr>`).join('') ||
    `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:22px;">Aucun paiement d'impôt.</td></tr>`;

  document.getElementById('tax-payments-tfoot').innerHTML = `
    <tr>
      <td colspan="4">TOTAL VERSÉ ${selectedYear} — ${hist.length} paiement(s)</td>
      <td class="num text-green">${fmtCFA(sum(hist, h => h.p.amount))}</td>
      <td></td>
    </tr>`;
}

function saveTaxRate() {
  const db = loadDB();
  const v = Number(document.getElementById('tax-rate').value);
  db.settings.taxLateRate = isNaN(v) || v < 0 ? 0 : v;
  saveDB(db);
  refreshAll();
}

function updateTaxDueDefault() {
  const y = document.getElementById('tax-year').value;
  const q = document.getElementById('tax-quarter').value;
  if (y && q && !document.getElementById('tax-id').value) {
    document.getElementById('tax-due').value = defaultTaxDueDate(y, q);
  }
}

function openTaxModal(taxId = null) {
  const db = loadDB();
  const tax = taxId ? db.taxes.find(x => x.id === taxId) : null;
  document.getElementById('tax-modal-title').textContent = tax ? 'Modifier l\'Impôt' : 'Ajouter un Impôt Trimestriel';
  document.getElementById('tax-id').value = tax ? tax.id : '';
  document.getElementById('tax-year').value = tax ? tax.year : selectedYear;
  document.getElementById('tax-quarter').value = tax ? tax.quarter : Math.ceil(selectedMonth / 3);
  document.getElementById('tax-label').value = tax ? tax.label : 'Impôt sur le revenu foncier';
  document.getElementById('tax-amount').value = tax ? tax.amount : '';
  document.getElementById('tax-due').value = tax ? tax.dueDate : defaultTaxDueDate(selectedYear, Math.ceil(selectedMonth / 3));
  document.getElementById('tax-modal').classList.add('open');
}

function submitTax(e) {
  e.preventDefault();
  const db = loadDB();
  const id = document.getElementById('tax-id').value;
  const payload = {
    year: Number(document.getElementById('tax-year').value),
    quarter: Number(document.getElementById('tax-quarter').value),
    label: document.getElementById('tax-label').value.trim(),
    amount: Number(document.getElementById('tax-amount').value) || 0,
    dueDate: document.getElementById('tax-due').value,
  };
  if (id) {
    const tax = db.taxes.find(x => x.id === id);
    if (tax) Object.assign(tax, payload);
  } else {
    db.taxes.push({ id: 'TAX-' + Date.now(), ...payload, payments: [] });
  }
  saveDB(db);
  closeModal('tax-modal');
  refreshAll();
}

function deleteTax(id) {
  if (!confirm('Supprimer cet impôt et tous ses paiements ?')) return;
  const db = loadDB();
  db.taxes = db.taxes.filter(x => x.id !== id);
  saveDB(db);
  refreshAll();
}

function openTaxPaymentModal(taxId = null) {
  const db = loadDB();
  const rate = db.settings.taxLateRate;
  const list = db.taxes.slice().sort((a, b) => b.year - a.year || a.quarter - b.quarter);
  if (!list.length) {
    alert('Ajoutez d\'abord un impôt trimestriel.');
    return;
  }
  const defaultTax = taxId || (list.find(x => Number(x.year) === selectedYear && computeTax(x, rate).totalDue > 0) || list[0]).id;
  document.getElementById('taxpay-tax').innerHTML = list.map(x => {
    const c = computeTax(x, rate);
    return `<option value="${x.id}" ${x.id === defaultTax ? 'selected' : ''}>T${x.quarter} ${x.year} — ${esc(x.label)} · Reste ${fmtCFA(c.totalDue)}</option>`;
  }).join('');
  document.getElementById('taxpay-date').value = getTodayISO();
  document.getElementById('taxpay-ref').value = '';
  updateTaxPaymentPreview(true);
  document.getElementById('tax-payment-modal').classList.add('open');
}

function updateTaxPaymentPreview(fillAmount = false) {
  const db = loadDB();
  const tax = db.taxes.find(x => x.id === document.getElementById('taxpay-tax').value);
  if (!tax) return;
  const c = computeTax(tax, db.settings.taxLateRate);
  document.getElementById('tps-amount').textContent = fmtCFA(c.amount);
  document.getElementById('tps-paid').textContent = fmtCFA(c.paid);
  document.getElementById('tps-interest').textContent = fmtCFA(c.interestDue);
  document.getElementById('tps-total').textContent = fmtCFA(c.totalDue);
  if (fillAmount) document.getElementById('taxpay-amount').value = c.totalDue || '';
}

function submitTaxPayment(e) {
  e.preventDefault();
  const db = loadDB();
  const tax = db.taxes.find(x => x.id === document.getElementById('taxpay-tax').value);
  if (!tax) return;
  tax.payments.push({
    id: 'TP-' + Date.now(),
    date: document.getElementById('taxpay-date').value,
    amount: Number(document.getElementById('taxpay-amount').value) || 0,
    mode: document.getElementById('taxpay-mode').value,
    ref: document.getElementById('taxpay-ref').value.trim(),
  });
  saveDB(db);
  closeModal('tax-payment-modal');
  refreshAll();
}

function deleteTaxPayment(taxId, payId) {
  if (!confirm('Supprimer ce paiement d\'impôt ?')) return;
  const db = loadDB();
  const tax = db.taxes.find(x => x.id === taxId);
  if (tax) tax.payments = tax.payments.filter(p => p.id !== payId);
  saveDB(db);
  refreshAll();
}

/* ── 8. LOGEMENTS & MONTANTS DES LOYERS ──────────────────── */
function renderRentAmountsTable(db) {
  const ym = getSelectedPeriodKey();
  const list = db.tenants
    .filter(t => t.status === 'active')
    .sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.unitNo || '').localeCompare(b.unitNo || '', 'fr', { numeric: true }));

  document.getElementById('rent-amounts-tbody').innerHTML = list.map(t => {
    const current = getRentFor(t, ym);
    return `
      <tr>
        <td>${renderUnitNo(t)}</td>
        <td>${esc(t.unit)}</td>
        <td>📍 ${esc(t.city)}</td>
        <td><strong>${esc(t.name)}</strong></td>
        <td class="num">${fmtCFA(current)}</td>
        <td class="num">
          <input type="number" class="table-input rent-amount-input" min="0" step="500"
                 data-id="${t.id}" data-current="${current}" value="${current}" oninput="onRentAmountInput(this)" />
        </td>
        <td><input type="month" class="table-input table-input-month rent-from-input" data-id="${t.id}" value="${ym}" /></td>
      </tr>`;
  }).join('') || `<tr><td colspan="7" class="text-muted" style="text-align:center; padding:22px;">Aucun logement actif.</td></tr>`;

  updateRentAmountsTotal();
}

function onRentAmountInput(input) {
  input.classList.toggle('changed', Number(input.value) !== Number(input.dataset.current));
  updateRentAmountsTotal();
}

function updateRentAmountsTotal() {
  const inputs = Array.from(document.querySelectorAll('.rent-amount-input'));
  const current = sum(inputs, i => i.dataset.current);
  const next = sum(inputs, i => i.value);
  const changed = inputs.filter(i => Number(i.value) !== Number(i.dataset.current)).length;
  document.getElementById('rent-amounts-tfoot').innerHTML = `
    <tr>
      <td colspan="4">TOTAL MENSUEL — ${inputs.length} logement(s)${changed ? ` · <span class="text-amber">${changed} modification(s) non enregistrée(s)</span>` : ''}</td>
      <td class="num">${fmtCFA(current)}</td>
      <td class="num ${next !== current ? 'text-amber' : ''}">${fmtCFA(next)}</td>
      <td class="${next - current < 0 ? 'text-red' : 'text-green'}">${next !== current ? 'Écart : ' + fmtCFA(next - current, true) : ''}</td>
    </tr>`;
}

function saveRentAmounts() {
  const db = loadDB();
  let count = 0;
  document.querySelectorAll('.rent-amount-input').forEach(input => {
    const t = db.tenants.find(x => x.id === input.dataset.id);
    if (!t || input.value === '') return;
    const fromInput = document.querySelector(`.rent-from-input[data-id="${t.id}"]`);
    if (setRentFrom(t, Number(input.value), fromInput?.value || getSelectedPeriodKey())) count++;
  });
  saveDB(db);
  refreshAll();
  alert(count ? `${count} montant(s) de loyer mis à jour.` : 'Aucune modification à enregistrer.');
}

function renderTenantsTab() {
  const db = loadDB();
  const filterState = document.getElementById('tenant-filter-state')?.value || 'all';
  const filterLoc = document.getElementById('tenant-filter-location')?.value || 'all';
  const ym = getSelectedPeriodKey();

  const list = db.tenants.filter(t => {
    if (filterState !== 'all' && t.status !== filterState) return false;
    if (filterLoc !== 'all' && t.city !== filterLoc) return false;
    return true;
  }).sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.unitNo || '').localeCompare(b.unitNo || '', 'fr', { numeric: true }));

  document.getElementById('tenants-cards-grid').innerHTML = list.map(t => {
    const totalPaid = sum(db.payments.filter(p => p.tenantId === t.id), p => p.amount);
    const cur = computeTenantMonthStatus(db, t, ym);
    const openReps = db.repairs.filter(r => r.tenantId === t.id && r.status !== 'done').length;
    return `
      <div class="tenant-card ${t.status === 'stopped' ? 'stopped-card' : ''}">
        <div class="tc-top">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">${renderUnitNo(t)}<span class="tc-name">${esc(t.name)}</span></div>
            <div class="tc-unit">${esc(t.unit)}</div>
          </div>
          ${t.status === 'active' ? '<span class="badge badge-paid">Bail actif</span>' : '<span class="badge badge-stopped">Location arrêtée</span>'}
        </div>

        <div class="tc-location-banner">
          <div class="tc-loc-text">
            <strong>📍 ${esc(t.city || 'Zone non renseignée')}</strong>
            <span>${esc(t.address || 'Adresse non renseignée')}</span>
          </div>
          <a class="btn btn-sm btn-ghost" href="${esc(buildMapsUrl(t))}" target="_blank" rel="noopener noreferrer">Carte ↗</a>
        </div>

        <div class="tc-meta">
          <div><span class="tc-meta-lbl">Loyer (${MONTHS_SHORT[selectedMonth - 1]})</span><span class="tc-meta-val">${fmtCFA(getRentFor(t, ym))}</span></div>
          <div><span class="tc-meta-lbl">Date limite</span><span class="tc-meta-val">Le ${t.dueDay} du mois</span></div>
          <div><span class="tc-meta-lbl">Téléphone</span><span class="tc-meta-val">${renderPhone(t)}</span></div>
          <div><span class="tc-meta-lbl">Entrée</span><span class="tc-meta-val">${fmtDateFR(t.startDate)}</span></div>
          <div><span class="tc-meta-lbl">Total versé</span><span class="tc-meta-val text-green">${fmtCFA(totalPaid)}</span></div>
          <div><span class="tc-meta-lbl">Réparations ouvertes</span><span class="tc-meta-val ${openReps ? 'text-amber' : ''}">${openReps}</span></div>
        </div>

        ${t.status === 'stopped' ? `
          <div class="tc-stop-box">
            <strong>Arrêtée le ${fmtDateFR(t.stopDate)}</strong><br/>
            <span>Motif : ${esc(t.stopReason || 'Fin de bail')}</span>
            ${t.stopNotes ? `<div class="text-muted" style="margin-top:3px;">${esc(t.stopNotes)}</div>` : ''}
          </div>` : `
          <div style="font-size:0.78rem; display:flex; justify-content:space-between;">
            <span class="text-muted">Reste à payer ${fmtPeriodLabel(ym)} :</span>
            <strong class="${cur.remaining > 0 ? 'text-amber' : 'text-green'}">${fmtCFA(cur.remaining)}</strong>
          </div>`}

        <div class="tc-actions">
          ${t.status === 'active' ? `<button class="btn btn-sm btn-primary" onclick="openJekoModal('${t.id}', '${ym}')">🔗 Lien &amp; QR Jèko</button>` : ''}
          ${t.status === 'active' ? `<button class="btn btn-sm btn-secondary" onclick="openPaymentModal('${t.id}', '${ym}')">Encaisser</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="openTenantModal('${t.id}')">Modifier</button>
          <button class="btn btn-sm btn-ghost" onclick="openRepairModal(null, '${t.id}')">+ Réparation</button>
          ${t.status === 'active'
            ? `<button class="btn btn-sm btn-danger" onclick="openStopLeaseModal('${t.id}')">Arrêter location</button>`
            : `<button class="btn btn-sm btn-ghost" onclick="reactivateLease('${t.id}')">Réactiver</button>`}
        </div>
      </div>`;
  }).join('') || '<p class="text-muted">Aucun logement.</p>';
}

/* ── MODAL : PAIEMENT DE LOYER ───────────────────────────── */
let currentMMProvider = 'Orange Money';

function selectMMProvider(name) {
  currentMMProvider = name;
  document.querySelectorAll('#mm-selector-grid .mm-option').forEach(el => {
    const match = el.getAttribute('data-provider') === name;
    el.classList.toggle('selected', match);
    const radio = el.querySelector('input');
    if (radio) radio.checked = match;
  });
}

function openPaymentModal(tenantId = null, ym = null) {
  const db = loadDB();
  const list = db.tenants
    .filter(t => t.status === 'active' || t.id === tenantId)
    .sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.unitNo || '').localeCompare(b.unitNo || '', 'fr', { numeric: true }));
  if (!list.length) { alert('Ajoutez d\'abord un logement.'); return; }

  document.getElementById('pay-tenant').innerHTML = list.map(t =>
    `<option value="${t.id}" ${t.id === tenantId ? 'selected' : ''}>${esc(tenantOptionLabel(t))}</option>`
  ).join('');
  document.getElementById('pay-period').value = ym || getSelectedPeriodKey();
  document.getElementById('pay-date').value = getTodayISO();
  document.getElementById('pay-ref').value = '';
  document.getElementById('pay-note').value = '';
  onPayTenantChange();
  document.getElementById('payment-modal').classList.add('open');
}

function onPayTenantChange() {
  const db = loadDB();
  const t = db.tenants.find(x => x.id === document.getElementById('pay-tenant').value);
  if (!t) return;
  selectMMProvider(t.prefMM || 'Orange Money');
  document.getElementById('pay-phone').value = t.phone || '';
  const st = computeTenantMonthStatus(db, t, document.getElementById('pay-period').value || getSelectedPeriodKey());
  document.getElementById('pay-amount').value = st.remaining > 0 ? st.remaining : getRentFor(t, st.ym);
  updatePaymentFormPreview();
}

function updatePaymentFormPreview() {
  const db = loadDB();
  const t = db.tenants.find(x => x.id === document.getElementById('pay-tenant').value);
  if (!t) return;
  const st = computeTenantMonthStatus(db, t, document.getElementById('pay-period').value || getSelectedPeriodKey());
  const after = Math.max(0, st.remaining - (Number(document.getElementById('pay-amount').value) || 0));
  document.getElementById('ps-expected').textContent = fmtCFA(st.expected);
  document.getElementById('ps-already').textContent = fmtCFA(st.paid);
  document.getElementById('ps-remaining').textContent = fmtCFA(st.remaining);
  document.getElementById('ps-after').textContent = fmtCFA(after);
  document.getElementById('ps-after').className = after === 0 ? 'text-green' : 'text-amber';
}

function submitPayment(e) {
  e.preventDefault();
  const db = loadDB();
  const period = document.getElementById('pay-period').value;
  const pMeta = getProviderMeta(currentMMProvider);
  db.payments.push({
    id: 'PAY-' + Date.now(),
    tenantId: document.getElementById('pay-tenant').value,
    period,
    amount: Number(document.getElementById('pay-amount').value) || 0,
    datePaid: document.getElementById('pay-date').value,
    provider: currentMMProvider,
    phone: document.getElementById('pay-phone').value.trim(),
    ref: document.getElementById('pay-ref').value.trim() || `${pMeta.prefix}-${period.replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`,
    note: document.getElementById('pay-note').value.trim() || 'Paiement loyer'
  });
  saveDB(db);
  closeModal('payment-modal');
  refreshAll();
}

/* ── MODAL : LOGEMENT ────────────────────────────────────── */
function openTenantModal(tenantId = null) {
  const db = loadDB();
  const t = tenantId ? db.tenants.find(x => x.id === tenantId) : null;
  const ym = getSelectedPeriodKey();
  document.getElementById('tenant-modal-title').textContent = t ? 'Modifier le Logement' : 'Nouveau Logement';
  document.getElementById('ten-id').value = t ? t.id : '';
  document.getElementById('ten-unit-no').value = t ? (t.unitNo || '') : '';
  document.getElementById('ten-unit').value = t ? t.unit : '';
  document.getElementById('ten-city').value = t ? (t.city || '') : '';
  document.getElementById('ten-address').value = t ? (t.address || '') : '';
  document.getElementById('ten-gps').value = t ? (t.gps || '') : '';
  document.getElementById('ten-name').value = t ? t.name : '';
  document.getElementById('ten-phone').value = t ? (t.phone || '') : '';
  document.getElementById('ten-pref-mm').value = t ? (t.prefMM || 'Orange Money') : 'Orange Money';
  document.getElementById('ten-rent').value = t ? getRentFor(t, ym) : '';
  document.getElementById('ten-rent-from').value = ym;
  document.getElementById('ten-due-day').value = t ? t.dueDay : 5;
  document.getElementById('ten-deposit').value = t ? (t.deposit || '') : '';
  document.getElementById('ten-start-date').value = t ? t.startDate : getTodayISO();
  document.getElementById('tenant-modal').classList.add('open');
}

function submitTenant(e) {
  e.preventDefault();
  const db = loadDB();
  const id = document.getElementById('ten-id').value;
  const rent = Number(document.getElementById('ten-rent').value) || 0;
  const rentFrom = document.getElementById('ten-rent-from').value || getSelectedPeriodKey();
  const payload = {
    unitNo: document.getElementById('ten-unit-no').value.trim(),
    unit: document.getElementById('ten-unit').value.trim(),
    city: document.getElementById('ten-city').value.trim(),
    address: document.getElementById('ten-address').value.trim(),
    gps: document.getElementById('ten-gps').value.trim(),
    name: document.getElementById('ten-name').value.trim(),
    phone: document.getElementById('ten-phone').value.trim(),
    prefMM: document.getElementById('ten-pref-mm').value,
    dueDay: Number(document.getElementById('ten-due-day').value) || 5,
    deposit: Number(document.getElementById('ten-deposit').value) || 0,
    startDate: document.getElementById('ten-start-date').value,
  };

  if (id) {
    const t = db.tenants.find(x => x.id === id);
    if (t) {
      Object.assign(t, payload);
      setRentFrom(t, rent, rentFrom);
    }
  } else {
    db.tenants.push({ id: 'T' + Date.now(), ...payload, monthlyRent: rent, rentHistory: [], status: 'active', stopDate: null, stopReason: '', stopNotes: '' });
  }
  saveDB(db);
  closeModal('tenant-modal');
  refreshAll();
}

/* ── MODAL : ARRÊT DE LOCATION ───────────────────────────── */
function openStopLeaseModal(tenantId) {
  const db = loadDB();
  const t = db.tenants.find(x => x.id === tenantId);
  if (!t) return;
  document.getElementById('stop-tenant-id').value = t.id;
  document.getElementById('stop-date').value = getTodayISO();
  document.getElementById('stop-notes').value = '';

  let arrears = 0;
  for (let m = 1; m <= selectedMonth; m++) arrears += computeTenantMonthStatus(db, t, periodKey(selectedYear, m)).remaining;
  const net = (t.deposit || 0) - arrears;

  document.getElementById('stop-lease-summary').innerHTML = `
    <div><strong>Logement :</strong> ${renderUnitNo(t)} ${esc(t.unit)} — 📍 ${esc(t.city)}</div>
    <div><strong>Locataire :</strong> ${esc(t.name)} · ${renderPhone(t)}</div>
    <div style="margin-top:4px;"><strong>Loyer :</strong> ${fmtCFA(getRentFor(t, getSelectedPeriodKey()))} · <strong>Caution :</strong> ${fmtCFA(t.deposit || 0)}</div>
    <div style="margin-top:6px;"><strong>Reste à payer cumulé ${selectedYear} :</strong> <span class="${arrears > 0 ? 'text-red' : 'text-green'}">${fmtCFA(arrears)}</span></div>
    <div><strong>Solde de caution après déduction :</strong> <span class="${net >= 0 ? 'text-green' : 'text-red'}">${fmtCFA(net)}</span></div>`;
  document.getElementById('stop-lease-modal').classList.add('open');
}

function submitStopLease(e) {
  e.preventDefault();
  const db = loadDB();
  const t = db.tenants.find(x => x.id === document.getElementById('stop-tenant-id').value);
  if (!t) return;
  t.status = 'stopped';
  t.stopDate = document.getElementById('stop-date').value;
  t.stopReason = document.getElementById('stop-reason').value;
  t.stopNotes = document.getElementById('stop-notes').value.trim();
  saveDB(db);
  closeModal('stop-lease-modal');
  refreshAll();
}

function reactivateLease(tenantId) {
  const db = loadDB();
  const t = db.tenants.find(x => x.id === tenantId);
  if (!t) return;
  Object.assign(t, { status: 'active', stopDate: null, stopReason: '', stopNotes: '' });
  saveDB(db);
  refreshAll();
}

/* ── MODAL : QUITTANCE & RELANCE ─────────────────────────── */
function openReceiptForMonth(tenantId, ym) {
  const db = loadDB();
  const t = db.tenants.find(x => x.id === tenantId);
  if (!t) return;
  const st = computeTenantMonthStatus(db, t, ym);

  document.getElementById('receipt-modal-title').textContent = `Quittance de Loyer — ${fmtPeriodLabel(ym)}`;
  document.getElementById('receipt-modal-body').innerHTML = `
    <div style="border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h4 style="font-size:1.05rem; letter-spacing:0.04em;">RENT PAY — QUITTANCE DE LOYER</h4>
        <span class="text-muted">Période : ${fmtPeriodLabel(ym)}</span>
      </div>
      <div>${renderStatusBadge(st)}</div>
    </div>
    <div class="receipt-grid">
      <div><span class="text-muted">Locataire :</span><br/><strong>${esc(t.name)}</strong><br/><span>${renderPhone(t)}</span></div>
      <div><span class="text-muted">Logement :</span><br/><strong>N° ${esc(t.unitNo || '—')} — ${esc(t.unit)}</strong><br/><span>📍 ${esc(t.city)}${t.address ? ' — ' + esc(t.address) : ''}</span></div>
    </div>
    <div class="receipt-grid">
      <div><span class="text-muted">Loyer du mois :</span><br/><strong>${fmtCFA(st.expected)}</strong></div>
      <div><span class="text-muted">Montant payé :</span><br/><strong class="text-green">${fmtCFA(st.paid)}</strong></div>
      <div><span class="text-muted">Reste à payer :</span><br/><strong class="${st.remaining > 0 ? 'text-amber' : 'text-green'}">${fmtCFA(st.remaining)}</strong></div>
      <div><span class="text-muted">Date limite :</span><br/><strong>${fmtDateFR(st.dueDate)}</strong></div>
    </div>
    <h5 style="margin:12px 0 6px;">Versements enregistrés :</h5>
    <ul style="padding-left:18px;">
      ${st.txns.map(tx => `<li style="margin-bottom:6px;"><strong>${fmtDateFR(tx.datePaid)}</strong> : ${fmtCFA(tx.amount)} via <strong>${esc(tx.provider)}</strong> (Réf : <code>${esc(tx.ref)}</code>${tx.phone ? ' · Tél : ' + esc(tx.phone) : ''}) <button type="button" class="btn btn-sm btn-danger" style="margin-left:8px; padding:2px 8px; font-size:0.7rem;" onclick="deleteRentPayment('${esc(tx.id)}', '${esc(t.id)}', '${esc(ym)}')">✕ Retirer ce paiement</button></li>`).join('') || '<li class="text-muted">Aucun versement</li>'}
    </ul>`;
  document.getElementById('receipt-modal').classList.add('open');
}

function openReminderModal(tenantId, ym) {
  const db = loadDB();
  const t = db.tenants.find(x => x.id === tenantId);
  if (!t) return;
  const st = computeTenantMonthStatus(db, t, ym);
  const jekoLink = db.settings?.jekoPaymentLink || 'https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b';
  const msg = `Bonjour ${t.name},\n\nSauf erreur de notre part, votre loyer de ${fmtPeriodLabel(ym)} pour le logement N° ${t.unitNo || '—'} (${t.unit}, ${t.city}), dont la date limite était le ${fmtDateFR(st.dueDate)}, présente un reste à payer de ${fmtCFA(st.remaining)} (${st.daysLate} jours de retard).\n\nVeuillez payer pour Ahyi Rent (Wave ou Orange Money) en cliquant sur le lien :\n${jekoLink}\n\nCordialement,\nAhyi Rent — Gestion Rent Pay.`;

  document.getElementById('receipt-modal-title').textContent = 'Message de Relance (Jèko — Ahyi Rent)';
  document.getElementById('receipt-modal-body').innerHTML = `
    <p class="text-muted" style="margin-bottom:10px;">${t.phone ? `Message à envoyer au <strong>${esc(t.phone)}</strong> :` : 'Téléphone non renseigné — message à remettre au locataire :'}</p>
    <textarea class="input-field" style="min-height:180px; line-height:1.6;" readonly>${esc(msg)}</textarea>
    <div style="margin-top:10px; display:flex; gap:8px;">
      <button type="button" class="btn btn-sm btn-primary" onclick="closeModal('receipt-modal'); openJekoModal('${esc(t.id)}', '${esc(ym)}')">🔗 Ouvrir Lien &amp; QR Jèko</button>
    </div>`;
  document.getElementById('receipt-modal').classList.add('open');
}

/* ── JÈKO (Ahyi Rent) : LIEN WHATSAPP, QR CODE SVG & WEBHOOK ── */
const JEKO_DEFAULT_LINK = 'https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b';

function generateQRSvg(text) {
  try {
    const bytes = Array.from(new TextEncoder().encode(text || JEKO_DEFAULT_LINK));
    const VERS = [
      null,
      { v: 1, dc: 19, ec: 7, align: [] },
      { v: 2, dc: 34, ec: 10, align: [6, 18] },
      { v: 3, dc: 55, ec: 15, align: [6, 22] },
      { v: 4, dc: 80, ec: 20, align: [6, 26] },
      { v: 5, dc: 108, ec: 26, align: [6, 30] },
      { v: 6, dc: 136, ec: 36, align: [6, 34] }
    ];
    const info = VERS.find(x => x && x.dc - 2 >= bytes.length) || VERS[5];
    const size = 17 + info.v * 4;
    const bits = [];
    const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    bytes.forEach(b => pushBits(b, 8));
    for (let i = 0; i < 4 && bits.length < info.dc * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    let padIdx = 0;
    while (cw.length < info.dc) cw.push((padIdx++ % 2 === 0) ? 0xEC : 0x11);

    const exp = new Uint8Array(512), log = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x = (x << 1) ^ ((x & 0x80) ? 0x11d : 0); }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    const mul = (a, b) => (a && b) ? exp[log[a] + log[b]] : 0;
    let poly = [1];
    for (let i = 0; i < info.ec; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], exp[i]);
      }
      poly = next;
    }
    const rem = new Array(info.ec).fill(0);
    cw.forEach(b => {
      const factor = b ^ rem.shift();
      rem.push(0);
      for (let j = 0; j < info.ec; j++) rem[j] ^= mul(poly[j + 1], factor);
    });
    const allCw = cw.concat(rem);

    const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const reserved = Array.from({ length: size }, () => new Uint8Array(size));
    const setMod = (r, c, v) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        grid[r][c] = v ? 1 : 0;
        reserved[r][c] = 1;
      }
    };
    const placeFinder = (tr, tc) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setMod(tr + r, tc + c, inOuter && (onBorder || inInner));
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0);
      setMod(i, 6, i % 2 === 0);
    }

    if (info.align.length) {
      for (const ar of info.align) {
        for (const ac of info.align) {
          if (reserved[ar][ac]) continue;
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              setMod(ar + r, ac + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
            }
          }
        }
      }
    }

    setMod(size - 8, 8, 1);
    for (let i = 0; i < 9; i++) {
      if (i !== 6) { reserved[8][i] = 1; reserved[i][8] = 1; }
    }
    for (let i = 0; i < 8; i++) {
      reserved[8][size - 1 - i] = 1;
      reserved[size - 1 - i][8] = 1;
    }

    const dataBits = [];
    allCw.forEach(b => { for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1); });

    let bitIdx = 0, up = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let step = 0; step < size; step++) {
        const r = up ? (size - 1 - step) : step;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (!reserved[r][c]) {
            const bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
            grid[r][c] = bit ^ ((r + c) % 2 === 0 ? 1 : 0);
          }
        }
      }
      up = !up;
    }

    // Format string for ECC L (01) + Mask 0 (000) = 0x77c4
    const fmt = 0x77c4;
    const f1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const f2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> (14 - i)) & 1;
      grid[f1[i][0]][f1[i][1]] = bit;
      grid[f2[i][0]][f2[i][1]] = bit;
    }

    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === 1) rects += `<rect x="${c + 2}" y="${r + 2}" width="1" height="1"/>`;
      }
    }
    const view = size + 4;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="154" height="154" shape-rendering="crispEdges"><rect width="${view}" height="${view}" fill="#ffffff"/><g fill="#081c33">${rects}</g></svg>`;
  } catch (e) {
    return '<span class="text-muted">QR indisponible</span>';
  }
}

function openJekoModal(tenantId = null, ym = null) {
  const db = loadDB();
  const list = db.tenants
    .filter(t => t.status === 'active' || t.id === tenantId)
    .sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.unitNo || '').localeCompare(b.unitNo || '', 'fr', { numeric: true }));
  if (!list.length) return;

  const targetId = tenantId || list[0].id;
  document.getElementById('jeko-tenant').innerHTML = list.map(t =>
    `<option value="${t.id}" ${t.id === targetId ? 'selected' : ''}>${esc(tenantOptionLabel(t))}</option>`
  ).join('');
  document.getElementById('jeko-period').value = ym || getSelectedPeriodKey();
  const linkInput = document.getElementById('jeko-link-input');
  if (linkInput) linkInput.value = db.settings?.jekoPaymentLink || JEKO_DEFAULT_LINK;

  updateJekoModalPreview();
  checkJekoWebhookServer();
  document.getElementById('jeko-modal').classList.add('open');
}

function onJekoLinkInput() {
  const db = loadDB();
  const val = (document.getElementById('jeko-link-input')?.value || '').trim() || JEKO_DEFAULT_LINK;
  db.settings.jekoPaymentLink = val;
  saveDB(db);
  updateJekoModalPreview();
}

function updateJekoModalPreview() {
  const db = loadDB();
  const tid = document.getElementById('jeko-tenant')?.value;
  const ym = document.getElementById('jeko-period')?.value || getSelectedPeriodKey();
  const network = document.getElementById('jeko-network')?.value || 'Wave & Orange Money';
  const link = (document.getElementById('jeko-link-input')?.value || db.settings?.jekoPaymentLink || JEKO_DEFAULT_LINK).trim();

  const t = db.tenants.find(x => x.id === tid);
  if (!t) return;
  const st = computeTenantMonthStatus(db, t, ym);
  const amountToPay = st.remaining > 0 ? st.remaining : st.expected;

  document.getElementById('jeko-expected').textContent = fmtCFA(st.expected);
  document.getElementById('jeko-paid').textContent = fmtCFA(st.paid);
  document.getElementById('jeko-remaining').textContent = fmtCFA(st.remaining);
  document.getElementById('jeko-phone-display').textContent = t.phone || 'Non renseigné';

  const qrBox = document.getElementById('jeko-qr-box');
  if (qrBox) qrBox.innerHTML = generateQRSvg(link);

  const openBtn = document.getElementById('jeko-open-link-btn');
  if (openBtn && /^https?:\/\//i.test(link)) openBtn.href = link;

  const msg = `Bonjour ${t.name},\n\nVoici votre avis de loyer (${fmtPeriodLabel(ym)}) pour le logement ${t.unitNo ? t.unitNo + ' — ' : ''}${t.unit} (${t.city}) :\n• Montant à régler : ${fmtCFA(amountToPay)}\n• Réseau : ${network}\n\nVeuillez payer pour Ahyi Rent en cliquant sur le lien :\n${link}\n\nMerci de nous envoyer la capture de confirmation après le paiement.`;
  const msgBox = document.getElementById('jeko-msg-box');
  if (msgBox) msgBox.value = msg;
}

function copyJekoLinkOnly() {
  const link = document.getElementById('jeko-link-input')?.value || JEKO_DEFAULT_LINK;
  navigator.clipboard?.writeText(link);
  showNotificationToast('Lien Jèko copié', link);
}

function copyJekoFullMessage() {
  const msg = document.getElementById('jeko-msg-box')?.value || '';
  navigator.clipboard?.writeText(msg);
  showNotificationToast('Message Jèko copié', 'Vous pouvez le coller dans WhatsApp ou par SMS.');
}

function sendJekoWhatsApp() {
  const db = loadDB();
  const tid = document.getElementById('jeko-tenant')?.value;
  const t = db.tenants.find(x => x.id === tid);
  const msg = document.getElementById('jeko-msg-box')?.value || '';
  let digits = String(t?.phone || '').replace(/\D/g, '');
  if (digits.length === 10 && !digits.startsWith('225')) digits = '225' + digits;
  const waUrl = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}

function confirmFromJekoModal() {
  const tid = document.getElementById('jeko-tenant')?.value;
  const ym = document.getElementById('jeko-period')?.value || getSelectedPeriodKey();
  closeModal('jeko-modal');
  openPaymentModal(tid, ym);
}

async function checkJekoWebhookServer() {
  const badge = document.getElementById('jeko-webhook-status-badge');
  const box = document.getElementById('jeko-webhook-events-box');
  if (!badge || !box) return;
  try {
    const res = await fetch('/api/jeko/webhooks', { cache: 'no-store' });
    if (!res.ok) throw new Error('offline');
    const data = await res.json();
    badge.className = 'badge badge-paid';
    badge.textContent = `Serveur Webhook Actif (${(data.events || []).length} reçu(s))`;
    if (data.events && data.events.length > 0) {
      const latest = data.events[0];
      box.textContent = `Dernier événement Jèko : ${latest.event || 'TRANSACTION'} (${latest.receivedAt}) — Statut : ${latest.status || 'reçu'}`;
    } else {
      box.textContent = `Endpoint prêt : POST /webhooks/jeko (Vérification HMAC-SHA256 Jeko-Signature active). Aucun événement reçu pour l'instant.`;
    }
  } catch (e) {
    badge.className = 'badge badge-partial';
    badge.textContent = 'Mode Statique (Méthode 1 Active)';
  }
}

/* ── RETRAIT / SUPPRESSION D'UN PAIEMENT DE LOYER (ERREUR DE SAISIE) ── */
const WAVE_DEFAULT_PHONE = '0705180954';

function formatWavePhoneDisplay(raw) {
  const digits = String(raw || WAVE_DEFAULT_PHONE).replace(/\D/g, '').replace(/^225/, '');
  if (digits.length === 10) {
    return `+225 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  }
  return `+225 ${raw || WAVE_DEFAULT_PHONE}`;
}

function deleteRentPayment(paymentId, reopenTenantId = null, reopenYm = null) {
  const db = loadDB();
  const p = db.payments.find(x => x.id === paymentId);
  if (!p) return;
  const t = db.tenants.find(x => x.id === p.tenantId);
  const label = t ? `${t.unitNo} — ${t.name} (${t.city})` : p.tenantId;
  if (!confirm(`Retirer ce paiement de loyer (erreur de saisie) ?\n\n• Logement : ${label}\n• Période : ${fmtPeriodLabel(p.period)}\n• Montant : ${fmtCFA(p.amount)}\n• Référence : ${p.ref}`)) {
    return;
  }
  db.payments = db.payments.filter(x => x.id !== paymentId);
  saveDB(db);
  refreshAll();

  if (reopenTenantId && reopenYm) {
    const remainingTxns = db.payments.filter(x => x.tenantId === reopenTenantId && x.period === reopenYm);
    if (remainingTxns.length > 0) {
      openReceiptForMonth(reopenTenantId, reopenYm);
    } else {
      closeModal('receipt-modal');
    }
  }

  showNotificationToast(
    'Paiement de loyer retiré',
    `${label} · ${fmtCFA(p.amount)} (${fmtPeriodLabel(p.period)})`
  );
}

function deleteLastRentPaymentForMonth(tenantId, ym) {
  const db = loadDB();
  const txns = db.payments
    .filter(p => p.tenantId === tenantId && p.period === ym)
    .sort((a, b) => (b.datePaid || '').localeCompare(a.datePaid || ''));
  if (!txns.length) return;
  if (txns.length > 1) {
    // S'il y a plusieurs versements sur ce mois, ouvrir la quittance pour choisir lequel retirer
    openReceiptForMonth(tenantId, ym);
    return;
  }
  deleteRentPayment(txns[0].id);
}

function showNotificationToast(title, detail) {
  const container = document.getElementById('wave-toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'wave-toast';
  const titleDiv = document.createElement('div');
  titleDiv.style.fontWeight = '700';
  titleDiv.style.color = '#7dd3fc';
  titleDiv.style.marginBottom = '3px';
  titleDiv.textContent = title;
  const detailDiv = document.createElement('div');
  detailDiv.textContent = detail;
  el.appendChild(titleDiv);
  el.appendChild(detailDiv);
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.35s ease';
    setTimeout(() => el.remove(), 400);
  }, 5000);
}

/* ── UTILITAIRES MODALES ─────────────────────────────────── */
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function closeModalOnBg(e, id) {
  if (e.target.id === id) closeModal(id);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

/* ── RAFRAÎCHISSEMENT GLOBAL ─────────────────────────────── */
function refreshAll() {
  const db = loadDB();
  populateZoneFilters(db);
  renderDashboard(db);
  renderRentsTable();
  renderAnalyticsTab(db);
  renderLateTab(db);
  renderMobileMoneyTab();
  renderRepairsTab();
  renderTaxesTab(db);
  renderRentAmountsTable(db);
  renderTenantsTab();
}

document.addEventListener('DOMContentLoaded', () => {
  initPeriodSelectors();
  refreshAll();
});
