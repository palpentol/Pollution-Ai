(function () {
  const EPA_LIMIT = 35.0;

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function engineerFeatures(input, stationKey) {
    const station = window.NafasData.getStation(stationKey);
    const lag1 = Number(input.pm25Today) || 0;
    const lag2 = Number(input.pm25Yesterday) || lag1;
    const prev2 = Number(input.pm25Prev2) || lag2;
    const rolling3d = (lag1 + lag2 + prev2) / 3.0;
    const trend1d = lag1 - lag2;
    const windSpeed = Math.max(0.5, Number(input.windSpeed) || 8.0);
    const windDir = ((Number(input.windDir) || 140) % 360 + 360) % 360;
    const rainMm = Math.max(0, Number(input.rainMm) || 0);
    const humidity = clamp(Number(input.humidity) || 72, 20, 100);
    const isWeekend = Number(input.isWeekend) ? 1 : 0;

    // Industrial corridor transport vector peaks near 158 deg (SSE/SE Surabaya-Gresik industrial belt)
    // Sea breeze from NE (35 deg) produces negative industrial transport factor
    const angleRad = ((windDir - 158) * Math.PI) / 180;
    const industrialFactor = clamp(Math.cos(angleRad), -0.8, 1.0);
    const stagnationIndex = clamp((13.5 - windSpeed) / 10.0, -0.5, 1.2);
    const rainWashout = Math.log1p(rainMm);
    const humidityAnomaly = (humidity - 70) / 20.0;

    return {
      lag1: lag1,
      lag2: lag2,
      prev2: prev2,
      rolling3d: rolling3d,
      trend1d: trend1d,
      windSpeed: windSpeed,
      windDir: windDir,
      rainMm: rainMm,
      humidity: humidity,
      isWeekend: isWeekend,
      industrialFactor: industrialFactor,
      stagnationIndex: stagnationIndex,
      rainWashout: rainWashout,
      humidityAnomaly: humidityAnomaly,
      stationOffset: station.stationOffset
    };
  }

  // Stage 2A: Ridge Regression (L2-regularized linear coefficients)
  function predictRidge(f) {
    const raw =
      8.4 +
      0.56 * f.lag1 +
      0.09 * f.lag2 +
      0.16 * f.rolling3d -
      0.62 * f.windSpeed +
      2.9 * f.industrialFactor -
      4.3 * f.rainWashout +
      1.25 * f.humidityAnomaly -
      2.2 * f.isWeekend +
      0.22 * f.stationOffset;
    return Number(clamp(raw, 5.0, 150.0).toFixed(1));
  }

  // Stage 2B: Gradient Boosting Decision Trees (Autoregressive initial estimator + boosted residual trees)
  function predictGBR(f) {
    const baseAnchor = 0.64 * f.lag1 + 0.14 * f.rolling3d + 0.22 * (32.2 + f.stationOffset);

    // Boosted Tree 1: Wind Dispersion & Industrial Corridor Transport
    let t1 = 0;
    if (f.windSpeed < 7.8) {
      t1 = f.industrialFactor > 0.25 ? 4.4 : 2.3;
    } else if (f.windSpeed <= 10.5) {
      t1 = f.industrialFactor > 0.35 ? 1.8 : -0.9;
    } else {
      t1 = f.windSpeed > 12.2 ? -4.2 : -2.2;
    }

    // Boosted Tree 2: Rainfall Wet Deposition Washout
    let t2 = 0;
    if (f.rainMm >= 3.5) {
      t2 = -9.4;
    } else if (f.rainMm >= 1.0) {
      t2 = -4.6;
    } else {
      t2 = 0.4;
    }

    // Boosted Tree 3: Weekday Commuter Traffic vs. Weekend Drop
    let t3 = 0;
    if (f.isWeekend === 1) {
      t3 = f.lag1 > 34 ? -3.6 : -2.1;
    } else {
      t3 = f.trend1d > 1.5 ? 2.1 : 0.9;
    }

    // Boosted Tree 4: Sea-Breeze Ventilation vs. High-Humidity Nocturnal Trap
    let t4 = 0;
    if (f.industrialFactor < -0.15 && f.windSpeed >= 10.0) {
      t4 = -2.4;
    } else if (f.humidity >= 76 && f.rainMm < 0.5) {
      t4 = 1.6;
    }

    // Boosted Tree 5: Multi-day Stagnation Buildup vs. Post-Peak Mean Reversion
    let t5 = 0;
    if (f.rolling3d >= 36.0 && f.windSpeed < 7.5 && f.rainMm < 0.5) {
      t5 = 2.1;
    } else if (f.lag1 < f.lag2 - 8.0) {
      t5 = -1.6;
    }

    const pred = clamp(baseAnchor + t1 + t2 + t3 + t4 + t5, 6.0, 150.0);

    // Calibrated probability of exceeding 35 ug/m3 US EPA 24h standard
    const sigmaLocal = 3.6 + (f.rainMm > 0.1 && f.rainMm < 2.5 ? 1.0 : 0) + (f.windSpeed >= 8.5 && f.windSpeed <= 11.5 ? 0.5 : 0);
    const z = (pred - EPA_LIMIT) / sigmaLocal;
    const probAlert = clamp(1.0 / (1.0 + Math.exp(-1.702 * z)), 0.02, 0.98);

    const contributions = {
      baseMean: Number(baseAnchor.toFixed(1)),
      lagAndRolling: Number((0.14 * (f.rolling3d - 32.0) + t5).toFixed(1)),
      windDispersion: Number((t1 + (t4 < 0 ? t4 : 0)).toFixed(1)),
      rainWashout: Number((t2 < 0 ? t2 : 0).toFixed(1)),
      humidityTrap: Number(((t2 > 0 ? t2 : 0) + (t4 > 0 ? t4 : 0)).toFixed(1)),
      weekdayAndSector: Number(t3.toFixed(1))
    };

    return {
      prediction: Number(pred.toFixed(1)),
      probability: Number(probAlert.toFixed(2)),
      contributions: contributions
    };
  }

  function predict(input, stationKey, threshold) {
    const cutoff = typeof threshold === 'number' ? threshold : 0.38;
    const f = engineerFeatures(input, stationKey);
    const baseline = Number(f.lag1.toFixed(1));
    const ridge = predictRidge(f);
    const gbr = predictGBR(f);
    const isAlert = gbr.probability >= cutoff;

    return {
      features: f,
      baseline: baseline,
      ridge: ridge,
      gbr: gbr.prediction,
      probability: gbr.probability,
      status: isAlert ? 'ALERT' : 'SAFE',
      isAlert: isAlert,
      contributions: gbr.contributions
    };
  }

  function evaluateTestSet(records, stationKey, threshold, customRecords) {
    const cutoff = typeof threshold === 'number' ? threshold : 0.38;
    const combined = records.concat(customRecords || []).slice().sort(function (a, b) {
      return a.date.localeCompare(b.date);
    });

    let sumBaseErr = 0;
    let sumRidgeErr = 0;
    let sumGbrErr = 0;
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;

    const rows = combined.map(function (rec) {
      const res = predict(rec, stationKey, cutoff);
      const actual = Number(rec.actualTomorrow);
      const actualAlert = actual > EPA_LIMIT;

      sumBaseErr += Math.abs(actual - res.baseline);
      sumRidgeErr += Math.abs(actual - res.ridge);
      sumGbrErr += Math.abs(actual - res.gbr);

      if (res.isAlert && actualAlert) tp++;
      else if (!res.isAlert && !actualAlert) tn++;
      else if (res.isAlert && !actualAlert) fp++;
      else if (!res.isAlert && actualAlert) fn++;

      return {
        record: rec,
        pred: res,
        actual: actual,
        actualAlert: actualAlert,
        outcomeType: res.isAlert && actualAlert
          ? 'TP'
          : !res.isAlert && !actualAlert
          ? 'TN'
          : res.isAlert && !actualAlert
          ? 'FP'
          : 'FN'
      };
    });

    const n = rows.length || 1;
    const maeBase = Number((sumBaseErr / n).toFixed(2));
    const maeRidge = Number((sumRidgeErr / n).toFixed(2));
    const maeGbr = Number((sumGbrErr / n).toFixed(2));
    const reductionPct = maeBase > 0 ? Number((((maeBase - maeGbr) / maeBase) * 100).toFixed(1)) : 0;
    const recall = tp + fn > 0 ? Number(((tp / (tp + fn)) * 100).toFixed(1)) : 100;
    const precision = tp + fp > 0 ? Number(((tp / (tp + fp)) * 100).toFixed(1)) : 100;

    return {
      rows: rows,
      count: rows.length,
      maeBase: maeBase,
      maeRidge: maeRidge,
      maeGbr: maeGbr,
      reductionPct: reductionPct,
      tp: tp,
      tn: tn,
      fp: fp,
      fn: fn,
      recall: recall,
      precision: precision
    };
  }

  function computeThresholdCurve(records, stationKey, customRecords) {
    const points = [];
    for (let t = 0.20; t <= 0.805; t += 0.05) {
      const cutoff = Number(t.toFixed(2));
      const ev = evaluateTestSet(records, stationKey, cutoff, customRecords);
      points.push({
        threshold: cutoff,
        missedWarnings: ev.fn,
        falseAlarms: ev.fp,
        recall: ev.recall,
        tp: ev.tp
      });
    }
    return points;
  }

  function computeLocalDrivers(records, stationKey) {
    const rows = evaluateTestSet(records, stationKey, 0.38, []).rows;

    const avg = function (arr) {
      if (!arr.length) return 0;
      const sum = arr.reduce(function (s, v) { return s + v; }, 0);
      return Number((sum / arr.length).toFixed(1));
    };

    const windInd = [];
    const windSea = [];
    const windTrans = [];
    const stagCalm = [];
    const stagMod = [];
    const stagBrisk = [];
    const weekday = [];
    const weekend = [];
    const dryDays = [];
    const wetDays = [];
    const highStagTrigger = [];

    rows.forEach(function (item) {
      const r = item.record;
      const f = item.pred.features;
      const val = item.actual;

      if (r.windDir >= 110 && r.windDir <= 210) windInd.push(val);
      else if (r.windDir >= 0 && r.windDir <= 80) windSea.push(val);
      else windTrans.push(val);

      if (r.windSpeed < 8) stagCalm.push(val);
      else if (r.windSpeed <= 12) stagMod.push(val);
      else stagBrisk.push(val);

      if (r.isWeekend) weekend.push(val);
      else weekday.push(val);

      if (r.rainMm < 1) dryDays.push(val);
      if (r.rainMm >= 2.5) wetDays.push(val);

      if (f.rolling3d >= 35 && r.windSpeed < 9) highStagTrigger.push(val);
    });

    return {
      windDirections: {
        industrial: avg(windInd),
        seaBreeze: avg(windSea),
        transitional: avg(windTrans)
      },
      stagnation: {
        calm: avg(stagCalm),
        moderate: avg(stagMod),
        brisk: avg(stagBrisk)
      },
      dayType: {
        weekday: avg(weekday),
        weekend: avg(weekend),
        weekdayCount: weekday.length,
        weekendCount: weekend.length
      },
      rainfall: {
        dry: avg(dryDays),
        wet: avg(wetDays),
        dryCount: dryDays.length,
        wetCount: wetDays.length
      },
      highStagAvg: avg(highStagTrigger)
    };
  }

  window.NafasML = {
    EPA_LIMIT: EPA_LIMIT,
    engineerFeatures: engineerFeatures,
    predict: predict,
    evaluateTestSet: evaluateTestSet,
    computeThresholdCurve: computeThresholdCurve,
    computeLocalDrivers: computeLocalDrivers
  };
})();
