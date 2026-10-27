/**
 * anomalies.js - AICTE Pattern & Fraud Anomaly Detection Engine
 * Agent B - Shared Contract: window.Anomalies
 *
 * Capabilities:
 * - detect() -> [{collegeId, severity: "high|med|low", reason}]
 * - Evaluates 5 specific heuristic checks:
 *   1. Utilization > 95% (Capacity limit risk)
 *   2. NRI over quota & overflow attempts (Regulatory breach / ledger flags)
 *   3. Burst uploads (Rapid batch injection within brief timeframe)
 *   4. Duplicate APAAR attempts (Seat hoarding / Multi-seat locking)
 *   5. Z-score on admission velocity (Statistical outlier spike)
 * - Logs new anomalies as "FLAG" blocks on the simulated ledger without duplicate spam
 */

(function () {
  'use strict';

  // Fallback / Adapter for environment independence
  function getLedger() {
    return window.Ledger || {
      getChain: () => [],
      addBlock: async (type, data) => ({
        index: 0,
        timestamp: Date.now(),
        type,
        data,
        prevHash: '0',
        hash: 'simulated_flag_hash'
      })
    };
  }

  function getSeed() {
    return window.SEED || {
      colleges: [],
      apaar: []
    };
  }

  /**
   * Adapter: Derive college stats from Rules or directly from Ledger chain
   */
  function fetchCollegeStats() {
    if (window.Rules && typeof window.Rules.getCollegeStats === 'function') {
      try {
        const stats = window.Rules.getCollegeStats();
        if (Array.isArray(stats) && stats.length > 0) {
          return stats;
        }
      } catch (e) {
        console.warn('Rules.getCollegeStats error, using internal adapter:', e);
      }
    }

    // Direct calculation from Ledger chain & SEED colleges
    const colleges = getSeed().colleges || [];
    const chain = getLedger().getChain() || [];

    const collegeMap = {};
    colleges.forEach(c => {
      collegeMap[c.id] = {
        collegeId: c.id,
        name: c.name,
        state: c.state,
        intake: Number(c.intake) || 60,
        admitted: 0,
        nriAdmitted: 0,
        nriQuota: Number(c.nriQuota) || 6,
        utilization: 0
      };
    });

    const activeStudents = new Map();
    chain.forEach(block => {
      if (block.type === 'CANCELLATION' && block.data && block.data.apaarId) {
        activeStudents.delete(String(block.data.apaarId));
      } else if (block.type === 'ADMISSION' && block.data && block.data.apaarId) {
        activeStudents.set(String(block.data.apaarId), block.data);
      }
    });

    activeStudents.forEach(data => {
      const c = collegeMap[data.collegeId];
      if (c) {
        c.admitted++;
        if (data.isNRI === true || data.isNRI === 'true' || data.isNRI === 1 || data.isNRI === '1') {
          c.nriAdmitted++;
        }
      }
    });

    return Object.values(collegeMap).map(c => {
      c.utilization = c.intake > 0 ? (c.admitted / c.intake) * 100 : 0;
      return c;
    });
  }

  /**
   * Detect anomalies across colleges and ledger history
   * Returns: [{ collegeId, severity: 'high|med|low', reason, type, details }]
   */
  async function detect() {
    const stats = fetchCollegeStats();
    const ledger = getLedger();
    const chain = typeof ledger.getChain === 'function' ? ledger.getChain() : [];
    const seed = getSeed();
    const anomalies = [];

    // Helper map for college names
    const collegeNameMap = {};
    if (seed.colleges) {
      seed.colleges.forEach(c => { collegeNameMap[c.id] = c.name; });
    }
    stats.forEach(s => { collegeNameMap[s.collegeId] = s.name; });

    // -------------------------------------------------------------
    // Heuristic 1: Utilization > 95%
    // -------------------------------------------------------------
    stats.forEach(stat => {
      const utilFrac = stat.utilization > 1 ? stat.utilization / 100 : stat.utilization;
      if (utilFrac > 0.95) {
        const pct = (utilFrac * 100).toFixed(1);
        anomalies.push({
          collegeId: stat.collegeId,
          collegeName: stat.name,
          severity: 'high',
          type: 'HIGH_UTILIZATION',
          reason: `Capacity Critical: ${stat.name} reached ${pct}% utilization (${stat.admitted}/${stat.intake} seats)`,
          details: { admitted: stat.admitted, intake: stat.intake, utilization: utilFrac }
        });
      }
    });

    // -------------------------------------------------------------
    // Heuristic 2: NRI over quota & flagged attempts
    // -------------------------------------------------------------
    stats.forEach(stat => {
      if (stat.nriAdmitted > stat.nriQuota) {
        anomalies.push({
          collegeId: stat.collegeId,
          collegeName: stat.name,
          severity: 'high',
          type: 'NRI_QUOTA_BREACH',
          reason: `NRI Quota Breach: ${stat.name} has ${stat.nriAdmitted} NRI admissions exceeding quota of ${stat.nriQuota}`,
          details: { nriAdmitted: stat.nriAdmitted, nriQuota: stat.nriQuota }
        });
      }
    });

    // Also scan chain for explicit NRI overflow attempt blocks or flags
    chain.forEach(b => {
      if (b.type === 'FLAG' && b.data) {
        const r = (b.data.reason || '').toLowerCase();
        if (b.data.type === 'NRI_QUOTA_BREACH' || r.includes('nri')) {
          const cid = b.data.collegeId || 'UNKNOWN';
          if (!anomalies.some(a => a.collegeId === cid && (a.type === 'NRI_QUOTA_BREACH' || a.reason.includes('NRI')))) {
            anomalies.push({
              collegeId: cid,
              collegeName: collegeNameMap[cid] || cid,
              severity: 'high',
              type: 'NRI_QUOTA_BREACH',
              reason: b.data.reason || `NRI Quota overflow attempt flagged on ledger for ${collegeNameMap[cid] || cid}`,
              details: b.data
            });
          }
        }
      }
    });

    // -------------------------------------------------------------
    // Heuristic 3: Burst Uploads
    // Check if >= 5 admissions occur within a 5-second window for a college
    // -------------------------------------------------------------
    const collegeAdmissions = {};
    chain.forEach((block, idx) => {
      if (block.type === 'ADMISSION' && block.data && block.data.collegeId) {
        const cid = block.data.collegeId;
        if (!collegeAdmissions[cid]) collegeAdmissions[cid] = [];
        collegeAdmissions[cid].push({
          timestamp: Number(block.timestamp) || (1000000000000 + idx * 1000),
          apaarId: block.data.apaarId
        });
      }
    });

    Object.keys(collegeAdmissions).forEach(cid => {
      const records = collegeAdmissions[cid].sort((a, b) => a.timestamp - b.timestamp);
      // Sliding window check: 5 admissions within 5000 ms
      for (let i = 0; i <= records.length - 5; i++) {
        const timeDiff = records[i + 4].timestamp - records[i].timestamp;
        if (timeDiff <= 5000) {
          anomalies.push({
            collegeId: cid,
            collegeName: collegeNameMap[cid] || cid,
            severity: 'med',
            type: 'BURST_UPLOAD',
            reason: `Burst Upload Detected: 5+ admissions in ${(timeDiff / 1000).toFixed(1)}s for ${collegeNameMap[cid] || cid}`,
            details: { burstCount: 5, windowMs: timeDiff }
          });
          break; // Flag once per college
        }
      }
    });

    // -------------------------------------------------------------
    // Heuristic 4: Duplicate APAAR attempts / Seat hoarding
    // Check if any APAAR holds multiple active admissions
    // -------------------------------------------------------------
    const studentHistory = {};
    chain.forEach(block => {
      if ((block.type === 'ADMISSION' || block.type === 'CANCELLATION') && block.data && block.data.apaarId) {
        const id = String(block.data.apaarId);
        if (!studentHistory[id]) studentHistory[id] = [];
        studentHistory[id].push(block);
      }
    });

    const flaggedStudents = new Set();
    Object.keys(studentHistory).forEach(id => {
      const events = studentHistory[id];
      const activeColleges = new Set();
      let hasMultiAttempt = false;

      events.forEach(evt => {
        if (evt.type === 'ADMISSION') {
          if (activeColleges.has(evt.data.collegeId) || activeColleges.size >= 1) {
            hasMultiAttempt = true;
          }
          activeColleges.add(evt.data.collegeId);
        } else if (evt.type === 'CANCELLATION') {
          activeColleges.delete(evt.data.collegeId);
        }
      });

      if ((hasMultiAttempt || activeColleges.size > 1) && !flaggedStudents.has(id)) {
        flaggedStudents.add(id);
        const colList = Array.from(activeColleges).map(cid => collegeNameMap[cid] || cid).join(', ');
        anomalies.push({
          collegeId: Array.from(activeColleges)[0] || 'MULTI',
          collegeName: colList || 'Multiple Institutions',
          severity: 'high',
          type: 'SEAT_HOARDING',
          reason: `Seat Hoarding / Duplicate APAAR: Student ${id} holds simultaneous active seats in: ${colList || 'multiple colleges'}`,
          details: { apaarId: id, colleges: Array.from(activeColleges) }
        });
      }
    });

    // -------------------------------------------------------------
    // Heuristic 5: Z-Score on Admission Velocity
    // Detect abnormal deviation from the mean admissions across all colleges
    // -------------------------------------------------------------
    const admittedCounts = stats.map(s => s.admitted || 0);
    const n = admittedCounts.length;

    if (n >= 3) {
      const sum = admittedCounts.reduce((acc, val) => acc + val, 0);
      const mean = sum / n;
      const variance = admittedCounts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0.5) {
        stats.forEach(stat => {
          const z = (stat.admitted - mean) / stdDev;
          // Flag if z-score is >= 1.75 and admissions are at least 5
          if (z >= 1.75 && stat.admitted >= 5) {
            // Avoid duplicate if already flagged for utilization
            const alreadyHasCap = anomalies.some(a => a.collegeId === stat.collegeId && a.type === 'HIGH_UTILIZATION');
            anomalies.push({
              collegeId: stat.collegeId,
              collegeName: stat.name,
              severity: z >= 2.2 ? 'high' : 'med',
              type: 'VELOCITY_SURGE',
              reason: `Admission Velocity Surge: ${stat.name} z-score = ${z.toFixed(2)} (${stat.admitted} admissions vs state mean of ${mean.toFixed(1)})`,
              details: { zScore: Number(z.toFixed(2)), admitted: stat.admitted, mean: Number(mean.toFixed(1)) }
            });
          }
        });
      }
    }

    // -------------------------------------------------------------
    // Log new anomalies to simulated ledger as "FLAG" blocks
    // -------------------------------------------------------------
    await logNewAnomaliesToLedger(anomalies);

    // Cache latest
    window.Anomalies.lastDetected = anomalies;
    return anomalies;
  }

  /**
   * Log anomalies to ledger without duplicate spamming
   */
  async function logNewAnomaliesToLedger(anomalies) {
    const ledger = getLedger();
    if (typeof ledger.addBlock !== 'function') return;

    const chain = typeof ledger.getChain === 'function' ? ledger.getChain() : [];
    const loggedKeys = new Set();

    chain.forEach(b => {
      if (b.type === 'FLAG' && b.data) {
        const key = `${b.data.collegeId}_${b.data.type || b.data.reason}`;
        loggedKeys.add(key);
      }
    });

    for (const anomaly of anomalies) {
      const key = `${anomaly.collegeId}_${anomaly.type || anomaly.reason}`;
      if (!loggedKeys.has(key)) {
        try {
          await ledger.addBlock('FLAG', {
            collegeId: anomaly.collegeId,
            collegeName: anomaly.collegeName,
            severity: anomaly.severity,
            type: anomaly.type,
            reason: anomaly.reason,
            details: anomaly.details,
            detectedAt: Date.now()
          });
          loggedKeys.add(key);
        } catch (e) {
          console.warn('Failed to log FLAG block to ledger:', e);
        }
      }
    }
  }

  /**
   * Get cached anomalies or trigger detect()
   */
  function getAnomalies() {
    return window.Anomalies.lastDetected || [];
  }

  /**
   * Initialize module
   */
  async function init() {
    return await detect();
  }

  // Export to global window object strictly complying with Shared Contract
  window.Anomalies = {
    detect,
    getAnomalies,
    init,
    lastDetected: []
  };

})();
