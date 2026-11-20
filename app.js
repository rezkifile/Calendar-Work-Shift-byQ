/**
 * KONFIGURASI & ATURAN SHIFT
 * Mudah diubah/di-upgrade di masa depan
 */
const APP_CONFIG = {
  // Siklus 6 hari: 2 Pagi, 2 Malam, 2 Off
  ROTATION_PATTERN: ['PAGI', 'PAGI', 'MALAM', 'MALAM', 'OFF', 'OFF'],
  SHIFT_DETAILS: {
    PAGI: { label: 'Pagi', short: 'P', time: '07:00 – 19:00', regHours: 8, otHours: 4, isWork: true },
    MALAM: { label: 'Malam', short: 'M', time: '19:00 – 07:00 (+1)', regHours: 8, otHours: 4, isWork: true },
    OFF: { label: 'Off / Libur', short: 'L', time: '0 Jam', regHours: 0, otHours: 0, isWork: false },
    SAKIT: { label: 'Izin Sakit', short: 'Sakit', time: 'Tidak Masuk', regHours: 0, otHours: 0, isWork: false },
    UNPAID: { label: 'Izin Tanpa Dibayar', short: 'Unpaid', time: 'Tidak Masuk', regHours: 0, otHours: 0, isWork: false },
    CUTI: { label: 'Cuti', short: 'Cuti', time: 'Tidak Masuk', regHours: 0, otHours: 0, isWork: false }
  },
  STORAGE_KEY: 'calendar_shift_data_v1',
  HOLIDAY_CACHE_PREFIX: 'id_holidays_'
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// State Aplikasi
let state = {
  startDate: '',         // YYYY-MM-DD (Hari Pagi ke-1)
  generateMonths: 3,     // Durasi generate ke depan (1, 3, 6, 12)
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  overrides: {},         // { "YYYY-MM-DD": { status: "PAGI", note: "..." } }
  customHolidays: {},    // { "YYYY-MM-DD": "Nama Libur" }
  deletedHolidays: []    // ["YYYY-MM-DD"] jika user menghapus libur bawaan API
};

let activeHolidaysMap = {}; // Gabungan API + Custom untuk tahun aktif
let selectedDateStr = null;

// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
  renderAll();
});

function loadState() {
  const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEY);
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Gagal memuat data lokal:', e);
    }
  }
  if (!state.startDate) {
    state.startDate = formatDateISO(new Date());
  }
  document.getElementById('start-date').value = state.startDate;
  highlightActiveGenButton();
}

function saveState() {
  localStorage.setItem(APP_CONFIG.STORAGE_KEY, JSON.stringify(state));
}

// --- LOGIKA TANGGAL & ROTASI SHIFT ---
function formatDateISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateISO(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function diffDays(startIso, targetIso) {
  const d1 = Date.UTC(...startIso.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  const d2 = Date.UTC(...targetIso.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getBaseShift(targetIso) {
  if (!state.startDate) return null;
  const delta = diffDays(state.startDate, targetIso);
  if (delta < 0) return null; // Sebelum tanggal mulai shift

  // Batas akhir generate berdasarkan pilihan 1, 3, 6, atau 12 bulan
  const startObj = parseDateISO(state.startDate);
  const endLimitObj = new Date(startObj.getFullYear(), startObj.getMonth() + state.generateMonths, startObj.getDate());
  if (parseDateISO(targetIso) > endLimitObj) return null;

  const patternLen = APP_CONFIG.ROTATION_PATTERN.length;
  const index = delta % patternLen;
  return APP_CONFIG.ROTATION_PATTERN[index];
}

function getEffectiveDayData(targetIso) {
  const baseShift = getBaseShift(targetIso);
  const override = state.overrides[targetIso];
  const finalStatus = override ? override.status : baseShift;
  const holidayName = activeHolidaysMap[targetIso] || null;

  return {
    date: targetIso,
    baseShift,
    status: finalStatus,
    isOverridden: Boolean(override),
    note: override ? override.note : '',
    holidayName,
    detail: finalStatus ? APP_CONFIG.SHIFT_DETAILS[finalStatus] : null
  };
}

// --- TANGGAL MERAH NASIONAL (API + OFFLINE CACHE) ---
async function loadHolidaysForYear(year) {
  const cacheKey = APP_CONFIG.HOLIDAY_CACHE_PREFIX + year;
  let apiHolidays = {};

  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    apiHolidays = JSON.parse(cached);
  } else {
    try {
      // Menggunakan API Hari Libur Nasional Indonesia publik
      const res = await fetch(`https://dayoffapi.vercel.app/api?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        data.forEach(item => {
          // Normalisasi format tanggal YYYY-MM-DD
          const parts = item.tanggal.split('-');
          const normDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          apiHolidays[normDate] = item.keterangan;
        });
        localStorage.setItem(cacheKey, JSON.stringify(apiHolidays));
      }
    } catch (err) {
      console.warn('Mode offline / gagal ambil API tanggal merah:', err);
    }
  }

  // Gabungkan dengan customHolidays & filter yang dihapus manual
  activeHolidaysMap = {};
  Object.entries(apiHolidays).forEach(([date, name]) => {
    if (!state.deletedHolidays.includes(date)) {
      activeHolidaysMap[date] = name;
    }
  });
  Object.entries(state.customHolidays).forEach(([date, name]) => {
    if (date.startsWith(String(year))) {
      activeHolidaysMap[date] = name;
    }
  });
}

// --- RENDER KALENDER & LAPORAN ---
async function renderAll() {
  await loadHolidaysForYear(state.viewYear);
  renderCalendar();
  renderMonthlyReport();
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  document.getElementById('current-month-label').textContent = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;

  const firstDay = new Date(state.viewYear, state.viewMonth, 1).getDay();
  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  const todayIso = formatDateISO(new Date());

  // Sel kosong sebelum tanggal 1
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    grid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = getEffectiveDayData(dateIso);

    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (dateIso === todayIso) cell.classList.add('today');

    if (info.status) {
      cell.classList.add(`shift-${info.status}`);
    }

    // Cek apakah tanggal merah nasional jatuh pada hari kerja (Pagi/Malam)
    const isHolidayWork = Boolean(info.holidayName && info.detail && info.detail.isWork);
    if (isHolidayWork) {
      cell.classList.add('holiday-overtime');
    }

    const topRow = document.createElement('div');
    topRow.className = 'day-top';
    topRow.innerHTML = `<span>${day}</span>${info.holidayName ? '<span class="holiday-dot" title="' + info.holidayName + '"></span>' : ''}`;
    cell.appendChild(topRow);

    if (info.detail) {
      const badge = document.createElement('div');
      badge.className = 'day-badge';
      badge.textContent = info.detail.short + (info.isOverridden ? '*' : '');
      cell.appendChild(badge);
    }

    if (isHolidayWork) {
      const otTag = document.createElement('div');
      otTag.className = 'ot-flame';
      otTag.textContent = '🔥 OT Libur';
      cell.appendChild(otTag);
    }

    cell.addEventListener('click', () => openDayModal(dateIso));
    grid.appendChild(cell);
  }
}

function renderMonthlyReport() {
  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  let workDays = 0;
  let regHours = 0;
  let otHours = 0;
  let sickDays = 0;
  let unpaidDays = 0;
  let cutiDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = getEffectiveDayData(dateIso);

    if (!info.status) continue;

    if (info.detail.isWork) {
      workDays++;
      regHours += info.detail.regHours;
      otHours += info.detail.otHours;
    } else if (info.status === 'SAKIT') {
      sickDays++;
    } else if (info.status === 'UNPAID') {
      unpaidDays++;
    } else if (info.status === 'CUTI') {
      cutiDays++;
    }
  }

  document.getElementById('report-month-name').textContent = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;
  document.getElementById('stat-work-days').textContent = `${workDays} hari`;
  document.getElementById('stat-total-hours').textContent = `${regHours + otHours} jam`;
  document.getElementById('stat-reg-hours').textContent = `${regHours} jam`;
  document.getElementById('stat-ot-hours').textContent = `${otHours} jam`;

  document.getElementById('stat-absent-total').textContent = sickDays + unpaidDays + cutiDays;
  document.getElementById('stat-sick').textContent = sickDays;
  document.getElementById('stat-unpaid').textContent = unpaidDays;
  document.getElementById('stat-leave').textContent = cutiDays;
}

// --- MODAL & INTERAKSI PENGGUNA ---
function openDayModal(dateIso) {
  selectedDateStr = dateIso;
  const info = getEffectiveDayData(dateIso);

  document.getElementById('modal-date-title').textContent = `Tanggal ${dateIso}`;

  const holidayBanner = document.getElementById('modal-holiday-banner');
  if (info.holidayName) {
    holidayBanner.textContent = `🗓️ Tanggal Merah: ${info.holidayName}` + (info.detail && info.detail.isWork ? ' (Masuk Kerja / Overtime Nasional)' : '');
    holidayBanner.classList.remove('hidden');
  } else {
    holidayBanner.classList.add('hidden');
  }

  const baseLabel = info.baseShift ? APP_CONFIG.SHIFT_DETAILS[info.baseShift].label : 'Di luar rentang generate';
  const currentTime = info.detail ? info.detail.time : '-';
  document.getElementById('modal-default-info').textContent = `Jadwal Pola Utama: ${baseLabel} | Jam: ${currentTime}`;

  document.getElementById('override-select').value = info.isOverridden ? info.status : 'DEFAULT';
  document.getElementById('override-note').value = info.note || '';

  document.getElementById('day-modal').classList.remove('hidden');
}

function openHolidayModal() {
  document.getElementById('holiday-year-label').textContent = state.viewYear;
  const list = document.getElementById('holiday-list');
  list.innerHTML = '';

  const sortedDates = Object.keys(activeHolidaysMap).sort();
  if (sortedDates.length === 0) {
    list.innerHTML = '<li>Belum ada data tanggal merah untuk tahun ini.</li>';
  } else {
    sortedDates.forEach(date => {
      const li = document.createElement('li');
      li.innerHTML = `<span><strong>${date}</strong>: ${activeHolidaysMap[date]}</span>`;
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del-holiday';
      delBtn.textContent = 'Hapus';
      delBtn.onclick = () => {
        delete state.customHolidays[date];
        if (!state.deletedHolidays.includes(date)) state.deletedHolidays.push(date);
        saveState();
        renderAll().then(openHolidayModal);
      };
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  document.getElementById('holiday-modal').classList.remove('hidden');
}

function highlightActiveGenButton() {
  document.querySelectorAll('.btn-gen').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.months) === state.generateMonths);
  });
}

function setupEventListeners() {
  // Ubah tanggal mulai shift
  document.getElementById('start-date').addEventListener('change', (e) => {
    state.startDate = e.target.value;
    const d = parseDateISO(state.startDate);
    state.viewYear = d.getFullYear();
    state.viewMonth = d.getMonth();
    saveState();
    renderAll();
  });

  // Tombol cepat generate 1, 3, 6, 12 bulan
  document.querySelectorAll('.btn-gen').forEach(btn => {
    btn.addEventListener('click', () => {
      state.generateMonths = Number(btn.dataset.months);
      highlightActiveGenButton();
      saveState();
      renderAll();
    });
  });

  // Navigasi bulan
  document.getElementById('prev-month').addEventListener('click', () => {
    state.viewMonth--;
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear--;
    }
    renderAll();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    state.viewMonth++;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear++;
    }
    renderAll();
  });

  // Simpan Override Tanggal
  document.getElementById('save-override').addEventListener('click', () => {
    if (!selectedDateStr) return;
    const val = document.getElementById('override-select').value;
    const note = document.getElementById('override-note').value.trim();

    if (val === 'DEFAULT') {
      delete state.overrides[selectedDateStr];
    } else {
      state.overrides[selectedDateStr] = { status: val, note };
    }

    saveState();
    document.getElementById('day-modal').classList.add('hidden');
    renderAll();
  });

  document.getElementById('close-day-modal').addEventListener('click', () => {
    document.getElementById('day-modal').classList.add('hidden');
  });

  // Modal Tanggal Merah
  document.getElementById('btn-open-holiday').addEventListener('click', openHolidayModal);
  document.getElementById('close-holiday-modal').addEventListener('click', () => {
    document.getElementById('holiday-modal').classList.add('hidden');
  });

  document.getElementById('btn-add-holiday').addEventListener('click', () => {
    const dateVal = document.getElementById('new-holiday-date').value;
    const nameVal = document.getElementById('new-holiday-name').value.trim();
    if (!dateVal || !nameVal) return alert('Isi tanggal dan nama libur terlebih dahulu.');

    state.customHolidays[dateVal] = nameVal;
    state.deletedHolidays = state.deletedHolidays.filter(d => d !== dateVal);
    saveState();

    document.getElementById('new-holiday-date').value = '';
    document.getElementById('new-holiday-name').value = '';
    renderAll().then(openHolidayModal);
  });

  document.getElementById('btn-refresh-holiday').addEventListener('click', () => {
    localStorage.removeItem(APP_CONFIG.HOLIDAY_CACHE_PREFIX + state.viewYear);
    renderAll().then(openHolidayModal);
  });
}
