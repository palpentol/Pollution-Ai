(function () {
  const STATIONS = {
    surabaya: {
      key: 'surabaya',
      nameEn: 'Surabaya Urban Station',
      nameId: 'Stasiun Urban Surabaya',
      lat: -7.2575,
      lon: 112.7521,
      stationOffset: 0.0,
      openaqRef: 'OpenAQ-ID-SBY-01',
      defaultEvening: {
        date: '2026-11-14',
        pm25Today: 38.4,
        pm25Yesterday: 35.8,
        pm25Prev2: 33.9,
        windSpeed: 7.4,
        windDir: 148,
        rainMm: 0.0,
        humidity: 76,
        isWeekend: 0
      }
    },
    gresik: {
      key: 'gresik',
      nameEn: 'Gresik Industrial Corridor',
      nameId: 'Koridor Industri Gresik',
      lat: -7.1568,
      lon: 112.6555,
      stationOffset: 4.2,
      openaqRef: 'OpenAQ-ID-GRS-02',
      defaultEvening: {
        date: '2026-11-14',
        pm25Today: 42.1,
        pm25Yesterday: 39.5,
        pm25Prev2: 37.8,
        windSpeed: 6.8,
        windDir: 160,
        rainMm: 0.0,
        humidity: 78,
        isWeekend: 0
      }
    }
  };

  // Chronological unseen out-of-sample test records (Surabaya-Gresik Corridor, 2026-09-24 to 2026-10-29)
  // Ordered strictly in forward chronological sequence (zero shuffling, zero leakage).
  const CHRONOLOGICAL_TEST_RECORDS = [
    { date: '2026-09-24', pm25Today: 34.2, pm25Yesterday: 31.8, pm25Prev2: 30.5, windSpeed: 8.4, windDir: 145, rainMm: 0.0, humidity: 72, isWeekend: 0, actualTomorrow: 37.8 },
    { date: '2026-09-25', pm25Today: 37.8, pm25Yesterday: 34.2, pm25Prev2: 31.8, windSpeed: 7.2, windDir: 158, rainMm: 0.0, humidity: 75, isWeekend: 0, actualTomorrow: 41.2 },
    { date: '2026-09-26', pm25Today: 41.2, pm25Yesterday: 37.8, pm25Prev2: 34.2, windSpeed: 9.8, windDir: 135, rainMm: 0.0, humidity: 71, isWeekend: 1, actualTomorrow: 33.4 },
    { date: '2026-09-27', pm25Today: 33.4, pm25Yesterday: 41.2, pm25Prev2: 37.8, windSpeed: 12.6, windDir: 48, rainMm: 0.2, humidity: 66, isWeekend: 1, actualTomorrow: 27.6 },
    { date: '2026-09-28', pm25Today: 27.6, pm25Yesterday: 33.4, pm25Prev2: 41.2, windSpeed: 10.4, windDir: 72, rainMm: 0.0, humidity: 68, isWeekend: 0, actualTomorrow: 32.1 },
    { date: '2026-09-29', pm25Today: 32.1, pm25Yesterday: 27.6, pm25Prev2: 33.4, windSpeed: 8.6, windDir: 150, rainMm: 0.0, humidity: 73, isWeekend: 0, actualTomorrow: 36.9 },
    { date: '2026-09-30', pm25Today: 36.9, pm25Yesterday: 32.1, pm25Prev2: 27.6, windSpeed: 7.0, windDir: 165, rainMm: 0.0, humidity: 77, isWeekend: 0, actualTomorrow: 42.5 },
    { date: '2026-10-01', pm25Today: 42.5, pm25Yesterday: 36.9, pm25Prev2: 32.1, windSpeed: 6.4, windDir: 170, rainMm: 0.0, humidity: 79, isWeekend: 0, actualTomorrow: 46.1 },
    { date: '2026-10-02', pm25Today: 46.1, pm25Yesterday: 42.5, pm25Prev2: 36.9, windSpeed: 8.8, windDir: 142, rainMm: 1.4, humidity: 76, isWeekend: 0, actualTomorrow: 36.8 },
    { date: '2026-10-03', pm25Today: 36.8, pm25Yesterday: 46.1, pm25Prev2: 42.5, windSpeed: 11.4, windDir: 62, rainMm: 4.8, humidity: 80, isWeekend: 1, actualTomorrow: 24.5 },
    { date: '2026-10-04', pm25Today: 24.5, pm25Yesterday: 36.8, pm25Prev2: 46.1, windSpeed: 13.2, windDir: 35, rainMm: 0.0, humidity: 65, isWeekend: 1, actualTomorrow: 25.8 },
    { date: '2026-10-05', pm25Today: 25.8, pm25Yesterday: 24.5, pm25Prev2: 36.8, windSpeed: 9.2, windDir: 128, rainMm: 0.0, humidity: 70, isWeekend: 0, actualTomorrow: 33.7 },
    { date: '2026-10-06', pm25Today: 33.7, pm25Yesterday: 25.8, pm25Prev2: 24.5, windSpeed: 6.9, windDir: 152, rainMm: 0.0, humidity: 74, isWeekend: 0, actualTomorrow: 40.4 },
    { date: '2026-10-07', pm25Today: 40.4, pm25Yesterday: 33.7, pm25Prev2: 25.8, windSpeed: 5.8, windDir: 162, rainMm: 0.0, humidity: 78, isWeekend: 0, actualTomorrow: 43.6 },
    // Failure Audit Case 1: False Alarm (Sudden unforecasted overnight convective storm washout)
    { date: '2026-10-08', pm25Today: 43.6, pm25Yesterday: 40.4, pm25Prev2: 33.7, windSpeed: 5.4, windDir: 166, rainMm: 0.4, humidity: 81, isWeekend: 0, actualTomorrow: 21.3, auditCase: 'false_alarm' },
    { date: '2026-10-09', pm25Today: 21.3, pm25Yesterday: 43.6, pm25Prev2: 40.4, windSpeed: 13.8, windDir: 42, rainMm: 2.2, humidity: 75, isWeekend: 0, actualTomorrow: 23.4 },
    { date: '2026-10-10', pm25Today: 23.4, pm25Yesterday: 21.3, pm25Prev2: 43.6, windSpeed: 11.9, windDir: 54, rainMm: 0.0, humidity: 67, isWeekend: 1, actualTomorrow: 22.8 },
    { date: '2026-10-11', pm25Today: 22.8, pm25Yesterday: 23.4, pm25Prev2: 21.3, windSpeed: 10.6, windDir: 88, rainMm: 0.0, humidity: 68, isWeekend: 1, actualTomorrow: 28.9 },
    { date: '2026-10-12', pm25Today: 28.9, pm25Yesterday: 22.8, pm25Prev2: 23.4, windSpeed: 8.2, windDir: 140, rainMm: 0.0, humidity: 72, isWeekend: 0, actualTomorrow: 36.2 },
    { date: '2026-10-13', pm25Today: 36.2, pm25Yesterday: 28.9, pm25Prev2: 22.8, windSpeed: 7.4, windDir: 155, rainMm: 0.0, humidity: 74, isWeekend: 0, actualTomorrow: 39.5 },
    { date: '2026-10-14', pm25Today: 39.5, pm25Yesterday: 36.2, pm25Prev2: 28.9, windSpeed: 6.5, windDir: 168, rainMm: 0.0, humidity: 77, isWeekend: 0, actualTomorrow: 43.8 },
    { date: '2026-10-15', pm25Today: 43.8, pm25Yesterday: 39.5, pm25Prev2: 36.2, windSpeed: 10.1, windDir: 96, rainMm: 3.6, humidity: 79, isWeekend: 0, actualTomorrow: 30.2 },
    { date: '2026-10-16', pm25Today: 30.2, pm25Yesterday: 43.8, pm25Prev2: 39.5, windSpeed: 12.1, windDir: 50, rainMm: 0.0, humidity: 69, isWeekend: 0, actualTomorrow: 29.4 },
    { date: '2026-10-17', pm25Today: 29.4, pm25Yesterday: 30.2, pm25Prev2: 43.8, windSpeed: 9.7, windDir: 112, rainMm: 0.0, humidity: 70, isWeekend: 1, actualTomorrow: 28.1 },
    { date: '2026-10-18', pm25Today: 28.1, pm25Yesterday: 29.4, pm25Prev2: 30.2, windSpeed: 10.9, windDir: 68, rainMm: 0.0, humidity: 68, isWeekend: 1, actualTomorrow: 28.4 },
    // Failure Audit Case 2: Missed Warning (Hyper-local nocturnal burning + shallow micro-inversion)
    { date: '2026-10-19', pm25Today: 28.4, pm25Yesterday: 28.1, pm25Prev2: 29.4, windSpeed: 11.2, windDir: 78, rainMm: 0.0, humidity: 69, isWeekend: 0, actualTomorrow: 44.1, auditCase: 'missed_warning' },
    { date: '2026-10-20', pm25Today: 44.1, pm25Yesterday: 28.4, pm25Prev2: 28.1, windSpeed: 6.7, windDir: 158, rainMm: 0.0, humidity: 76, isWeekend: 0, actualTomorrow: 45.2 },
    { date: '2026-10-21', pm25Today: 45.2, pm25Yesterday: 44.1, pm25Prev2: 28.4, windSpeed: 6.1, windDir: 174, rainMm: 0.0, humidity: 79, isWeekend: 0, actualTomorrow: 47.4 },
    { date: '2026-10-22', pm25Today: 47.4, pm25Yesterday: 45.2, pm25Prev2: 44.1, windSpeed: 9.4, windDir: 138, rainMm: 5.5, humidity: 82, isWeekend: 0, actualTomorrow: 29.8 },
    { date: '2026-10-23', pm25Today: 29.8, pm25Yesterday: 47.4, pm25Prev2: 45.2, windSpeed: 12.8, windDir: 44, rainMm: 1.2, humidity: 74, isWeekend: 0, actualTomorrow: 26.2 },
    { date: '2026-10-24', pm25Today: 26.2, pm25Yesterday: 29.8, pm25Prev2: 47.4, windSpeed: 11.5, windDir: 58, rainMm: 0.0, humidity: 66, isWeekend: 1, actualTomorrow: 24.9 },
    { date: '2026-10-25', pm25Today: 24.9, pm25Yesterday: 26.2, pm25Prev2: 29.8, windSpeed: 9.1, windDir: 120, rainMm: 0.0, humidity: 69, isWeekend: 1, actualTomorrow: 29.6 },
    { date: '2026-10-26', pm25Today: 29.6, pm25Yesterday: 24.9, pm25Prev2: 26.2, windSpeed: 7.6, windDir: 149, rainMm: 0.0, humidity: 74, isWeekend: 0, actualTomorrow: 37.1 },
    { date: '2026-10-27', pm25Today: 37.1, pm25Yesterday: 29.6, pm25Prev2: 24.9, windSpeed: 6.9, windDir: 164, rainMm: 0.0, humidity: 76, isWeekend: 0, actualTomorrow: 41.8 },
    { date: '2026-10-28', pm25Today: 41.8, pm25Yesterday: 37.1, pm25Prev2: 29.6, windSpeed: 8.3, windDir: 152, rainMm: 0.0, humidity: 75, isWeekend: 0, actualTomorrow: 39.2 },
    { date: '2026-10-29', pm25Today: 39.2, pm25Yesterday: 41.8, pm25Prev2: 37.1, windSpeed: 10.8, windDir: 84, rainMm: 2.8, humidity: 78, isWeekend: 0, actualTomorrow: 30.4 }
  ];

  const CORRIDOR_NODES = [
    { id: 'surabaya', nameEn: 'Surabaya Urban Station', nameId: 'Stasiun Urban Surabaya', lat: -7.2575, lon: 112.7521, stationKey: 'surabaya' },
    { id: 'gresik', nameEn: 'Gresik Industrial Corridor', nameId: 'Koridor Industri Gresik', lat: -7.1568, lon: 112.6555, stationKey: 'gresik' },
    { id: 'perak', nameEn: 'Tanjung Perak Coastal Node', nameId: 'Titik Pesisir Tanjung Perak', lat: -7.2015, lon: 112.7324, stationKey: 'surabaya' },
    { id: 'sidoarjo', nameEn: 'Sidoarjo South Corridor', nameId: 'Koridor Selatan Sidoarjo', lat: -7.4478, lon: 112.7183, stationKey: 'surabaya' }
  ];

  window.NafasData = {
    EPA_THRESHOLD: 35.0,
    STATIONS: STATIONS,
    CORRIDOR_NODES: CORRIDOR_NODES,
    getStation: function (key) {
      return STATIONS[key] || STATIONS.surabaya;
    },
    getTestRecords: function (stationKey) {
      const st = this.getStation(stationKey);
      const offset = st.stationOffset;
      return CHRONOLOGICAL_TEST_RECORDS.map(function (r) {
        // Gresik Industrial Corridor carries higher baseline particulate concentrations,
        // except on heavy storm washouts where both drop strongly.
        const scale = r.rainMm > 3 ? 0.5 : 1.0;
        const adj = offset * scale;
        return {
          date: r.date,
          pm25Today: Number((r.pm25Today + adj).toFixed(1)),
          pm25Yesterday: Number((r.pm25Yesterday + adj).toFixed(1)),
          pm25Prev2: Number((r.pm25Prev2 + adj).toFixed(1)),
          windSpeed: r.windSpeed,
          windDir: r.windDir,
          rainMm: r.rainMm,
          humidity: r.humidity,
          isWeekend: r.isWeekend,
          actualTomorrow: Number((r.actualTomorrow + (r.auditCase === 'false_alarm' ? 0 : adj)).toFixed(1)),
          auditCase: r.auditCase || null,
          isCustom: false
        };
      });
    }
  };
})();
