
/* ===================================
   SHIFT MATE byQ
   VERSION 1.0.0
   CORE APPLICATION
=================================== */

const APP_CONFIG = {
  name: "ShiftMate byQ",
  version: "1.0.0",
  storageKey: "shiftmate_byq_data"
};

/* ===================================
   DATA DEFAULT
=================================== */

const DEFAULT_DATA = {
  profile: {
    name: "Operator"
  },

  settings: {
    appName: "ShiftMate byQ",
    startDate: ""
  },

  preferences: {
    theme: "light"
  },

  schedule: {
    pattern: ["P", "P", "M", "M", "L", "L"]
  },

  attendance: {},
  overrides: {},
  holidays: {},
  salary: {}
};

/* ===================================
   STORAGE MANAGER
=================================== */

const StorageManager = {

  load() {
    try {
      const saved = localStorage.getItem(APP_CONFIG.storageKey);

      if (!saved) {
        return structuredClone(DEFAULT_DATA);
      }

      const parsed = JSON.parse(saved);

      return {
        ...structuredClone(DEFAULT_DATA),
        ...parsed,
        profile: {
          ...DEFAULT_DATA.profile,
          ...(parsed.profile || {})
        },
        settings: {
          ...DEFAULT_DATA.settings,
          ...(parsed.settings || {})
        },
        preferences: {
          ...DEFAULT_DATA.preferences,
          ...(parsed.preferences || {})
        },
        schedule: {
          ...DEFAULT_DATA.schedule,
          ...(parsed.schedule || {})
        },
        attendance: parsed.attendance || {},
        overrides: parsed.overrides || {},
        holidays: parsed.holidays || {},
        salary: parsed.salary || {}
      };

    } catch (error) {
      console.error("Gagal membaca data:", error);
      return structuredClone(DEFAULT_DATA);
    }
  },

  save(data) {
    try {
      localStorage.setItem(
        APP_CONFIG.storageKey,
        JSON.stringify(data)
      );
      return true;

    } catch (error) {
      console.error("Gagal menyimpan data:", error);
      return false;
    }
  }
};

/* ===================================
   APPLICATION STATE
=================================== */

const AppState = {
  data: StorageManager.load(),
  currentPage: "dashboard"
};

/* ===================================
   NAVIGATION MANAGER
=================================== */

const Navigation = {

  init() {
    document.querySelectorAll("[data-page]").forEach(button => {
      button.addEventListener("click", () => {
        this.show(button.dataset.page);
      });
    });

    document.getElementById("settingsShortcut")
      .addEventListener("click", () => {
        this.show("settings");
      });
  },

  show(pageId) {
    const target = document.getElementById(pageId);

    if (!target || !target.classList.contains("page")) {
      return;
    }

    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active");
    });

    target.classList.add("active");

    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.page === pageId
      );
    });

    AppState.currentPage = pageId;

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
};

/* ===================================
   DASHBOARD MANAGER
=================================== */

const Dashboard = {

  init() {
    this.updateDate();
    this.updateProfile();
    this.updateShift();
  },

  updateDate() {
    const now = new Date();

    const formatted = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);

    document.getElementById("todayDate").textContent =
      formatted;

    document.getElementById("currentYear").textContent =
      now.getFullYear();
  },

  updateProfile() {
    const name = AppState.data.profile.name || "Operator";

    document.getElementById("userGreeting").textContent =
      name;
  },

  updateShift() {
    const shiftElement = document.getElementById("todayShift");
    const descElement = document.getElementById("todayShiftDesc");

    const startDate = AppState.data.settings.startDate;

    if (!startDate) {
      shiftElement.textContent = "--";
      descElement.textContent = "Atur tanggal awal rotasi";
      return;
    }

    // Mesin rotasi aktif pada Tahap 2.
    shiftElement.textContent = "--";
    descElement.textContent = "Menunggu Tahap 2";
  }
};

/* ===================================
   SETTINGS MANAGER
=================================== */

const Settings = {

  init() {
    this.loadForm();

    document.getElementById("settingsForm")
      .addEventListener("submit", event => {
        event.preventDefault();
        this.saveForm();
      });
  },

  loadForm() {
    const data = AppState.data;

    document.getElementById("userName").value =
      data.profile.name || "";

    document.getElementById("appName").value =
      data.settings.appName || APP_CONFIG.name;

    document.getElementById("startDate").value =
      data.settings.startDate || "";
  },

  saveForm() {
    const name = document.getElementById("userName")
      .value.trim();

    const appName = document.getElementById("appName")
      .value.trim();

    const startDate = document.getElementById("startDate")
      .value;

    if (!appName) {
      this.message("Nama aplikasi tidak boleh kosong.");
      return;
    }

    AppState.data.profile.name = name || "Operator";

    AppState.data.settings.appName = appName;

    AppState.data.settings.startDate = startDate;

    const success = StorageManager.save(AppState.data);

    if (success) {
      Dashboard.updateProfile();
      Dashboard.updateShift();

      this.message("Pengaturan berhasil disimpan!");
    } else {
      this.message("Gagal menyimpan. Periksa penyimpanan browser.");
    }
  },

  message(text) {
    const element = document.getElementById("saveMessage");
    element.textContent = text;
  }
};

/* ===================================
   APPLICATION INITIALIZER
=================================== */

const ShiftMate = {

  init() {
    Navigation.init();
    Dashboard.init();
    Settings.init();

    console.log(
      APP_CONFIG.name + " versi " + APP_CONFIG.version +
      " berhasil dijalankan."
    );
  }
};

/* ===================================
   START APPLICATION
=================================== */

document.addEventListener("DOMContentLoaded", () => {
  ShiftMate.init();
});
