(function () {
  let activeModule = null; // null = default empty placeholder state
  let chartContrib = null;
  let chartAudit = null;
  let liveFetchedData = null;

  function destroyChart(ref) {
    if (ref && typeof ref.destroy === 'function') ref.destroy();
    return null;
  }

  function getSimDefaults() {
    const state = window.NafasState.get();
    if (state.simulatorInputs) return state.simulatorInputs;
    const st = window.NafasData.getStation(state.station);
    return Object.assign({}, st.defaultEvening);
  }

  function selectModule(modId) {
    activeModule = modId;
    $('.sim-module-card').each(function () {
      const id = $(this).attr('data-sim-module');
      if (id === modId) {
        $(this)
          .addClass('border-zinc-900 dark:border-white ring-2 ring-zinc-900/15 dark:ring-white/20 bg-zinc-50 dark:bg-zinc-800/70')
          .removeClass('border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900');
      } else {
        $(this)
          .removeClass('border-zinc-900 dark:border-white ring-2 ring-zinc-900/15 dark:ring-white/20 bg-zinc-50 dark:bg-zinc-800/70')
          .addClass('border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900');
      }
    });

    renderWorkingFrame();
  }

  function renderWorkingFrame() {
    const t = window.NafasI18n.t.bind(window.NafasI18n);
    const state = window.NafasState.get();
    const isDark = state.theme === 'dark';
    const textColor = isDark ? '#d4d4d8' : '#3f3f46';
    const gridColor = isDark ? 'rgba(161, 161, 170, 0.14)' : 'rgba(24, 24, 27, 0.08)';

    chartContrib = destroyChart(chartContrib);
    chartAudit = destroyChart(chartAudit);

    if (!activeModule) {
      $('#sim-empty-state').removeClass('hidden');
      $('#sim-panel-live, #sim-panel-whatif, #sim-panel-audit').addClass('hidden');
      return;
    }

    $('#sim-empty-state').addClass('hidden');
    $('#sim-panel-live, #sim-panel-whatif, #sim-panel-audit').addClass('hidden');

    if (activeModule === 'live') {
      $('#sim-panel-live').removeClass('hidden');
      const st = window.NafasData.getStation(state.station);
      const stationName = state.lang === 'id' ? st.nameId : st.nameEn;
      $('#live-station-badge').text(stationName + ' (' + st.lat.toFixed(4) + ', ' + st.lon.toFixed(4) + ')');

      const snap = liveFetchedData || state.liveSnapshot;
      if (snap && snap.station === state.station) {
        const res = window.NafasML.predict(snap, state.station, state.threshold);
        const probPct = Math.round(res.probability * 100);
        $('#live-results-wrap').removeClass('hidden');
        $('#live-val-today').text(snap.pm25Today.toFixed(1) + ' µg/m³');
        $('#live-val-rolling').text(res.features.rolling3d.toFixed(1) + ' µg/m³');
        $('#live-val-wind').text(snap.windSpeed.toFixed(1) + ' km/h · ' + snap.windDir + '°');
        $('#live-val-rain').text(snap.rainMm.toFixed(1) + ' mm · ' + snap.humidity + '%');
        $('#live-out-gbr').text(res.gbr.toFixed(1) + ' µg/m³');
        $('#live-out-base').text(res.baseline.toFixed(1) + ' µg/m³');
        $('#live-out-prob').text(probPct + '%');
        $('#live-out-status')
          .text(res.isAlert ? t('dash_status_alert') : t('dash_status_safe'))
          .toggleClass('text-red-600 dark:text-red-400', res.isAlert)
          .toggleClass('text-emerald-600 dark:text-emerald-400', !res.isAlert);
      } else {
        $('#live-results-wrap').addClass('hidden');
      }
    }

    if (activeModule === 'whatif') {
      $('#sim-panel-whatif').removeClass('hidden');
      const inp = getSimDefaults();

      $('#inp-lag1').val(inp.pm25Today);
      $('#inp-lag2').val(inp.pm25Yesterday);
      $('#inp-prev2').val(inp.pm25Prev2);
      $('#inp-wind').val(inp.windSpeed);
      $('#inp-winddir').val(inp.windDir);
      $('#inp-rain').val(inp.rainMm);
      $('#inp-hum').val(inp.humidity);
      $('#inp-daytype').val(String(inp.isWeekend ? 1 : 0));

      updateWhatIfOutput(inp, textColor, gridColor);
    }

    if (activeModule === 'audit1' || activeModule === 'audit2') {
      $('#sim-panel-audit').removeClass('hidden');
      const isCase1 = activeModule === 'audit1';
      const records = window.NafasData.getTestRecords(state.station);
      const targetKey = isCase1 ? 'false_alarm' : 'missed_warning';
      const rec = records.find(function (r) { return r.auditCase === targetKey; }) || records[14];
      const pred = window.NafasML.predict(rec, state.station, state.threshold);
      const err = (pred.gbr - rec.actualTomorrow).toFixed(1);

      $('#audit-heading').text(isCase1 ? t('audit_title_1') : t('audit_title_2'));
      $('#audit-date-val').text(rec.date);
      $('#audit-actual-val').text(rec.actualTomorrow.toFixed(1) + ' µg/m³');
      $('#audit-ml-val').text(pred.gbr.toFixed(1) + ' µg/m³ (' + Math.round(pred.probability * 100) + '%)');
      $('#audit-base-val').text(pred.baseline.toFixed(1) + ' µg/m³');
      $('#audit-err-val').text((Number(err) > 0 ? '+' : '') + err + ' µg/m³');
      $('#audit-anomaly-text').text(isCase1 ? t('audit_case1_anomaly') : t('audit_case2_anomaly'));
      $('#audit-limit-text').text(isCase1 ? t('audit_case1_limit') : t('audit_case2_limit'));

      const ctxAudit = document.getElementById('chart-audit-compare');
      if (ctxAudit) {
        chartAudit = new Chart(ctxAudit, {
          type: 'bar',
          data: {
            labels: [t('audit_label_actual'), t('audit_label_pred'), t('audit_label_base'), 'US EPA Limit'],
            datasets: [
              {
                label: 'PM2.5 (µg/m³)',
                data: [rec.actualTomorrow, pred.gbr, pred.baseline, 35.0],
                backgroundColor: [
                  rec.actualTomorrow > 35 ? '#ef4444' : '#10b981',
                  isDark ? '#e4e4e7' : '#18181b',
                  '#a1a1aa',
                  '#f59e0b'
                ],
                borderRadius: 8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: textColor }, grid: { display: false } },
              y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true, suggestedMax: 55 }
            }
          }
        });
      }
    }
  }

  function updateWhatIfOutput(inp, textColor, gridColor) {
    const state = window.NafasState.get();
    const t = window.NafasI18n.t.bind(window.NafasI18n);
    const res = window.NafasML.predict(inp, state.station, state.threshold);
    const probPct = Math.round(res.probability * 100);

    $('#val-lag1').text(Number(inp.pm25Today).toFixed(1));
    $('#val-lag2').text(Number(inp.pm25Yesterday).toFixed(1));
    $('#val-prev2').text(Number(inp.pm25Prev2).toFixed(1));
    $('#val-rolling').text(res.features.rolling3d.toFixed(1) + ' µg/m³');
    $('#val-wind').text(Number(inp.windSpeed).toFixed(1) + ' km/h');
    $('#val-winddir').text(Math.round(inp.windDir) + '°');
    $('#val-rain').text(Number(inp.rainMm).toFixed(1) + ' mm');
    $('#val-hum').text(Math.round(inp.humidity) + '%');

    $('#sim-out-gbr').text(res.gbr.toFixed(1) + ' µg/m³');
    $('#sim-out-ridge').text(res.ridge.toFixed(1) + ' µg/m³');
    $('#sim-out-base').text(res.baseline.toFixed(1) + ' µg/m³');
    $('#sim-out-prob').text(probPct + '%');

    $('#sim-out-status-badge')
      .text(res.isAlert ? t('dash_status_alert') : t('dash_status_safe'))
      .toggleClass('bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900', res.isAlert)
      .toggleClass('bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900', !res.isAlert);

    const c = res.contributions;
    const labels =
      state.lang === 'id'
        ? ['Lag & Rolling 3-Hari', 'Dispersi Angin', 'Pencucian Hujan', 'Kelembaban', 'Hari Kerja & Sektor']
        : ['Lag & 3-Day Rolling', 'Wind Dispersion', 'Rain Washout', 'Humidity Trap', 'Weekday & Sector'];
    const vals = [c.lagAndRolling, c.windDispersion, c.rainWashout, c.humidityTrap, c.weekdayAndSector];

    chartContrib = destroyChart(chartContrib);
    const ctx = document.getElementById('chart-sim-contrib');
    if (ctx) {
      chartContrib = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Δ µg/m³',
              data: vals,
              backgroundColor: vals.map(function (v) { return v >= 0 ? '#ef4444' : '#10b981'; }),
              borderRadius: 6
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { display: false } }
          }
        }
      });
    }
  }

  $(function () {
    window.NafasShell.init('simulator', 'page_title_simulator');
    window.onNafasStateChange = renderWorkingFrame;

    // Optional hash entry from Dashboard quick-launch cards
    const hash = window.location.hash.replace('#', '');
    if (['live', 'whatif', 'audit1', 'audit2'].includes(hash)) {
      selectModule(hash);
    } else {
      renderWorkingFrame();
    }

    $('.sim-module-card').on('click', function () {
      const mod = $(this).attr('data-sim-module');
      selectModule(mod);
    });

    // Live Fetcher action
    $('#btn-live-fetch').on('click', async function () {
      const $btn = $(this);
      const t = window.NafasI18n.t.bind(window.NafasI18n);
      const state = window.NafasState.get();
      $btn.prop('disabled', true).find('span').text(t('dash_btn_fetching'));
      $('#live-fetch-error').addClass('hidden');
      $('#live-applied-msg').addClass('hidden');

      try {
        liveFetchedData = await window.NafasLiveAPI.fetchOpenMeteo(state.station);
        renderWorkingFrame();
      } catch (err) {
        $('#live-fetch-error').text(t('dash_live_error')).removeClass('hidden');
      } finally {
        $btn.prop('disabled', false).find('span').text(t('sim_live_btn'));
      }
    });

    $('#btn-live-apply').on('click', function () {
      if (!liveFetchedData) return;
      window.NafasState.update({ liveSnapshot: liveFetchedData });
      $('#live-applied-msg').removeClass('hidden');
      setTimeout(function () { $('#live-applied-msg').addClass('hidden'); }, 2500);
    });

    // What-If Simulator Sliders
    $(document).on('input change', '.whatif-input', function () {
      const inp = {
        pm25Today: Number($('#inp-lag1').val()),
        pm25Yesterday: Number($('#inp-lag2').val()),
        pm25Prev2: Number($('#inp-prev2').val()),
        windSpeed: Number($('#inp-wind').val()),
        windDir: Number($('#inp-winddir').val()),
        rainMm: Number($('#inp-rain').val()),
        humidity: Number($('#inp-hum').val()),
        isWeekend: Number($('#inp-daytype').val())
      };
      window.NafasState.update({ simulatorInputs: inp });
    });

    $('#btn-whatif-reset').on('click', function () {
      window.NafasState.update({ simulatorInputs: null });
    });
  });
})();
