/**
 * KONFIGURASI & ATURAN SHIFT
 * Mudah diubah/di-upgrade di masa depan
 */
const APP_CONFIG = {
  ROTATION_PATTERN: ['PAGI', 'PAGI', 'MALAM', 'MALAM', 'OFF', 'OFF'],
  SHIFT_DETAILS: {
    PAGI: { label: 'Pagi', short: 'P', time: '07:00 – 19:00', regHours: 8, otHours: 4, isWork: true },
    MALAM: { label: 'Malam', short: 'M', time: '19:00 – 07:00 (+1)', regHours: 8, otHours: 4, isWork: true },
    OFF: { label: 'Off / Libur', short: 'L', time: '0 Jam', regHours: 0, otHours: 0, isWork: false },
    CUTI: { label: 'Cuti', short: 'Cuti', time: 'Tidak Masuk', regHours: 0, otHours: 0, isWork: false },
    SAKIT: { label: 'Sakit', short: 'Sakit', time: 'Tidak Masuk', regHours: 0, otHours: 0, isWork: false },
    UNPAID: { label: 'Unpaid', short: 'Unpaid', time: 'Tidak Masuk', regHours: 0, otHours: 0, isWork: false }
  },
  FALLBACK_HOLIDAYS: {
    '2027-01-01': 'Tahun Baru 2027 Masehi'
  },
  KEMNAKER_DIVISOR: 173,
  STORAGE_KEY: 'calendar_shift_data_v2',
  HOLIDAY_CACHE_PREFIX: 'id_holidays_'
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// State Aplikasi
let state = {
  startDate: '',
  generateMonths: 3,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  dayRecords: {},
  salaryConfig: {
    baseSalary: 0,
    allowance: 0,
    workdayScheme: 6
  },
  customHolidays: {},
  deletedHolidays: []
};

let activeHolidaysMap = {};
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
      const parsed = JSON.parse(saved);
      state = {
        ...state,
        ...parsed,
        dayRecords: parsed.dayRecords || {},
        salaryConfig: {
          ...state.salaryConfig,
          ...(parsed.salaryConfig || {})
        },
        customHolidays: parsed.customHolidays || {},
        deletedHolidays: parsed.deletedHolidays || []
      };
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

// --- FORMAT & UTILITAS ---
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

function formatRupiah(amount) {
  return 'Rp ' + Math.round(amount || 0).toLocaleString('id-ID');
}

// --- LOGIKA ROTASI & STATUS HARIAN ---
function getBaseShift(targetIso) {
  if (!state.startDate) return null;
  const delta = diffDays(state.startDate, targetIso);
  if (delta < 0) return null;

  const startObj = parseDateISO(state.startDate);
  const endLimitObj = new Date(startObj.getFullYear(), startObj.getMonth() + state.generateMonths, startObj.getDate());
  if (parseDateISO(targetIso) > endLimitObj) return null;

  const patternLen = APP_CONFIG.ROTATION_PATTERN.length;
  return APP_CONFIG.ROTATION_PATTERN[delta % patternLen];
}

function getEffectiveDayData(targetIso) {
  const baseShift = getBaseShift(targetIso);
  const record = state.dayRecords[targetIso] || {};
  const attendance = record.attendance || null;
  const absentReason = record.absentReason || null;
  const shiftOverride = record.shiftOverride || null;

  let displayStatus = shiftOverride || baseShift;
  let isAbsentConfirmed = false;

  if (attendance === 'TIDAK' && absentReason) {
    displayStatus = absentReason;
    isAbsentConfirmed = true;
  }

  const holidayName = activeHolidaysMap[targetIso] || null;
  const detail = displayStatus ? APP_CONFIG.SHIFT_DETAILS[displayStatus] : null;
  const isConfirmedPresent = attendance === 'YA' && detail && detail.isWork;

  return {
    date: targetIso,
    baseShift,
    shiftOverride,
    attendance,
    absentReason,
    isAbsentConfirmed,
    isConfirmedPresent,
    status: displayStatus,
    note: record.note || '',
    holidayName,
    detail
  };
}

// --- PERHITUNGAN LEMBUR KEMNAKER (PP NO. 35 / 2021) ---
function getHourlyWage() {
  const baseSalary = Number(state.salaryConfig.baseSalary) || 0;
  return baseSalary / APP_CONFIG.KEMNAKER_DIVISOR;
}

function calculateOvertimePayForDay(otHours, isHoliday) {
  const hourly = getHourlyWage();
  if (otHours <= 0 || hourly <= 0) return 0;

  if (isHoliday) {
    const multiplier = Math.min(otHours, 7) * 2 + Math.max(0, otHours - 7) * 3;
    return hourly * multiplier;
  } else {
    const firstHour = Math.min(otHours, 1) * 1.5;
    const nextHours = Math.max(0, otHours - 1) * 2;
    return hourly * (firstHour + nextHours);
  }
}

// --- TANGGAL MERAH NASIONAL (API + FALLBACK + OFFLINE CACHE) ---
async function loadHolidaysForYear(year) {
  const cacheKey = APP_CONFIG.HOLIDAY_CACHE_PREFIX + year;
  let apiHolidays = {};

  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    apiHolidays = JSON.parse(cached);
  } else {
    try {
      const res = await fetch(`https://dayoffapi.vercel.app/api?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        data.forEach(item => {
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

  activeHolidaysMap = {};
  Object.entries(APP_CONFIG.FALLBACK_HOLIDAYS).forEach(([date, name]) => {
    if (date.startsWith(String(year))) {
      activeHolidaysMap[date] = name;
    }
  });
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

    const isHolidayWork = Boolean(info.holidayName && info.detail && info.detail.isWork);
    if (isHolidayWork) {
      cell.classList.add('holiday-overtime');
    }

    const topRow = document.createElement('div');
    topRow.className = 'day-top';

    const indicators = [];
    if (info.attendance === 'YA') indicators.push('<span class="confirm-mark" title="Hadir Dikonfirmasi">✓</span>');
    if (info.attendance === 'TIDAK') indicators.push('<span class="confirm-mark" title="Tidak Masuk Dikonfirmasi">✕</span>');
    if (info.holidayName) indicators.push(`<span class="holiday-dot" title="${info.holidayName}"></span>`);

    topRow.innerHTML = `<span>${day}</span><div class="day-indicators">${indicators.join('')}</div>`;
    cell.appendChild(topRow);

    if (info.detail) {
      const badge = document.createElement('div');
      badge.className = 'day-badge';
      badge.textContent = info.detail.short + (info.shiftOverride ? '*' : '');
      cell.appendChild(badge);
    }

    if (info.holidayName) {
      const cap = document.createElement('div');
      cap.className = 'holiday-caption';
      cap.textContent = isHolidayWork ? `🔥 ${info.holidayName}` : info.holidayName;
      cell.appendChild(cap);
    }

    cell.addEventListener('click', () => openDayModal(dateIso));
    grid.appendChild(cell);
  }

  renderMonthHolidaysLegend();
}

function renderMonthHolidaysLegend() {
  const box = document.getElementById('month-holidays-box');
  const list = document.getElementById('month-holidays-list');
  if (!box || !list) return;

  const prefix = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, '0')}-`;
  const entries = Object.entries(activeHolidaysMap)
    .filter(([date]) => date.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));

  list.innerHTML = '';
  if (entries.length === 0) {
    box.classList.add('hidden');
    return;
  }

  entries.forEach(([date, name]) => {
    const info = getEffectiveDayData(date);
    const workNote = info.detail && info.detail.isWork ? ' — Kerja (Overtime Libur)' : '';
    const li = document.createElement('li');
    li.className = 'month-holidays-item';
    li.textContent = `${date}: ${name}${workNote}`;
    list.appendChild(li);
  });

  box.classList.remove('hidden');
}

function isNextMonthFromNow(viewYear, viewMonth) {
  const now = new Date();
  const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const viewedMonthIndex = viewYear * 12 + viewMonth;
  return viewedMonthIndex > currentMonthIndex;
}

function renderMonthlyReport() {
  const monthLabel = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;
  document.getElementById('report-month-name').textContent = monthLabel;

  const unavailableBox = document.getElementById('report-unavailable-box');
  const contentBox = document.getElementById('report-content-box');

  if (isNextMonthFromNow(state.viewYear, state.viewMonth)) {
    unavailableBox.classList.remove('hidden');
    contentBox.classList.add('hidden');
    return;
  }

  unavailableBox.classList.add('hidden');
  contentBox.classList.remove('hidden');

  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  let confirmedDaysCount = 0;
  let workDays = 0;
  let regHours = 0;
  let otHours = 0;
  let totalOvertimePay = 0;
  let cutiDays = 0;
  let sickDays = 0;
  let unpaidDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = getEffectiveDayData(dateIso);

    if (info.attendance === 'YA' || info.attendance === 'TIDAK') {
      confirmedDaysCount++;
    }

    if (info.attendance === 'YA' && info.detail && info.detail.isWork) {
      workDays++;
      regHours += info.detail.regHours;
      otHours += info.detail.otHours;
      totalOvertimePay += calculateOvertimePayForDay(info.detail.otHours, Boolean(info.holidayName));
    }

    if (info.attendance === 'TIDAK') {
      if (info.absentReason === 'CUTI') cutiDays++;
      else if (info.absentReason === 'SAKIT') sickDays++;
      else if (info.absentReason === 'UNPAID') unpaidDays++;
    }
  }

  const baseSalary = Number(state.salaryConfig.baseSalary) || 0;
  const allowance = Number(state.salaryConfig.allowance) || 0;
  const estimatedTotalSalary = baseSalary + allowance + totalOvertimePay;

  document.getElementById('stat-confirmed-days').textContent = confirmedDaysCount;
  document.getElementById('stat-work-days').textContent = `${workDays} hari`;
  document.getElementById('stat-total-hours').textContent = `${regHours + otHours} jam`;
  document.getElementById('stat-reg-hours').textContent = `${regHours} jam`;
  document.getElementById('stat-ot-hours').textContent = `${otHours} jam`;

  document.getElementById('stat-absent-total').textContent = cutiDays + sickDays + unpaidDays;
  document.getElementById('stat-leave').textContent = cutiDays;
  document.getElementById('stat-sick').textContent = sickDays;
  document.getElementById('stat-unpaid').textContent = unpaidDays;

  document.getElementById('stat-base-salary').textContent = formatRupiah(baseSalary);
  document.getElementById('stat-allowance').textContent = formatRupiah(allowance);
  document.getElementById('stat-ot-pay').textContent = formatRupiah(totalOvertimePay);
  document.getElementById('stat-total-salary').textContent = formatRupiah(estimatedTotalSalary);
  document.getElementById('kemnaker-hourly-info').textContent =
    `Upah/jam reguler (1/173): ${formatRupiah(getHourlyWage())} • Skema ${state.salaryConfig.workdayScheme} hari/minggu`;
}

// --- MODAL & INTERAKSI PENGGUNA ---
function toggleAbsentReasonField() {
  const attVal = document.getElementById('attendance-select').value;
  const reasonGroup = document.getElementById('absent-reason-group');
  if (attVal === 'TIDAK') {
    reasonGroup.classList.remove('hidden');
  } else {
    reasonGroup.classList.add('hidden');
  }
}

function openDayModal(dateIso) {
  selectedDateStr = dateIso;
  const info = getEffectiveDayData(dateIso);

  document.getElementById('modal-date-title').textContent = `Tanggal ${dateIso}`;

  const holidayBanner = document.getElementById('modal-holiday-banner');
  if (info.holidayName) {
    holidayBanner.textContent = `🗓️ Tanggal Merah: ${info.holidayName}` + (info.detail && info.detail.isWork ? ' (Masuk Kerja / Overtime Libur)' : '');
    holidayBanner.classList.remove('hidden');
  } else {
    holidayBanner.classList.add('hidden');
  }

  const baseLabel = info.baseShift ? APP_CONFIG.SHIFT_DETAILS[info.baseShift].label : 'Di luar rentang generate';
  const currentTime = info.detail ? info.detail.time : '-';
  document.getElementById('modal-default-info').textContent = `Pola Utama: ${baseLabel} | Jam: ${currentTime}`;

  document.getElementById('attendance-select').value = info.attendance || 'NONE';
  document.getElementById('absent-reason-select').value = info.absentReason || 'CUTI';
  toggleAbsentReasonField();

  document.getElementById('override-select').value = info.shiftOverride || 'DEFAULT';
  document.getElementById('override-note').value = info.note || '';

  document.getElementById('day-modal').classList.remove('hidden');
}

function openSalaryModal() {
  document.getElementById('input-base-salary').value = state.salaryConfig.baseSalary || '';
  document.getElementById('input-allowance').value = state.salaryConfig.allowance || '';
  document.getElementById('input-workday-scheme').value = String(state.salaryConfig.workdayScheme || 6);
  document.getElementById('salary-modal').classList.remove('hidden');
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
  document.getElementById('start-date').addEventListener('change', (e) => {
    state.startDate = e.target.value;
    const d = parseDateISO(state.startDate);
    state.viewYear = d.getFullYear();
    state.viewMonth = d.getMonth();
    saveState();
    renderAll();
  });

  document.querySelectorAll('.btn-gen').forEach(btn => {
    btn.addEventListener('click', () => {
      state.generateMonths = Number(btn.dataset.months);
      highlightActiveGenButton();
      saveState();
      renderAll();
    });
  });

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

  document.getElementById('attendance-select').addEventListener('change', toggleAbsentReasonField);

  document.getElementById('save-override').addEventListener('click', () => {
    if (!selectedDateStr) return;

    const attVal = document.getElementById('attendance-select').value;
    const reasonVal = document.getElementById('absent-reason-select').value;
    const shiftVal = document.getElementById('override-select').value;
    const noteVal = document.getElementById('override-note').value.trim();

    const attendance = attVal === 'NONE' ? null : attVal;
    const absentReason = attendance === 'TIDAK' ? reasonVal : null;
    const shiftOverride = shiftVal === 'DEFAULT' ? null : shiftVal;

    if (!attendance && !shiftOverride && !noteVal) {
      delete state.dayRecords[selectedDateStr];
    } else {
      state.dayRecords[selectedDateStr] = {
        attendance,
        absentReason,
        shiftOverride,
        note: noteVal
      };
    }

    saveState();
    document.getElementById('day-modal').classList.add('hidden');
    renderAll();
  });

  document.getElementById('reset-day-btn').addEventListener('click', () => {
    if (!selectedDateStr) return;
    delete state.dayRecords[selectedDateStr];
    saveState();
    document.getElementById('day-modal').classList.add('hidden');
    renderAll();
  });

  document.getElementById('close-day-modal').addEventListener('click', () => {
    document.getElementById('day-modal').classList.add('hidden');
  });

  // Modal Gaji
  document.getElementById('btn-open-salary').addEventListener('click', openSalaryModal);
  document.getElementById('close-salary-modal').addEventListener('click', () => {
    document.getElementById('salary-modal').classList.add('hidden');
  });

  document.getElementById('save-salary-btn').addEventListener('click', () => {
    state.salaryConfig = {
      baseSalary: Math.max(0, Number(document.getElementById('input-base-salary').value) || 0),
      allowance: Math.max(0, Number(document.getElementById('input-allowance').value) || 0),
      workdayScheme: Number(document.getElementById('input-workday-scheme').value) || 6
    };
    saveState();
    document.getElementById('salary-modal').classList.add('hidden');
    renderMonthlyReport();
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
