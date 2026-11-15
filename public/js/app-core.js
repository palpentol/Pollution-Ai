(function () {
  const STORAGE_KEY = 'nafas_pagi_state_v1';

  const DEFAULT_STATE = {
    lang: 'en',
    theme: 'light',
    station: 'surabaya',
    provenance: 'openaq_meteo',
    threshold: 0.38,
    customTestDays: [],
    liveSnapshot: null,
    simulatorInputs: null
  };

  let currentState = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_STATE, parsed);
    } catch (e) {
      return Object.assign({}, DEFAULT_STATE);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
    } catch (e) {
      // Ignore storage quota errors
    }
  }

  function applyThemeClass(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  function updateRealtimeHeader() {
    const now = new Date();

    // Format jam ke WIB (Asia/Jakarta) -> contoh: "20:39"
    const timeStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
      .format(now)
      .replace('.', ':');

    const currentWIB = timeStr + ' WIB';

    // Ambil angka jam (0-23) berdasarkan zona waktu Asia/Jakarta
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        hour: 'numeric',
        hour12: false
      }).format(now),
      10
    );

    const isID = currentState.lang === 'id';
    let greeting = '';
    let panelTitle = '';

    if (isID) {
      if (hour >= 4 && hour < 11) {
        greeting = 'Selamat pagi!';
        panelTitle = 'Panel Keputusan Pagi (' + currentWIB + ')';
      } else if (hour >= 11 && hour < 15) {
        greeting = 'Selamat siang!';
        panelTitle = 'Panel Keputusan Siang (' + currentWIB + ')';
      } else if (hour >= 15 && hour < 18) {
        greeting = 'Selamat sore!';
        panelTitle = 'Panel Keputusan Sore (' + currentWIB + ')';
      } else {
        greeting = 'Selamat malam!';
        panelTitle = 'Panel Keputusan Malam (' + currentWIB + ')';
      }
    } else {
      if (hour >= 5 && hour < 12) {
        greeting = 'Good morning!';
        panelTitle = 'Morning Decision Panel (' + currentWIB + ')';
      } else if (hour >= 12 && hour < 18) {
        greeting = 'Good afternoon!';
        panelTitle = 'Afternoon Decision Panel (' + currentWIB + ')';
      } else {
        greeting = 'Good evening!';
        panelTitle = 'Evening Decision Panel (' + currentWIB + ')';
      }
    }

    // 1. Update Sub-header kanan atas (menimpa data-i18n="role_title" & "role_window")
    $('[data-i18n="role_title"]').text(greeting);
    $('[data-i18n="role_window"]').text(currentWIB + ' | Surabaya–Gresik');

    // 2. Update Sapaan Besar & Judul Panel di Dashboard / Index
    $('h1, h2, p, span').each(function () {
      if (this.children.length === 0) {
        const txt = $(this).text().trim();
        if (
          txt === 'Good morning!' ||
          txt === 'Good afternoon!' ||
          txt === 'Good evening!' ||
          txt === 'Selamat pagi!' ||
          txt === 'Selamat siang!' ||
          txt === 'Selamat sore!' ||
          txt === 'Selamat malam!'
        ) {
          $(this).text(greeting);
        } else if (
          txt.indexOf('Decision Panel (') !== -1 ||
          txt.indexOf('Panel Keputusan ') !== -1
        ) {
          $(this).text(panelTitle);
        }
      }
    });
  }

  window.NafasState = {
    get: function () {
      return currentState;
    },
    update: function (patch) {
      currentState = Object.assign({}, currentState, patch);
      saveState();
      applyThemeClass(currentState.theme);
      syncHeaderControls();
      if (window.NafasI18n) window.NafasI18n.apply();
      updateRealtimeHeader();
      if (typeof window.onNafasStateChange === 'function') {
        window.onNafasStateChange(currentState);
      }
      if (window.lucide) window.lucide.createIcons();
    },
    resetSettings: function () {
      currentState = Object.assign({}, currentState, {
        station: DEFAULT_STATE.station,
        provenance: DEFAULT_STATE.provenance,
        threshold: DEFAULT_STATE.threshold,
        liveSnapshot: null
      });
      saveState();
      syncHeaderControls();
      if (window.NafasI18n) window.NafasI18n.apply();
      updateRealtimeHeader();
      if (typeof window.onNafasStateChange === 'function') {
        window.onNafasStateChange(currentState);
      }
      if (window.lucide) window.lucide.createIcons();
    }
  };

  // Fetch real weather + air quality from keyless Open-Meteo public APIs
  window.NafasLiveAPI = {
    fetchOpenMeteo: async function (stationKey) {
      const st = window.NafasData.getStation(stationKey);
      const weatherUrl =
        'https://api.open-meteo.com/v1/forecast?latitude=' +
        st.lat +
        '&longitude=' +
        st.lon +
        '&daily=wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum,relative_humidity_2m_mean&timezone=Asia%2FJakarta&forecast_days=2';

      const aqUrl =
        'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' +
        st.lat +
        '&longitude=' +
        st.lon +
        '&hourly=pm2_5&timezone=Asia%2FJakarta&past_days=3&forecast_days=2';

      const responses = await Promise.all([fetch(weatherUrl), fetch(aqUrl)]);
      if (!responses[0].ok || !responses[1].ok) {
        throw new Error('Open-Meteo API error');
      }

      const weatherJson = await responses[0].json();
      const aqJson = await responses[1].json();

      const d = weatherJson.daily;
      const windSpeed = d && d.wind_speed_10m_max ? Number(d.wind_speed_10m_max[1]) : 8.5;
      const windDir = d && d.wind_direction_10m_dominant ? Number(d.wind_direction_10m_dominant[1]) : 145;
      const rainMm = d && d.precipitation_sum ? Number(d.precipitation_sum[1]) : 0;
      const humidity = d && d.relative_humidity_2m_mean ? Number(d.relative_humidity_2m_mean[1]) : 74;
      const tomorrowDate = d && d.time ? d.time[1] : new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      const hourlyPm = (aqJson.hourly && aqJson.hourly.pm2_5) || [];
      const avgSlice = function (startIdx, endIdx, fallbackVal) {
        const slice = hourlyPm.slice(startIdx, endIdx).filter(function (v) { return typeof v === 'number' && !isNaN(v); });
        if (!slice.length) return fallbackVal;
        const sum = slice.reduce(function (s, v) { return s + v; }, 0);
        return Number((sum / slice.length).toFixed(1));
      };

      const pm25Prev2 = avgSlice(0, 24, st.defaultEvening.pm25Prev2);
      const pm25Yesterday = avgSlice(24, 48, st.defaultEvening.pm25Yesterday);
      const pm25Today = avgSlice(48, 72, st.defaultEvening.pm25Today);

      const dow = new Date(tomorrowDate + 'T12:00:00').getDay();
      const isWeekend = dow === 0 || dow === 6 ? 1 : 0;

      return {
        station: stationKey,
        date: tomorrowDate,
        pm25Today: pm25Today,
        pm25Yesterday: pm25Yesterday,
        pm25Prev2: pm25Prev2,
        windSpeed: Number(windSpeed.toFixed(1)),
        windDir: Math.round(windDir),
        rainMm: Number(rainMm.toFixed(1)),
        humidity: Math.round(humidity),
        isWeekend: isWeekend,
        fetchedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    },

    fetchCorridorTelemetry: async function (threshold) {
      const nodes = window.NafasData.CORRIDOR_NODES;
      const lats = nodes.map(function (n) { return n.lat; }).join(',');
      const lons = nodes.map(function (n) { return n.lon; }).join(',');

      try {
        const aqUrl =
          'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' +
          lats +
          '&longitude=' +
          lons +
          '&current=pm2_5,pm10&hourly=pm2_5&timezone=Asia%2FJakarta&past_days=2&forecast_days=1';
        const wxUrl =
          'https://api.open-meteo.com/v1/forecast?latitude=' +
          lats +
          '&longitude=' +
          lons +
          '&current=wind_speed_10m,wind_direction_10m,relative_humidity_2m&timezone=Asia%2FJakarta';

        const res = await Promise.all([fetch(aqUrl), fetch(wxUrl)]);
        if (!res[0].ok || !res[1].ok) throw new Error('Corridor fetch error');
        const aqArr = await res[0].json();
        const wxArr = await res[1].json();

        return nodes.map(function (node, idx) {
          const aq = Array.isArray(aqArr) ? aqArr[idx] : aqArr;
          const wx = Array.isArray(wxArr) ? wxArr[idx] : wxArr;
          const st = window.NafasData.getStation(node.stationKey);
          const currentPm = aq && aq.current && typeof aq.current.pm2_5 === 'number'
            ? Number(aq.current.pm2_5.toFixed(1))
            : st.defaultEvening.pm25Today;
          const currentPm10 = aq && aq.current && typeof aq.current.pm10 === 'number'
            ? Number(aq.current.pm10.toFixed(1))
            : Number((currentPm * 1.45).toFixed(1));
          const windSpeed = wx && wx.current && typeof wx.current.wind_speed_10m === 'number'
            ? Number(wx.current.wind_speed_10m.toFixed(1))
            : st.defaultEvening.windSpeed;
          const windDir = wx && wx.current && typeof wx.current.wind_direction_10m === 'number'
            ? Math.round(wx.current.wind_direction_10m)
            : st.defaultEvening.windDir;
          const humidity = wx && wx.current && typeof wx.current.relative_humidity_2m === 'number'
            ? Math.round(wx.current.relative_humidity_2m)
            : st.defaultEvening.humidity;

          const input = {
            pm25Today: currentPm,
            pm25Yesterday: st.defaultEvening.pm25Yesterday,
            pm25Prev2: st.defaultEvening.pm25Prev2,
            windSpeed: windSpeed,
            windDir: windDir,
            rainMm: 0,
            humidity: humidity,
            isWeekend: new Date().getDay() % 6 === 0 ? 1 : 0
          };
          const pred = window.NafasML.predict(input, node.stationKey, threshold);

          return {
            node: node,
            currentPm25: currentPm,
            currentPm10: currentPm10,
            windSpeed: windSpeed,
            windDir: windDir,
            humidity: humidity,
            predTomorrow: pred.gbr,
            prob: pred.probability,
            isAlert: pred.isAlert,
            liveSource: true
          };
        });
      } catch (e) {
        // Fallback to local station snapshot if offline
        return nodes.map(function (node, idx) {
          const st = window.NafasData.getStation(node.stationKey);
          const delta = idx === 2 ? -2.6 : idx === 3 ? -3.4 : 0;
          const basePm = Number((st.defaultEvening.pm25Today + delta).toFixed(1));
          const input = Object.assign({}, st.defaultEvening, { pm25Today: basePm });
          const pred = window.NafasML.predict(input, node.stationKey, threshold);
          return {
            node: node,
            currentPm25: basePm,
            currentPm10: Number((basePm * 1.42).toFixed(1)),
            windSpeed: st.defaultEvening.windSpeed,
            windDir: st.defaultEvening.windDir,
            humidity: st.defaultEvening.humidity,
            predTomorrow: pred.gbr,
            prob: pred.probability,
            isAlert: pred.isAlert,
            liveSource: false
          };
        });
      }
    }
  };

  function buildFloatingTopbarMarkup(activePage) {
    const navItems = [
      { id: 'dashboard', href: 'dashboard.html', icon: 'layout-dashboard', i18n: 'nav_dashboard' },
      { id: 'analysis', href: 'analisis-model.html', icon: 'bar-chart-3', i18n: 'nav_analysis' },
      { id: 'simulator', href: 'simulator-audit.html', icon: 'sliders-horizontal', i18n: 'nav_simulator' }
    ];

    const linksHtml = navItems
      .map(function (item) {
        const isActive = item.id === activePage;
        const cls = isActive
          ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white font-semibold'
          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white font-medium';
        return (
          '<a href="' +
          item.href +
          '" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-[13px] whitespace-nowrap shrink-0 transition-colors duration-150 ' +
          cls +
          '">' +
          '<i data-lucide="' +
          item.icon +
          '" class="w-3.5 h-3.5 shrink-0"></i>' +
          '<span data-i18n="' +
          item.i18n +
          '"></span>' +
          '</a>'
        );
      })
      .join('');

    const dashMobileCls =
      activePage === 'dashboard'
        ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white font-semibold'
        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 font-medium';

    const moreMobileCls =
      activePage !== 'dashboard'
        ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white font-semibold'
        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 font-medium';

    const analysisMobileCls =
      activePage === 'analysis'
        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold'
        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium';

    const simulatorMobileCls =
      activePage === 'simulator'
        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold'
        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium';

    return (
      '<div class="fixed top-3 sm:top-4 inset-x-0 z-[1100] pointer-events-none">' +
      '<div class="max-w-[1320px] mx-auto px-4 sm:px-6">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 sm:gap-3">' +

      // Left: Dark Floating Brand Pill
      '<a href="dashboard.html" class="pointer-events-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors text-xs sm:text-[13px] font-semibold whitespace-nowrap shrink-0">' +
      '<i data-lucide="wind" class="w-4 h-4 shrink-0"></i>' +
      '<span data-i18n="brand_name">Pollution AI</span>' +
      '</a>' +

      // Center: Floating White/Zinc Navigation Pill (Desktop full, Mobile Dashboard + More)
      '<div class="pointer-events-auto relative shrink-0">' +
      '<nav aria-label="Primary Navigation" class="flex items-center gap-1 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)] p-1.5">' +
      // Desktop items
      '<div class="hidden lg:flex items-center gap-1">' +
      linksHtml +
      '<span class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5 shrink-0"></span>' +
      '<button type="button" data-open-modal="modal-setting" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors duration-150">' +
      '<i data-lucide="settings" class="w-3.5 h-3.5 shrink-0"></i>' +
      '<span data-i18n="nav_setting">Setting</span>' +
      '</button>' +
      '<button type="button" data-open-modal="modal-guide" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors duration-150">' +
      '<i data-lucide="book-open" class="w-3.5 h-3.5 shrink-0"></i>' +
      '<span data-i18n="nav_guide">Guide</span>' +
      '</button>' +
      '</div>' +
      // Mobile / Compact items (Dashboard + More)
      '<div class="flex lg:hidden items-center gap-1">' +
      '<a href="dashboard.html" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ' +
      dashMobileCls +
      '">' +
      '<i data-lucide="layout-dashboard" class="w-3.5 h-3.5 shrink-0"></i>' +
      '<span data-i18n="nav_dashboard">Dashboard</span>' +
      '</a>' +
      '<button type="button" id="btn-mobile-more" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ' +
      moreMobileCls +
      '">' +
      '<span data-i18n="nav_more">More</span>' +
      '<i data-lucide="chevron-down" class="w-3.5 h-3.5 shrink-0"></i>' +
      '</button>' +
      '</div>' +
      '</nav>' +
      // Mobile More Floating Popover
      '<div id="mobile-more-menu" class="hidden lg:hidden absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-[0_12px_32px_rgba(0,0,0,0.16)] p-1.5 z-50 space-y-0.5">' +
      '<a href="analisis-model.html" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors ' +
      analysisMobileCls +
      '">' +
      '<i data-lucide="bar-chart-3" class="w-4 h-4 shrink-0"></i>' +
      '<span data-i18n="nav_analysis">Model Analysis</span>' +
      '</a>' +
      '<a href="simulator-audit.html" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors ' +
      simulatorMobileCls +
      '">' +
      '<i data-lucide="sliders-horizontal" class="w-4 h-4 shrink-0"></i>' +
      '<span data-i18n="nav_simulator">Simulator &amp; Audit</span>' +
      '</a>' +
      '<div class="my-1 border-t border-zinc-200 dark:border-zinc-800"></div>' +
      '<button type="button" data-open-modal="modal-setting" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">' +
      '<i data-lucide="settings" class="w-4 h-4 shrink-0"></i>' +
      '<span data-i18n="nav_setting">Setting</span>' +
      '</button>' +
      '<button type="button" data-open-modal="modal-guide" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">' +
      '<i data-lucide="book-open" class="w-4 h-4 shrink-0"></i>' +
      '<span data-i18n="nav_guide">Guide</span>' +
      '</button>' +
      '</div>' +
      '</div>' +

      // Right: Grouped Location, Language & Theme Floating Pill
      '<div class="pointer-events-auto relative w-full sm:w-auto flex items-center justify-between sm:justify-start gap-1.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)] p-1.5 shrink-0">' +
      // Location selector inside grouped settings pill
      '<div class="relative">' +
      '<button type="button" id="btn-station-pill" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200/70 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold whitespace-nowrap transition-colors">' +
      '<i data-lucide="map-pin" class="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0"></i>' +
      '<span id="topbar-station-chip">Surabaya</span>' +
      '<i data-lucide="chevron-down" class="w-3.5 h-3.5 text-zinc-500 shrink-0"></i>' +
      '</button>' +
      '<div id="station-pill-menu" class="hidden absolute left-0 mt-2 w-60 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-[0_12px_32px_rgba(0,0,0,0.16)] p-1.5 z-50">' +
      '<button type="button" data-quick-station="surabaya" class="station-quick-opt w-full text-left px-3 py-2 rounded-xl text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between gap-2">' +
      '<span data-i18n="dash_station_surabaya">Surabaya Urban Station</span>' +
      '<span class="station-check-sby text-zinc-900 dark:text-white font-bold">✓</span>' +
      '</button>' +
      '<button type="button" data-quick-station="gresik" class="station-quick-opt w-full text-left px-3 py-2 rounded-xl text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between gap-2">' +
      '<span data-i18n="dash_station_gresik">Gresik Industrial Corridor</span>' +
      '<span class="station-check-grs hidden text-zinc-900 dark:text-white font-bold">✓</span>' +
      '</button>' +
      '</div>' +
      '</div>' +

      '<span class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 shrink-0"></span>' +

      // Language + Theme grouped right beside Location
      '<div class="flex items-center gap-1">' +
      '<div class="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 p-0.5">' +
      '<button type="button" data-header-lang="en" class="px-2.5 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap shrink-0">EN</button>' +
      '<button type="button" data-header-lang="id" class="px-2.5 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap shrink-0">ID</button>' +
      '</div>' +
      '<button type="button" id="btn-header-theme" class="inline-flex items-center justify-center w-8 h-8 rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0" title="Toggle theme">' +
      '<i data-lucide="moon" class="w-4 h-4"></i>' +
      '</button>' +
      '</div>' +
      '</div>' +

      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="h-[112px] sm:h-[74px]" aria-hidden="true"></div>'
    );
  }

  function buildModalsMarkup() {
    return (
      '<div id="modal-setting" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-[2px] nafas-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-setting-heading">' +
      '<div class="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden nafas-modal-panel">' +
      '<div class="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">' +
      '<div class="flex items-center gap-2.5">' +
      '<i data-lucide="settings" class="w-5 h-5 text-zinc-800 dark:text-zinc-200"></i>' +
      '<h2 id="modal-setting-heading" class="text-lg font-bold text-zinc-900 dark:text-zinc-100" data-i18n="modal_setting_title">System Settings</h2>' +
      '</div>' +
      '<button type="button" data-close-modal="modal-setting" class="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">' +
      '<i data-lucide="x" class="w-4 h-4"></i>' +
      '</button>' +
      '</div>' +

      '<div class="px-6 pt-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950/40">' +
      '<button type="button" class="setting-tab-btn px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-zinc-900 dark:border-white text-zinc-900 dark:text-white whitespace-nowrap shrink-0" data-setting-tab="model" data-i18n="set_tab_model">Station & Calibration</button>' +
      '<button type="button" class="setting-tab-btn px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap shrink-0" data-setting-tab="theme" data-i18n="set_tab_theme">Theme & Language</button>' +
      '</div>' +

      '<div class="p-6 max-h-[72vh] overflow-y-auto">' +
      '<div id="setting-panel-model" class="space-y-5">' +
      '<div>' +
      '<label for="set-station-select" class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5" data-i18n="set_station_label">Monitoring Corridor Preset</label>' +
      '<select id="set-station-select" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">' +
      '<option value="surabaya" data-i18n="set_station_sby">Surabaya Urban Station (Commuter + Sea Breeze)</option>' +
      '<option value="gresik" data-i18n="set_station_grs">Gresik Industrial Corridor (Industrial Plume + Stagnation)</option>' +
      '</select>' +
      '</div>' +

      '<div>' +
      '<label for="set-prov-select" class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5" data-i18n="set_prov_label">Data Source Provenance Mode</label>' +
      '<select id="set-prov-select" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">' +
      '<option value="openaq_meteo" data-i18n="set_prov_opt1">OpenAQ Sensor + Open-Meteo Weather (Primary)</option>' +
      '<option value="openmeteo_fallback" data-i18n="set_prov_opt2">Open-Meteo Air Quality Fallback (Model Estimate)</option>' +
      '</select>' +
      '</div>' +

      '<div>' +
      '<div class="flex items-center justify-between mb-1.5">' +
      '<label for="set-thresh-range" class="text-xs font-semibold text-zinc-700 dark:text-zinc-300" data-i18n="set_thresh_label">Alert Decision Probability Threshold</label>' +
      '<span id="set-thresh-val" class="font-mono-tabular text-sm font-bold text-zinc-900 dark:text-zinc-100">0.38</span>' +
      '</div>' +
      '<input id="set-thresh-range" type="range" min="0.25" max="0.65" step="0.01" value="0.38" class="w-full nafas-slider" />' +
      '<p class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400" data-i18n="set_thresh_hint">Default 0.38 prioritizes preventing missed warnings over false alarms.</p>' +
      '</div>' +

      '<p class="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5" data-i18n="set_privacy_note">*All settings are stored locally in your browser without collecting personal data.</p>' +

      '<div id="set-feedback" class="hidden text-xs font-semibold text-emerald-700 dark:text-emerald-400"></div>' +

      '<div class="flex items-center justify-end gap-2.5 pt-2">' +
      '<button type="button" id="btn-set-reset" class="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0" data-i18n="set_btn_reset">Reset Default</button>' +
      '<button type="button" id="btn-set-save" class="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0" data-i18n="set_btn_save">Save Settings</button>' +
      '</div>' +
      '</div>' +

      '<div id="setting-panel-theme" class="hidden space-y-5">' +
      '<div>' +
      '<div class="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2" data-i18n="set_theme_label">Interface Theme</div>' +
      '<div class="grid grid-cols-2 gap-2.5">' +
      '<button type="button" data-set-theme="light" class="theme-choice-btn flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors">' +
      '<i data-lucide="sun" class="w-4 h-4"></i>' +
      '<span data-i18n="theme_light">Light</span>' +
      '</button>' +
      '<button type="button" data-set-theme="dark" class="theme-choice-btn flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors">' +
      '<i data-lucide="moon" class="w-4 h-4"></i>' +
      '<span data-i18n="theme_dark">Dark</span>' +
      '</button>' +
      '</div>' +
      '</div>' +

      '<div>' +
      '<div class="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2" data-i18n="set_lang_label">Interface Language</div>' +
      '<div class="grid grid-cols-2 gap-2.5">' +
      '<button type="button" data-set-lang="en" class="lang-choice-btn px-4 py-3 rounded-xl border text-sm font-semibold transition-colors">English (EN)</button>' +
      '<button type="button" data-set-lang="id" class="lang-choice-btn px-4 py-3 rounded-xl border text-sm font-semibold transition-colors">Bahasa Indonesia (ID)</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '<div id="modal-guide" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-[2px] nafas-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-guide-heading">' +
      '<div class="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden nafas-modal-panel">' +
      '<div class="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">' +
      '<div class="flex items-center gap-2.5">' +
      '<i data-lucide="book-open" class="w-5 h-5 text-zinc-800 dark:text-zinc-200"></i>' +
      '<h2 id="modal-guide-heading" class="text-lg font-bold text-zinc-900 dark:text-zinc-100" data-i18n="modal_guide_title">System Guide & Methodology</h2>' +
      '</div>' +
      '<button type="button" data-close-modal="modal-guide" class="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">' +
      '<i data-lucide="x" class="w-4 h-4"></i>' +
      '</button>' +
      '</div>' +

      '<div class="px-6 pt-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto bg-zinc-50 dark:bg-zinc-950/40">' +
      '<button type="button" class="guide-tab-btn px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-zinc-900 dark:border-white text-zinc-900 dark:text-white whitespace-nowrap shrink-0" data-guide-tab="about" data-i18n="guide_tab_about">About</button>' +
      '<button type="button" class="guide-tab-btn px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap shrink-0" data-guide-tab="pipeline" data-i18n="guide_tab_pipeline">ML Pipeline</button>' +
      '<button type="button" class="guide-tab-btn px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap shrink-0" data-guide-tab="protocol" data-i18n="guide_tab_protocol">19:00 Protocol</button>' +
      '<button type="button" class="guide-tab-btn px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap shrink-0" data-guide-tab="audit" data-i18n="guide_tab_audit">Evaluation & Audit</button>' +
      '<button type="button" class="guide-tab-btn px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap shrink-0" data-guide-tab="disclaimer" data-i18n="guide_tab_disclaimer">Disclaimer & Privacy</button>' +
      '</div>' +

      '<div class="p-6 max-h-[70vh] overflow-y-auto space-y-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">' +
      '<div id="guide-panel-about" class="space-y-4">' +
      '<h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_about_title"></h3>' +
      '<div class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5" data-i18n="guide_about_track"></div>' +
      '<p data-i18n="guide_about_desc"></p>' +
      '<div class="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">' +
      '<h4 class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400" data-i18n="guide_about_citations_title"></h4>' +
      '<p class="text-xs text-zinc-600 dark:text-zinc-400" data-i18n="guide_about_citations"></p>' +
      '<p class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 pt-1" data-i18n="guide_about_blind"></p>' +
      '</div>' +
      '</div>' +

      '<div id="guide-panel-pipeline" class="hidden space-y-4">' +
      '<h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_pipe_title"></h3>' +
      '<div class="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-1.5">' +
      '<h4 class="text-sm font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_pipe_s1_title"></h4>' +
      '<p class="text-xs text-zinc-600 dark:text-zinc-300" data-i18n="guide_pipe_s1_body"></p>' +
      '</div>' +
      '<div class="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-1.5">' +
      '<h4 class="text-sm font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_pipe_s2_title"></h4>' +
      '<p class="text-xs text-zinc-600 dark:text-zinc-300" data-i18n="guide_pipe_s2_body"></p>' +
      '</div>' +
      '</div>' +

      '<div id="guide-panel-protocol" class="hidden space-y-3">' +
      '<h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_proto_title"></h3>' +
      '<p data-i18n="guide_proto_body"></p>' +
      '</div>' +

      '<div id="guide-panel-audit" class="hidden space-y-3">' +
      '<h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_audit_title"></h3>' +
      '<p data-i18n="guide_audit_body"></p>' +
      '</div>' +

      '<div id="guide-panel-disclaimer" class="hidden space-y-3">' +
      '<h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100" data-i18n="guide_disc_title"></h3>' +
      '<div class="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-200 text-xs font-semibold" data-i18n="disclaimer_badge"></div>' +
      '<p data-i18n="guide_disc_body"></p>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function syncHeaderControls() {
    const st = currentState;
    $('[data-header-lang]').each(function () {
      const targetLang = $(this).attr('data-header-lang');
      if (targetLang === st.lang) {
        $(this)
          .addClass('bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm')
          .removeClass('text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white');
      } else {
        $(this)
          .removeClass('bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm')
          .addClass('text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white');
      }
    });

    $('#topbar-station-chip').text(st.station === 'gresik' ? 'Gresik' : 'Surabaya');
    $('.station-check-sby').toggleClass('hidden', st.station !== 'surabaya');
    $('.station-check-grs').toggleClass('hidden', st.station !== 'gresik');

    $('.theme-choice-btn').each(function () {
      const t = $(this).attr('data-set-theme');
      if (t === st.theme) {
        $(this).addClass('border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white').removeClass('border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400');
      } else {
        $(this).removeClass('border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white').addClass('border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400');
      }
    });

    $('.lang-choice-btn').each(function () {
      const l = $(this).attr('data-set-lang');
      if (l === st.lang) {
        $(this).addClass('border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white').removeClass('border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400');
      } else {
        $(this).removeClass('border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white').addClass('border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400');
      }
    });

    const iconName = st.theme === 'dark' ? 'sun' : 'moon';
    $('#btn-header-theme').html('<i data-lucide="' + iconName + '" class="w-4 h-4"></i>');

    $('#set-station-select').val(st.station);
    $('#set-prov-select').val(st.provenance);
    $('#set-thresh-range').val(st.threshold);
    $('#set-thresh-val').text(Number(st.threshold).toFixed(2));
  }

  window.NafasShell = {
    init: function (activePage, pageTitleI18nKey) {
      applyThemeClass(currentState.theme);
      if (window.Chart && window.Chart.defaults && window.Chart.defaults.font) {
        window.Chart.defaults.font.family = "'Poppins', system-ui, -apple-system, sans-serif";
      }

      // Inject Floating Pill Top Bar (No Sidebar)
      $('#nafas-topbar').html(buildFloatingTopbarMarkup(activePage));

      // Inject compact sub-header bar if present
      if ($('#nafas-page-banner').length) {
        $('#nafas-page-banner').html(
          '<div class="flex flex-wrap items-center justify-between gap-2 px-1">' +
          '<h1 class="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100" data-i18n="' +
          pageTitleI18nKey +
          '"></h1>' +
          '<div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">' +
          '<span class="font-semibold text-zinc-700 dark:text-zinc-300" data-i18n="role_title">Hello!</span>' +
          '<span aria-hidden="true">·</span>' +
          '<span class="font-mono-tabular" data-i18n="role_window">19:00 WIB | Surabaya–Gresik</span>' +
          '</div>' +
          '</div>'
        );
      }

      // Inject Global Footer
      const footerHtml =
        '<div class="px-4 sm:px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-600 dark:text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">' +
        '<div class="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">' +
        '<span class="font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap" data-i18n="disclaimer_badge">Experimental Prototype — Not Medical Advice</span>' +
        '<span class="hidden sm:inline text-zinc-300 dark:text-zinc-700">·</span>' +
        '<span data-i18n="disclaimer_full"></span>' +
        '</div>' +
        '<div class="text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">OpenAQ · Open-Meteo · Google Maps</div>' +
        '</div>';
      $('#nafas-footer').html(footerHtml);

      // Inject Modals
      $('#nafas-modals').html(buildModalsMarkup());

      // Bind Station Quick Selector Pill & Mobile More Popover
      $(document).on('click', '#btn-station-pill', function (e) {
        e.stopPropagation();
        $('#mobile-more-menu').addClass('hidden');
        $('#station-pill-menu').toggleClass('hidden');
      });

      $(document).on('click', '#btn-mobile-more', function (e) {
        e.stopPropagation();
        $('#station-pill-menu').addClass('hidden');
        $('#mobile-more-menu').toggleClass('hidden');
      });

      $(document).on('click', '[data-quick-station]', function () {
        const nextStation = $(this).attr('data-quick-station');
        $('#station-pill-menu').addClass('hidden');
        if (nextStation !== currentState.station) {
          window.NafasState.update({ station: nextStation, liveSnapshot: null });
        }
      });

      $(document).on('click', function (e) {
        if (!$(e.target).closest('#btn-station-pill, #station-pill-menu').length) {
          $('#station-pill-menu').addClass('hidden');
        }
        if (!$(e.target).closest('#btn-mobile-more, #mobile-more-menu').length) {
          $('#mobile-more-menu').addClass('hidden');
        }
      });

      // Bind Modal Open/Close
      $(document).on('click', '[data-open-modal]', function () {
        const id = $(this).attr('data-open-modal');
        $('#station-pill-menu, #mobile-more-menu').addClass('hidden');
        $('#' + id).removeClass('hidden');
        syncHeaderControls();
        if (window.lucide) window.lucide.createIcons();
      });

      $(document).on('click', '[data-close-modal]', function () {
        const id = $(this).attr('data-close-modal');
        $('#' + id).addClass('hidden');
      });

      $(document).on('click', '#modal-setting, #modal-guide', function (e) {
        if (e.target === this) {
          $(this).addClass('hidden');
        }
      });

      // Bind Setting Sub-Tabs
      $(document).on('click', '.setting-tab-btn', function () {
        const tab = $(this).attr('data-setting-tab');
        $('.setting-tab-btn')
          .removeClass('border-zinc-900 dark:border-white text-zinc-900 dark:text-white')
          .addClass('border-transparent text-zinc-600 dark:text-zinc-400');
        $(this)
          .addClass('border-zinc-900 dark:border-white text-zinc-900 dark:text-white')
          .removeClass('border-transparent text-zinc-600 dark:text-zinc-400');

        $('#setting-panel-model, #setting-panel-theme').addClass('hidden');
        $('#setting-panel-' + tab).removeClass('hidden');
      });

      // Bind Guide Sub-Tabs
      $(document).on('click', '.guide-tab-btn', function () {
        const tab = $(this).attr('data-guide-tab');
        $('.guide-tab-btn')
          .removeClass('border-zinc-900 dark:border-white text-zinc-900 dark:text-white')
          .addClass('border-transparent text-zinc-600 dark:text-zinc-400');
        $(this)
          .addClass('border-zinc-900 dark:border-white text-zinc-900 dark:text-white')
          .removeClass('border-transparent text-zinc-600 dark:text-zinc-400');

        $('#guide-panel-about, #guide-panel-pipeline, #guide-panel-protocol, #guide-panel-audit, #guide-panel-disclaimer').addClass('hidden');
        $('#guide-panel-' + tab).removeClass('hidden');
      });

      // Header Language & Theme toggles
      $(document).on('click', '[data-header-lang], [data-set-lang]', function () {
        const lang = $(this).attr('data-header-lang') || $(this).attr('data-set-lang');
        window.NafasState.update({ lang: lang });
      });

      $(document).on('click', '#btn-header-theme', function () {
        const nextTheme = currentState.theme === 'dark' ? 'light' : 'dark';
        window.NafasState.update({ theme: nextTheme });
      });

      $(document).on('click', '[data-set-theme]', function () {
        const t = $(this).attr('data-set-theme');
        window.NafasState.update({ theme: t });
      });

      // Setting Range live readout
      $(document).on('input', '#set-thresh-range', function () {
        $('#set-thresh-val').text(Number($(this).val()).toFixed(2));
      });

      // Setting Save & Reset
      $(document).on('click', '#btn-set-save', function () {
        const newStation = $('#set-station-select').val();
        const newProv = $('#set-prov-select').val();
        const newThresh = Number($('#set-thresh-range').val());
        const stationChanged = newStation !== currentState.station;
        window.NafasState.update({
          station: newStation,
          provenance: newProv,
          threshold: newThresh,
          liveSnapshot: stationChanged ? null : currentState.liveSnapshot
        });
        $('#set-feedback').text(window.NafasI18n.t('set_saved_msg')).removeClass('hidden');
        setTimeout(function () {
          $('#set-feedback').addClass('hidden');
        }, 2500);
      });

      $(document).on('click', '#btn-set-reset', function () {
        window.NafasState.resetSettings();
        $('#set-feedback').text(window.NafasI18n.t('set_saved_msg')).removeClass('hidden');
        setTimeout(function () {
          $('#set-feedback').addClass('hidden');
        }, 2500);
      });

      syncHeaderControls();
      if (window.NafasI18n) window.NafasI18n.apply();
      updateRealtimeHeader();
      setInterval(updateRealtimeHeader, 1000);
      if (window.lucide) window.lucide.createIcons();
    }
  };
})();