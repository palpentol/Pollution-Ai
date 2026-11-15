(function () {
  let lMapInstance = null;
  let lTileLayer = null;
  let lMapTheme = null;
  let lMarkers = [];
  let lHeatmapCircles = [];
  let heatmapEnabled = true;
  let corridorData = null;

  function renderDashboard() {
    const state = window.NafasState.get();
    const t = window.NafasI18n.t.bind(window.NafasI18n);
    const station = window.NafasData.getStation(state.station);
    const testRecords = window.NafasData.getTestRecords(state.station);
    const evalRes = window.NafasML.evaluateTestSet(
      testRecords,
      state.station,
      state.threshold,
      state.customTestDays
    );

    const activeSnapshot =
      state.liveSnapshot && state.liveSnapshot.station === state.station
        ? state.liveSnapshot
        : station.defaultEvening;

    const forecast = window.NafasML.predict(activeSnapshot, state.station, state.threshold);
    const isAlert = forecast.isAlert;
    const probPct = Math.round(forecast.probability * 100);
    const stationName = state.lang === 'id' ? station.nameId : station.nameEn;

    const isFallback = state.provenance === 'openmeteo_fallback' || (state.liveSnapshot && state.liveSnapshot.station === state.station);
    const provTitle = isFallback ? t('dash_prov_fallback') : t('dash_prov_openaq');
    const provDesc = isFallback ? t('dash_prov_fallback_desc') : t('dash_prov_openaq_desc');

    const syncText =
      state.liveSnapshot && state.liveSnapshot.station === state.station
        ? t('dash_live_updated') + ' (' + state.liveSnapshot.fetchedAt + ')'
        : t('dash_live_cached') + ' (' + activeSnapshot.date + ')';

    const maxScale = 70;
    const predPct = Math.min(100, Math.max(2, (forecast.gbr / maxScale) * 100));
    const basePct = Math.min(100, Math.max(2, (forecast.baseline / maxScale) * 100));
    const epaPct = (35 / maxScale) * 100;

    $('#kpi-pred-val').text(forecast.gbr.toFixed(1));
    $('#kpi-pred-unit').text('µg/m³');
    $('#kpi-station-label').text(stationName);
    $('#dash-sync-status').text(syncText);

    const $statusCard = $('#kpi-status-card');
    const $statusBadge = $('#kpi-status-text');
    if (isAlert) {
      $statusCard
        .removeClass('bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900')
        .addClass('bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900');
      $statusBadge
        .text(t('dash_status_alert'))
        .removeClass('text-emerald-700 dark:text-emerald-400')
        .addClass('text-red-700 dark:text-red-400');
    } else {
      $statusCard
        .removeClass('bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900')
        .addClass('bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900');
      $statusBadge
        .text(t('dash_status_safe'))
        .removeClass('text-red-700 dark:text-red-400')
        .addClass('text-emerald-700 dark:text-emerald-400');
    }
    $('#kpi-prob-text').text(probPct + '% ' + t('dash_kpi_prob_suffix'));
    $('#kpi-thresh-text').text(t('dash_kpi_thresh_label') + ': ' + Number(state.threshold).toFixed(2));

    $('#kpi-mae-ml').text(evalRes.maeGbr.toFixed(2));
    $('#kpi-mae-base').text(evalRes.maeBase.toFixed(2));
    $('#kpi-mae-red').text('-' + evalRes.reductionPct + '% ' + t('dash_kpi_mae_reduction'));

    $('#kpi-prov-title').text(provTitle);
    $('#kpi-prov-desc').text(provDesc);

    $('#gauge-fill')
      .css('width', predPct + '%')
      .toggleClass('bg-red-500', isAlert)
      .toggleClass('bg-emerald-500', !isAlert);
    $('#gauge-epa-line').css('left', epaPct + '%');
    $('#gauge-baseline-marker').css('left', basePct + '%');
    $('#gauge-baseline-val').text(forecast.baseline.toFixed(1) + ' µg/m³');
    $('#gauge-pred-val').text(forecast.gbr.toFixed(1) + ' µg/m³');

    const protoBox = $('#dash-protocol-box');
    const items = isAlert
      ? [t('dash_proto_alert_1'), t('dash_proto_alert_2'), t('dash_proto_alert_3'), t('dash_proto_alert_4')]
      : [t('dash_proto_safe_1'), t('dash_proto_safe_2'), t('dash_proto_safe_3'), t('dash_proto_safe_4')];

    protoBox
      .toggleClass('bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-900', isAlert)
      .toggleClass('bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900', !isAlert);

    $('#dash-proto-title')
      .text(isAlert ? t('dash_proto_alert_title') : t('dash_proto_safe_title'))
      .toggleClass('text-red-800 dark:text-red-300', isAlert)
      .toggleClass('text-emerald-800 dark:text-emerald-300', !isAlert);

    $('#dash-proto-desc').text(isAlert ? t('dash_proto_alert_desc') : t('dash_proto_safe_desc'));

    const listHtml = items
      .map(function (line, idx) {
        const numCls = isAlert
          ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
          : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300';
        return (
          '<li class="flex items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">' +
          '<span class="w-6 h-6 rounded-lg font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ' +
          numCls +
          '">0' +
          (idx + 1) +
          '</span>' +
          '<span>' +
          line +
          '</span>' +
          '</li>'
        );
      })
      .join('');
    $('#dash-proto-list').html(listHtml);

    renderCorridorList();
    renderLeafletMap();
  }

  function renderCorridorList() {
    if (!corridorData || !corridorData.length) return;
    const state = window.NafasState.get();

    const cardsHtml = corridorData
      .map(function (item) {
        const label = state.lang === 'id' ? item.node.nameId : item.node.nameEn;
        const isAlert = item.isAlert;
        const badgeCls = isAlert
          ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900'
          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900';

        return (
          '<button type="button" data-focus-node="' +
          item.node.id +
          '" class="w-full text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors space-y-1.5">' +
          '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">' +
          label +
          '</span>' +
          '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ' +
          badgeCls +
          '">' +
          (isAlert ? 'ALERT' : 'SAFE') +
          '</span>' +
          '</div>' +
          '<div class="flex items-center justify-between text-xs font-mono-tabular text-zinc-600 dark:text-zinc-300">' +
          '<span>Now: <strong class="text-zinc-900 dark:text-white">' +
          item.currentPm25.toFixed(1) +
          '</strong> µg/m³</span>' +
          '<span>ML: <strong class="text-zinc-900 dark:text-white">' +
          item.predTomorrow.toFixed(1) +
          '</strong> µg/m³</span>' +
          '</div>' +
          '<div class="text-[11px] font-mono-tabular text-zinc-500 dark:text-zinc-400">' +
          item.windSpeed.toFixed(1) +
          ' km/h · ' +
          item.windDir +
          '° · RH ' +
          item.humidity +
          '%' +
          '</div>' +
          '</button>'
        );
      })
      .join('');

    $('#map-corridor-list').html(cardsHtml);
  }

  function renderLeafletMap() {
    const mapContainer = document.getElementById('aq-map');
    if (!mapContainer || typeof L === 'undefined') return;

    // Sembunyikan banner error Google Maps jika sebelumnya muncul
    $('#map-fallback-notice').addClass('hidden');
    $('#gmp-quota-banner').addClass('hidden');

    const state = window.NafasState.get();
    const isDark = state.theme === 'dark';

    // Inisialisasi peta Leaflet (Gratis, tanpa API Key)
    if (!lMapInstance) {
      const station = window.NafasData.getStation(state.station);
      const initialCenter = station && state.station === 'gresik'
        ? [-7.19, 112.69]
        : [-7.24, 112.71];

      lMapInstance = L.map(mapContainer, {
        center: initialCenter,
        zoom: 11,
        zoomControl: true
      });
    }

    // Ganti gaya peta sesuai tema (OpenStreetMap Resmi - 100% Gratis tanpa API Key)
    if (lMapTheme !== state.theme) {
      lMapTheme = state.theme;
      if (lTileLayer) {
        lMapInstance.removeLayer(lTileLayer);
      }

      lTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(lMapInstance);

      // Terapkan efek dark mode khusus pada layer peta saja (tanpa membalik warna pin)
      const tilePane = lMapInstance.getPane('tilePane');
      if (tilePane) {
        tilePane.style.filter = isDark
          ? 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)'
          : 'none';
      }
    }

    // Bersihkan marker & lingkaran heatmap lama
    lMarkers.forEach(function (m) { lMapInstance.removeLayer(m); });
    lMarkers = [];
    lHeatmapCircles.forEach(function (c) { lMapInstance.removeLayer(c); });
    lHeatmapCircles = [];

    if (corridorData && corridorData.length) {
      corridorData.forEach(function (item) {
        const isAlert = item.isAlert;
        const label = state.lang === 'id' ? item.node.nameId : item.node.nameEn;

        // Simulasi radius sebaran polusi (pengganti Google Air Quality Heatmap)
        if (heatmapEnabled) {
          const heatCircle = L.circle([item.node.lat, item.node.lon], {
            radius: 3200,
            stroke: false,
            fillColor: isAlert ? '#ef4444' : '#10b981',
            fillOpacity: 0.22
          }).addTo(lMapInstance);
          lHeatmapCircles.push(heatCircle);
        }

        // Custom Pin HTML sesuai desain asli
        const borderCol = isAlert ? '#ef4444' : '#10b981';
        const bgCol = isDark ? '#18181b' : '#ffffff';
        const txtCol = isDark ? '#f4f4f5' : '#18181b';

        const customIcon = L.divIcon({
          className: 'nafas-leaflet-pin',
          html:
            '<div style="display:inline-block; white-space:nowrap; padding:5px 10px; border-radius:10px; ' +
            'font-family:Poppins,sans-serif; font-size:11px; font-weight:700; cursor:pointer; ' +
            'box-shadow:0 2px 8px rgba(0,0,0,0.22); border:2px solid ' + borderCol + '; ' +
            'background:' + bgCol + '; color:' + txtCol + '; transform:translate(-50%, -50%);">' +
            item.currentPm25.toFixed(1) + ' µg/m³</div>',
          iconSize: [0, 0]
        });

        const statusText = isAlert ? 'ALERT (> 35 µg/m³)' : 'SAFE (≤ 35 µg/m³)';
        const popupHtml =
          '<div style="font-family: Poppins, sans-serif; color:#18181b; min-width:190px; padding:2px;">' +
          '<div style="font-weight:700; font-size:13px; margin-bottom:4px;">' + label + '</div>' +
          '<div style="font-size:12px; margin-bottom:2px;">Current PM2.5: <strong>' + item.currentPm25.toFixed(1) + ' µg/m³</strong></div>' +
          '<div style="font-size:12px; margin-bottom:2px;">ML Tomorrow: <strong>' + item.predTomorrow.toFixed(1) + ' µg/m³</strong></div>' +
          '<div style="font-size:11px; color:#52525b; margin-bottom:4px;">Wind: ' + item.windSpeed.toFixed(1) + ' km/h (' + item.windDir + '°)</div>' +
          '<div style="font-size:11px; font-weight:700; color:' + (isAlert ? '#dc2626' : '#059669') + ';">' + statusText + '</div>' +
          '</div>';

        const marker = L.marker([item.node.lat, item.node.lon], { icon: customIcon })
          .addTo(lMapInstance)
          .bindPopup(popupHtml);

        lMarkers.push(marker);
      });
    }
  }

  async function refreshCorridorMap() {
    const state = window.NafasState.get();
    corridorData = await window.NafasLiveAPI.fetchCorridorTelemetry(state.threshold);
    renderCorridorList();
    renderLeafletMap();
  }

  $(function () {
    window.NafasShell.init('dashboard', 'page_title_dashboard');
    window.onNafasStateChange = function () {
      renderDashboard();
      refreshCorridorMap();
    };
    renderDashboard();
    refreshCorridorMap();

    $('#btn-map-heatmap-toggle').on('click', function () {
      heatmapEnabled = !heatmapEnabled;
      $(this)
        .toggleClass('bg-zinc-900 text-white dark:bg-white dark:text-zinc-900', heatmapEnabled)
        .toggleClass('bg-white text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', !heatmapEnabled);

      renderLeafletMap();
    });

    $('#btn-map-recenter').on('click', function () {
      if (lMapInstance) {
        lMapInstance.setView([-7.24, 112.71], 11);
      }
    });

    $(document).on('click', '[data-focus-node]', function () {
      const id = $(this).attr('data-focus-node');
      if (!corridorData || !lMapInstance) return;
      const found = corridorData.find(function (c) { return c.node.id === id; });
      if (found) {
        lMapInstance.setView([found.node.lat, found.node.lon], 12);
      }
    });

    $('#btn-dash-sync-live').on('click', async function () {
      const $btn = $(this);
      const t = window.NafasI18n.t.bind(window.NafasI18n);
      const state = window.NafasState.get();
      $btn.prop('disabled', true).find('span').text(t('dash_btn_fetching'));
      $('#dash-live-error').addClass('hidden');

      try {
        const liveData = await window.NafasLiveAPI.fetchOpenMeteo(state.station);
        window.NafasState.update({ liveSnapshot: liveData });
      } catch (err) {
        $('#dash-live-error').text(t('dash_live_error')).removeClass('hidden');
      } finally {
        $btn.prop('disabled', false).find('span').text(t('dash_btn_fetch_live'));
      }
    });
  });
})();