(function () {
  let activeTab = 'overview';
  let activeLogFilter = 'all';
  let sliderCutoff = null;

  let chartOverview = null;
  let chartBaseline = null;
  let chartTradeoff = null;
  let chartWind = null;
  let chartStagnation = null;

  function chartColors() {
    const isDark = window.NafasState.get().theme === 'dark';
    return {
      text: isDark ? '#d4d4d8' : '#3f3f46',
      grid: isDark ? 'rgba(161, 161, 170, 0.14)' : 'rgba(24, 24, 27, 0.08)',
      actual: '#18181b',
      actualDark: '#fafafa',
      baseline: '#a1a1aa',
      ml: isDark ? '#a1a1aa' : '#52525b',
      epa: '#ef4444'
    };
  }

  function destroyChart(ref) {
    if (ref && typeof ref.destroy === 'function') ref.destroy();
    return null;
  }

  function setActiveTab(tabId) {
    activeTab = tabId;
    $('.analysis-tab-btn').each(function () {
      const id = $(this).attr('data-analysis-tab');
      if (id === tabId) {
        $(this)
          .addClass('bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm')
          .removeClass('text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800');
      } else {
        $(this)
          .removeClass('bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm')
          .addClass('text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800');
      }
    });

    $('.analysis-panel').addClass('hidden');
    $('#panel-' + tabId).removeClass('hidden');
    renderCurrentAnalysis();
  }

  function renderCurrentAnalysis() {
    const state = window.NafasState.get();
    const t = window.NafasI18n.t.bind(window.NafasI18n);
    const records = window.NafasData.getTestRecords(state.station);
    const effectiveCutoff = sliderCutoff !== null ? sliderCutoff : state.threshold;
    const evalRes = window.NafasML.evaluateTestSet(records, state.station, state.threshold, state.customTestDays);
    const drivers = window.NafasML.computeLocalDrivers(records, state.station);
    const colors = chartColors();
    const isDark = state.theme === 'dark';

    // Tab 1: Overview
    if (activeTab === 'overview') {
      $('#ov-mae-val').text(evalRes.maeGbr.toFixed(2) + ' µg/m³');
      $('#ov-mae-comp').text('vs. ' + evalRes.maeBase.toFixed(2) + ' µg/m³ (-' + evalRes.reductionPct + '%)');
      $('#ov-recall-val').text(evalRes.recall.toFixed(1) + '%');
      $('#ov-recall-counts').text(evalRes.tp + ' / ' + (evalRes.tp + evalRes.fn) + ' ' + t('trade_tp_title'));
      $('#ov-driver-val').text(drivers.highStagAvg.toFixed(1) + ' µg/m³');

      const recent = evalRes.rows.slice(-18);
      chartOverview = destroyChart(chartOverview);
      const ctxOv = document.getElementById('chart-overview');
      if (ctxOv) {
        chartOverview = new Chart(ctxOv, {
          type: 'line',
          data: {
            labels: recent.map(function (r) { return r.record.date.slice(5); }),
            datasets: [
              {
                label: t('base_chart_actual'),
                data: recent.map(function (r) { return r.actual; }),
                borderColor: isDark ? colors.actualDark : colors.actual,
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                tension: 0.25,
                pointRadius: 3
              },
              {
                label: t('base_chart_ml'),
                data: recent.map(function (r) { return r.pred.gbr; }),
                borderColor: colors.ml,
                backgroundColor: isDark ? 'rgba(161, 161, 170, 0.12)' : 'rgba(82, 82, 91, 0.08)',
                borderWidth: 2.5,
                tension: 0.25,
                pointRadius: 3
              },
              {
                label: t('base_chart_pers'),
                data: recent.map(function (r) { return r.pred.baseline; }),
                borderColor: colors.baseline,
                borderDash: [4, 4],
                borderWidth: 1.8,
                tension: 0.2,
                pointRadius: 0
              },
              {
                label: t('base_chart_epa'),
                data: recent.map(function () { return 35; }),
                borderColor: colors.epa,
                borderDash: [6, 4],
                borderWidth: 1.5,
                pointRadius: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: colors.text, boxWidth: 12 } } },
            scales: {
              x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
              y: { ticks: { color: colors.text }, grid: { color: colors.grid }, suggestedMin: 15, suggestedMax: 55 }
            }
          }
        });
      }
    }

    // Tab 2: Baseline vs ML
    if (activeTab === 'baseline') {
      $('#base-mae-pers').text(evalRes.maeBase.toFixed(2) + ' µg/m³');
      $('#base-mae-ridge').text(evalRes.maeRidge.toFixed(2) + ' µg/m³');
      $('#base-mae-gbr').text(evalRes.maeGbr.toFixed(2) + ' µg/m³');
      const ridgeRed = (((evalRes.maeBase - evalRes.maeRidge) / evalRes.maeBase) * 100).toFixed(1);
      $('#base-red-ridge').text('-' + ridgeRed + '% ' + t('dash_kpi_mae_reduction'));
      $('#base-red-gbr').text('-' + evalRes.reductionPct + '% ' + t('dash_kpi_mae_reduction'));

      chartBaseline = destroyChart(chartBaseline);
      const ctxBase = document.getElementById('chart-baseline');
      if (ctxBase) {
        chartBaseline = new Chart(ctxBase, {
          type: 'line',
          data: {
            labels: evalRes.rows.map(function (r) { return r.record.date.slice(5); }),
            datasets: [
              {
                label: t('base_chart_actual'),
                data: evalRes.rows.map(function (r) { return r.actual; }),
                borderColor: isDark ? colors.actualDark : colors.actual,
                borderWidth: 2.5,
                tension: 0.25,
                pointRadius: 2.5
              },
              {
                label: t('base_chart_ml'),
                data: evalRes.rows.map(function (r) { return r.pred.gbr; }),
                borderColor: colors.ml,
                borderWidth: 2.5,
                tension: 0.25,
                pointRadius: 2.5
              },
              {
                label: t('base_chart_pers'),
                data: evalRes.rows.map(function (r) { return r.pred.baseline; }),
                borderColor: colors.baseline,
                borderDash: [4, 4],
                borderWidth: 1.8,
                tension: 0.2,
                pointRadius: 0
              },
              {
                label: t('base_chart_epa'),
                data: evalRes.rows.map(function () { return 35; }),
                borderColor: colors.epa,
                borderDash: [6, 4],
                borderWidth: 1.5,
                pointRadius: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: colors.text, boxWidth: 12 } } },
            scales: {
              x: { ticks: { color: colors.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { color: colors.grid } },
              y: { ticks: { color: colors.text }, grid: { color: colors.grid }, suggestedMin: 15, suggestedMax: 55 }
            }
          }
        });
      }
    }

    // Tab 3: Threshold Trade-off
    if (activeTab === 'tradeoff') {
      const tradeEval = window.NafasML.evaluateTestSet(records, state.station, effectiveCutoff, state.customTestDays);
      $('#trade-slider').val(effectiveCutoff);
      $('#trade-slider-val').text(Number(effectiveCutoff).toFixed(2));
      $('#trade-fn-count').text(tradeEval.fn);
      $('#trade-fp-count').text(tradeEval.fp);
      $('#trade-tp-count').text(tradeEval.tp);
      $('#trade-recall-pct').text(tradeEval.recall.toFixed(1) + '%');

      const curve = window.NafasML.computeThresholdCurve(records, state.station, state.customTestDays);
      chartTradeoff = destroyChart(chartTradeoff);
      const ctxTrade = document.getElementById('chart-tradeoff');
      if (ctxTrade) {
        chartTradeoff = new Chart(ctxTrade, {
          type: 'line',
          data: {
            labels: curve.map(function (p) { return p.threshold.toFixed(2); }),
            datasets: [
              {
                label: t('trade_missed_title'),
                data: curve.map(function (p) { return p.missedWarnings; }),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.25
              },
              {
                label: t('trade_false_title'),
                data: curve.map(function (p) { return p.falseAlarms; }),
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.10)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.25
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: colors.text, boxWidth: 12 } } },
            scales: {
              x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
              y: { ticks: { color: colors.text, stepSize: 1 }, grid: { color: colors.grid }, beginAtZero: true }
            }
          }
        });
      }
    }

    // Tab 4: Local polution Drivers
    if (activeTab === 'drivers') {
      $('#drv-weekday-val').text(drivers.dayType.weekday.toFixed(1) + ' µg/m³');
      $('#drv-weekend-val').text(drivers.dayType.weekend.toFixed(1) + ' µg/m³');
      $('#drv-dry-val').text(drivers.rainfall.dry.toFixed(1) + ' µg/m³');
      $('#drv-wet-val').text(drivers.rainfall.wet.toFixed(1) + ' µg/m³');

      chartWind = destroyChart(chartWind);
      const ctxWind = document.getElementById('chart-drivers-wind');
      if (ctxWind) {
        chartWind = new Chart(ctxWind, {
          type: 'bar',
          data: {
            labels: [t('drv_sector_ind'), t('drv_sector_trans'), t('drv_sector_sea')],
            datasets: [
              {
                label: 'PM2.5 (µg/m³)',
                data: [drivers.windDirections.industrial, drivers.windDirections.transitional, drivers.windDirections.seaBreeze],
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                borderRadius: 8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: colors.text }, grid: { display: false } },
              y: { ticks: { color: colors.text }, grid: { color: colors.grid }, beginAtZero: true, suggestedMax: 50 }
            }
          }
        });
      }

      chartStagnation = destroyChart(chartStagnation);
      const ctxStag = document.getElementById('chart-drivers-stag');
      if (ctxStag) {
        chartStagnation = new Chart(ctxStag, {
          type: 'bar',
          data: {
            labels: [t('drv_stag_calm'), t('drv_stag_mod'), t('drv_stag_brisk')],
            datasets: [
              {
                label: 'PM2.5 (µg/m³)',
                data: [drivers.stagnation.calm, drivers.stagnation.moderate, drivers.stagnation.brisk],
                backgroundColor: ['#dc2626', isDark ? '#a1a1aa' : '#52525b', '#10b981'],
                borderRadius: 8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: colors.text }, grid: { display: false } },
              y: { ticks: { color: colors.text }, grid: { color: colors.grid }, beginAtZero: true, suggestedMax: 50 }
            }
          }
        });
      }
    }

    // Tab 5: Chronological Test Log
    if (activeTab === 'testlog') {
      const filtered = evalRes.rows.filter(function (row) {
        if (activeLogFilter === 'safe') return !row.pred.isAlert;
        if (activeLogFilter === 'alert') return row.pred.isAlert;
        return true;
      });

      $('#log-count-summary').text(
        evalRes.count + ' days · MAE ' + evalRes.maeGbr.toFixed(2) + ' vs ' + evalRes.maeBase.toFixed(2) + ' µg/m³'
      );

      if (!filtered.length) {
        $('#test-log-tbody').html(
          '<tr><td colspan="9" class="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">' +
            t('log_empty') +
            '</td></tr>'
        );
      } else {
        const rowsHtml = filtered
          .map(function (row, idx) {
            const r = row.record;
            const p = row.pred;
            const statusCls = p.isAlert
              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900';
            const statusLbl = p.isAlert ? 'ALERT' : 'SAFE';
            const customTag = r.isCustom
              ? ' <span class="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">(' + t('log_custom_badge') + ')</span>'
              : '';

            return (
              '<tr class="border-b border-zinc-100 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">' +
              r.date +
              customTag +
              '</td>' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs text-right text-zinc-700 dark:text-zinc-300">' +
              r.pm25Today.toFixed(1) +
              '</td>' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs text-right text-zinc-700 dark:text-zinc-300">' +
              r.windSpeed.toFixed(1) +
              '</td>' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs text-right text-zinc-700 dark:text-zinc-300">' +
              r.rainMm.toFixed(1) +
              '</td>' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs text-right font-semibold text-zinc-900 dark:text-zinc-100">' +
              row.actual.toFixed(1) +
              '</td>' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs text-right text-zinc-500 dark:text-zinc-400">' +
              p.baseline.toFixed(1) +
              '</td>' +
              '<td class="px-4 py-2.5 font-mono-tabular text-xs text-right font-semibold text-zinc-900 dark:text-white">' +
              p.gbr.toFixed(1) +
              '</td>' +
              '<td class="px-4 py-2.5 text-center">' +
              '<span class="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ' +
              statusCls +
              '">' +
              statusLbl +
              '</span>' +
              '</td>' +
              '<td class="px-4 py-2.5 text-right">' +
              '<button type="button" class="btn-inspect-row px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800" data-row-date="' +
              r.date +
              '" data-row-idx="' +
              idx +
              '">' +
              t('log_inspect_btn') +
              '</button>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
        $('#test-log-tbody').html(rowsHtml);
      }
    }
  }

  function openInspectModal(dateStr) {
    const state = window.NafasState.get();
    const t = window.NafasI18n.t.bind(window.NafasI18n);
    const records = window.NafasData.getTestRecords(state.station);
    const evalRes = window.NafasML.evaluateTestSet(records, state.station, state.threshold, state.customTestDays);
    const found = evalRes.rows.find(function (r) { return r.record.date === dateStr; });
    if (!found) return;

    const r = found.record;
    const p = found.pred;
    const f = p.features;

    $('#inspect-modal-date').text(r.date);
    $('#inspect-features-list').html(
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>PM2.5 Lag-1</span><span class="font-mono-tabular font-semibold">' + f.lag1.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>PM2.5 Lag-2</span><span class="font-mono-tabular font-semibold">' + f.lag2.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>3-Day Rolling Avg</span><span class="font-mono-tabular font-semibold">' + f.rolling3d.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>Wind / Direction</span><span class="font-mono-tabular font-semibold">' + f.windSpeed.toFixed(1) + ' km/h · ' + f.windDir + '°</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>Rain / Humidity</span><span class="font-mono-tabular font-semibold">' + f.rainMm.toFixed(1) + ' mm · ' + f.humidity + '%</span></div>' +
      '<div class="flex justify-between py-1"><span>Day Type</span><span class="font-semibold">' + (f.isWeekend ? 'Weekend' : 'Weekday') + '</span></div>'
    );

    $('#inspect-outcome-list').html(
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>' + t('log_col_actual') + '</span><span class="font-mono-tabular font-bold">' + found.actual.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>' + t('log_col_ml') + '</span><span class="font-mono-tabular font-bold text-zinc-900 dark:text-white">' + p.gbr.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>Ridge Prediction</span><span class="font-mono-tabular font-semibold">' + p.ridge.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800"><span>' + t('log_col_base') + '</span><span class="font-mono-tabular font-semibold">' + p.baseline.toFixed(1) + ' µg/m³</span></div>' +
      '<div class="flex justify-between py-1"><span>' + t('sim_out_prob') + '</span><span class="font-mono-tabular font-bold">' + Math.round(p.probability * 100) + '% (' + p.status + ')</span></div>'
    );

    $('#modal-inspect-day').removeClass('hidden');
  }

  $(function () {
    window.NafasShell.init('analysis', 'page_title_analysis');
    window.onNafasStateChange = function () {
      sliderCutoff = null;
      renderCurrentAnalysis();
    };

    // Check URL hash for direct tab navigation from Dashboard
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'baseline', 'tradeoff', 'drivers', 'testlog'].includes(hash)) {
      activeTab = hash;
    }

    setActiveTab(activeTab);

    $('.analysis-tab-btn').on('click', function () {
      const tab = $(this).attr('data-analysis-tab');
      setActiveTab(tab);
    });

    // Trade-off slider
    $('#trade-slider').on('input', function () {
      sliderCutoff = Number($(this).val());
      $('#trade-apply-msg').addClass('hidden');
      renderCurrentAnalysis();
    });

    $('#btn-trade-apply').on('click', function () {
      if (sliderCutoff === null) sliderCutoff = window.NafasState.get().threshold;
      window.NafasState.update({ threshold: Number(sliderCutoff.toFixed(2)) });
      $('#trade-apply-msg').removeClass('hidden');
      setTimeout(function () { $('#trade-apply-msg').addClass('hidden'); }, 2400);
    });

    // Log filter tabs
    $('.log-filter-btn').on('click', function () {
      activeLogFilter = $(this).attr('data-log-filter');
      $('.log-filter-btn')
        .removeClass('bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm')
        .addClass('text-zinc-600 dark:text-zinc-400');
      $(this)
        .addClass('bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm')
        .removeClass('text-zinc-600 dark:text-zinc-400');
      renderCurrentAnalysis();
    });

    // Inspect row modal
    $(document).on('click', '.btn-inspect-row', function () {
      openInspectModal($(this).attr('data-row-date'));
    });

    // Custom test day modal
    $('#btn-open-custom-day').on('click', function () {
      $('#modal-custom-day').removeClass('hidden');
    });

    $('#form-custom-day').on('submit', function (e) {
      e.preventDefault();
      const state = window.NafasState.get();
      const newRec = {
        date: $('#cust-date').val() || '2026-10-30',
        pm25Today: Number($('#cust-today').val()),
        pm25Yesterday: Number($('#cust-yesterday').val()),
        pm25Prev2: Number($('#cust-prev2').val()),
        windSpeed: Number($('#cust-wind').val()),
        windDir: Number($('#cust-wind-dir').val()),
        rainMm: Number($('#cust-rain').val()),
        humidity: Number($('#cust-humidity').val()),
        isWeekend: new Date($('#cust-date').val() + 'T12:00:00').getDay() % 6 === 0 ? 1 : 0,
        actualTomorrow: Number($('#cust-actual').val()),
        isCustom: true
      };
      const updated = (state.customTestDays || []).concat([newRec]);
      window.NafasState.update({ customTestDays: updated });
      $('#modal-custom-day').addClass('hidden');
      setActiveTab('testlog');
    });
  });
})();
