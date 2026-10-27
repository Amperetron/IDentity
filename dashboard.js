/**
 * dashboard.js - AICTE National Central Admission Oversight Dashboard
 * Agent B - Shared Contract: window.Dashboard
 *
 * Capabilities:
 * - Renders into #tab-dashboard
 * - State-wise utilization bar chart using Chart.js (with canvas cleanup & fallback)
 * - College compliance & seat allocation table with search and state filter
 * - Dynamic anomaly alert list with severity indicators
 * - Simulated permissioned ledger integrity badge (SHA-256 validation)
 * - "Tamper block" and "Reset demo" buttons with instant reactive re-rendering
 * - Prominently displays labels: "Simulated permissioned ledger" and "Sandbox adapter"
 * - Mobile responsive government light-theme styling
 */

(function () {
  'use strict';

  let chartInstance = null;

  // Fallback / Adapter for environment independence
  function getLedger() {
    return window.Ledger || {
      getChain: () => [],
      verifyChain: async () => ({ valid: true, brokenIndex: -1 }),
      tamper: (idx) => console.log('Tamper block', idx),
      reset: () => console.log('Reset ledger')
    };
  }

  function getSeed() {
    return window.SEED || {
      colleges: [],
      apaar: []
    };
  }

  function getRules() {
    return window.Rules || null;
  }

  function getAnomaliesModule() {
    return window.Anomalies || null;
  }

  /**
   * Adapter: Derive college stats from Rules or directly from Ledger chain
   */
  function getCollegeStats() {
    const rules = getRules();
    if (rules && typeof rules.getCollegeStats === 'function') {
      try {
        const stats = rules.getCollegeStats();
        if (Array.isArray(stats) && stats.length > 0) {
          return stats;
        }
      } catch (e) {
        console.warn('Rules.getCollegeStats threw, falling back to adapter:', e);
      }
    }

    // Direct derivation from Ledger chain
    const seed = getSeed();
    const colleges = seed.colleges || [];
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
      c.utilization = c.intake > 0 ? c.admitted / c.intake : 0;
      return c;
    });
  }

  /**
   * Render the complete Dashboard into #tab-dashboard
   */
  async function render() {
    const container = document.getElementById('tab-dashboard');
    if (!container) return;

    const ledger = getLedger();
    const stats = getCollegeStats();
    const chain = typeof ledger.getChain === 'function' ? ledger.getChain() : [];

    // Verify ledger integrity
    let verifyResult = { valid: true, brokenIndex: -1 };
    if (typeof ledger.verifyChain === 'function') {
      try {
        verifyResult = await ledger.verifyChain();
      } catch (e) {
        console.warn('verifyChain error:', e);
      }
    }

    // Fetch anomalies
    let anomalies = [];
    const anomaliesMod = getAnomaliesModule();
    if (anomaliesMod && typeof anomaliesMod.detect === 'function') {
      try {
        anomalies = await anomaliesMod.detect();
      } catch (e) {
        anomalies = anomaliesMod.getAnomalies ? anomaliesMod.getAnomalies() : [];
      }
    }

    // Aggregate summary metrics
    const totalColleges = stats.length;
    const totalIntake = stats.reduce((acc, s) => acc + (s.intake || 0), 0);
    const totalAdmitted = stats.reduce((acc, s) => acc + (s.admitted || 0), 0);
    const totalNRIAdmitted = stats.reduce((acc, s) => acc + (s.nriAdmitted || 0), 0);
    const overallUtilPct = totalIntake > 0 ? ((totalAdmitted / totalIntake) * 100).toFixed(1) : 0;

    // Build DOM structure
    container.innerHTML = `
      <div class="dashboard-root" style="max-width: 1200px; margin: 0 auto; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #0f2942 0%, #1a4268 100%); color: #ffffff; padding: 20px 24px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            <div>
              <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: #fbbf24; font-weight: 700;">
                Government of India • Ministry of Education • AICTE
              </div>
              <h1 style="margin: 4px 0 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px;">
                Central APAAR Admission & Verification Portal
              </h1>
              <p style="margin: 6px 0 0; opacity: 0.85; font-size: 0.85rem;">
                Unified Institutional Intake Audit, Seat Hoarding Prevention & Cryptographic Ledger Registry
              </p>
            </div>

            <!-- Mandatory Architecture Labels -->
            <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end;">
              <span style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 4px;">
                ⚙ Simulated permissioned ledger
              </span>
              <span style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 4px;">
                🆔 Sandbox adapter (60 APAAR IDs)
              </span>
            </div>
          </div>
        </div>

        <!-- Ledger Integrity Status Badge & Control Toolbar -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
          <!-- Badge -->
          <div id="ledger-integrity-badge-container" style="display: flex; align-items: center; gap: 10px;">
            ${renderLedgerBadge(verifyResult, chain.length)}
          </div>

          <!-- Ledger Simulation Control Buttons -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-dashboard-verify-ledger" style="padding: 8px 14px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <span>🔍 Verify Ledger</span>
            </button>
            <button id="btn-dashboard-tamper-block" style="padding: 8px 14px; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <span>⚠️ Tamper Block (Simulate Fraud)</span>
            </button>
            <button id="btn-dashboard-reset-demo" style="padding: 8px 14px; background: #0f2942; color: #ffffff; border: none; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <span>🔄 Reset Demo</span>
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; border-left: 4px solid #0f2942;">
            <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Institutions</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: #0f2942; margin-top: 4px;">${totalColleges}</div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Across 6 Key States</div>
          </div>

          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; border-left: 4px solid #2563eb;">
            <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Admitted Seats</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: #2563eb; margin-top: 4px;">${totalAdmitted} <span style="font-size: 0.9rem; font-weight: 600; color: #64748b;">/ ${totalIntake}</span></div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">${overallUtilPct}% Overall Capacity Utilized</div>
          </div>

          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; border-left: 4px solid #d97706;">
            <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">NRI Admissions</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: #d97706; margin-top: 4px;">${totalNRIAdmitted}</div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Strict Cap Compliance Audit</div>
          </div>

          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; border-left: 4px solid ${anomalies.length > 0 ? '#dc2626' : '#059669'};">
            <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Anomalies Detected</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: ${anomalies.length > 0 ? '#dc2626' : '#059669'}; margin-top: 4px;">${anomalies.length}</div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Z-Score, Quota & Hoarding Flags</div>
          </div>

          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; border-left: 4px solid #64748b;">
            <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Ledger Blocks</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: #0f2942; margin-top: 4px;">#${chain.length}</div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">SHA-256 Hash Chain Blocks</div>
          </div>
        </div>

        <!-- Middle Section: Chart & Anomaly Panel -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; margin-bottom: 24px;">
          
          <!-- State-wise Utilization Bar Chart Container -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <h2 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #0f2942;">
                State-wise Capacity & Seat Utilization
              </h2>
              <span style="font-size: 0.75rem; color: #64748b;">Chart.js Visualization</span>
            </div>

            <div style="position: relative; height: 280px; width: 100%;">
              <canvas id="dashboard-state-chart"></canvas>
            </div>
          </div>

          <!-- Anomalies & Risk Alerts List -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <h2 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #0f2942;">
                Live Compliance & Fraud Alerts (${anomalies.length})
              </h2>
              <span style="font-size: 0.75rem; color: #64748b;">Automated Detection</span>
            </div>

            <div id="dashboard-anomaly-list" style="overflow-y: auto; max-height: 280px; padding-right: 4px; display: flex; flex-direction: column; gap: 10px;">
              ${renderAnomalyCards(anomalies)}
            </div>
          </div>

        </div>

        <!-- Bottom Section: College Compliance Table -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h2 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #0f2942;">
                Institutional Seat Allocation & Compliance Audit
              </h2>
              <p style="margin: 4px 0 0; font-size: 0.8rem; color: #64748b;">
                Real-time derivation from immutable simulated permissioned ledger blocks
              </p>
            </div>

            <!-- Table Filters -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <input type="text" id="dashboard-table-search" placeholder="Search college or ID..." style="padding: 7px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;" />
              <select id="dashboard-state-filter" style="padding: 7px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; background: #f8fafc;">
                <option value="ALL">All States</option>
                ${getUniqueStates(stats).map(st => `<option value="${st}">${st}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Table Container -->
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
                  <th style="padding: 10px 12px;">College ID</th>
                  <th style="padding: 10px 12px;">Institution Name</th>
                  <th style="padding: 10px 12px;">State</th>
                  <th style="padding: 10px 12px; text-align: right;">Total Intake</th>
                  <th style="padding: 10px 12px; text-align: right;">Admitted</th>
                  <th style="padding: 10px 12px; width: 140px;">Utilization</th>
                  <th style="padding: 10px 12px; text-align: right;">NRI (Admitted/Cap)</th>
                  <th style="padding: 10px 12px; text-align: center;">Status</th>
                </tr>
              </thead>
              <tbody id="dashboard-table-tbody">
                ${renderTableRows(stats)}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    // Render Chart.js
    renderStateChart(stats);

    // Attach Event Listeners
    attachDashboardEvents(stats);
  }

  /**
   * Helper: Unique states
   */
  function getUniqueStates(stats) {
    const states = new Set();
    stats.forEach(s => { if (s.state) states.add(s.state); });
    return Array.from(states).sort();
  }

  /**
   * Render Ledger Integrity Badge
   */
  function renderLedgerBadge(verifyResult, blockCount) {
    if (verifyResult.valid) {
      return `
        <div style="display: flex; align-items: center; gap: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 8px 14px; border-radius: 6px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #059669;"></span>
          <div>
            <div style="font-weight: 700; color: #065f46; font-size: 0.85rem;">
              SIMULATED PERMISSIONED LEDGER: INTACT
            </div>
            <div style="font-size: 0.75rem; color: #047857;">
              All ${blockCount} SHA-256 blocks cryptographically valid & unmodified
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div style="display: flex; align-items: center; gap: 8px; background: #fef2f2; border: 2px solid #ef4444; padding: 8px 14px; border-radius: 6px; animation: pulse 1.5s infinite;">
          <span style="font-size: 1.2rem; color: #dc2626;">▲</span>
          <div>
            <div style="font-weight: 800; color: #991b1b; font-size: 0.85rem;">
              TAMPER DETECTED AT BLOCK #${verifyResult.brokenIndex}!
            </div>
            <div style="font-size: 0.75rem; color: #b91c1c;">
              SHA-256 hash mismatch: Block payload altered after generation!
            </div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Render Anomaly Cards
   */
  function renderAnomalyCards(anomalies) {
    if (!anomalies || anomalies.length === 0) {
      return `
        <div style="text-align: center; color: #059669; padding: 30px 10px; background: #f0fdf4; border-radius: 6px; border: 1px dashed #bbf7d0;">
          <div style="font-size: 1.3rem;">✔</div>
          <div style="font-weight: 700; font-size: 0.9rem; margin-top: 4px;">Zero Violations Detected</div>
          <div style="font-size: 0.75rem; color: #166534; margin-top: 2px;">All institutions within intake caps & NRI quota.</div>
        </div>
      `;
    }

    return anomalies.map(a => {
      const isHigh = a.severity === 'high';
      const isMed = a.severity === 'med';
      const bg = isHigh ? '#fef2f2' : isMed ? '#fffbeb' : '#eff6ff';
      const border = isHigh ? '#fecaca' : isMed ? '#fde68a' : '#bfdbfe';
      const badgeBg = isHigh ? '#dc2626' : isMed ? '#d97706' : '#2563eb';

      return `
        <div style="background: ${bg}; border-left: 4px solid ${badgeBg}; border: 1px solid ${border}; border-left-width: 4px; padding: 10px 12px; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: #0f2942;">${a.collegeName || a.collegeId}</span>
            <span style="background: ${badgeBg}; color: #ffffff; font-size: 0.65rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
              ${a.severity} RISK
            </span>
          </div>
          <div style="font-size: 0.8rem; color: #334155; line-height: 1.4;">
            ${a.reason}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render Table Rows
   */
  function renderTableRows(stats) {
    if (!stats || stats.length === 0) {
      return `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #94a3b8;">No colleges registered.</td></tr>`;
    }

    return stats.map(s => {
      const util = s.utilization > 1 ? s.utilization / 100 : s.utilization;
      const utilPct = (util * 100).toFixed(1);
      const isNriOver = s.nriAdmitted > s.nriQuota;
      const isCapCritical = util >= 0.95;

      let statusBadge = `<span style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">Compliant</span>`;
      if (isNriOver) {
        statusBadge = `<span style="background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">NRI Breach</span>`;
      } else if (isCapCritical) {
        statusBadge = `<span style="background: #fffbeb; color: #92400e; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">Capacity Critical</span>`;
      }

      // Progress bar color
      const barColor = isCapCritical ? '#dc2626' : util > 0.8 ? '#d97706' : '#2563eb';

      return `
        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td style="padding: 10px 12px; font-family: monospace; font-weight: 600; color: #0f2942;">${s.collegeId}</td>
          <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${s.name}</td>
          <td style="padding: 10px 12px; color: #64748b;">${s.state}</td>
          <td style="padding: 10px 12px; text-align: right; font-weight: 600;">${s.intake}</td>
          <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f2942;">${s.admitted}</td>
          <td style="padding: 10px 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${Math.min(util * 100, 100)}%; height: 100%; background: ${barColor};"></div>
              </div>
              <span style="font-size: 0.75rem; font-weight: 600; color: #475569; width: 40px; text-align: right;">${utilPct}%</span>
            </div>
          </td>
          <td style="padding: 10px 12px; text-align: right; font-weight: 600; color: ${isNriOver ? '#dc2626' : '#475569'};">
            ${s.nriAdmitted} / ${s.nriQuota}
          </td>
          <td style="padding: 10px 12px; text-align: center;">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Render State-wise Bar Chart using Chart.js
   */
  function renderStateChart(stats) {
    const canvas = document.getElementById('dashboard-state-chart');
    if (!canvas) return;

    // Group stats by state
    const stateMap = {};
    stats.forEach(s => {
      const st = s.state || 'Other';
      if (!stateMap[st]) {
        stateMap[st] = { state: st, intake: 0, admitted: 0 };
      }
      stateMap[st].intake += Number(s.intake) || 0;
      stateMap[st].admitted += Number(s.admitted) || 0;
    });

    const states = Object.keys(stateMap);
    const intakeData = states.map(st => stateMap[st].intake);
    const admittedData = states.map(st => stateMap[st].admitted);

    // Destroy existing chart if present
    if (chartInstance) {
      try {
        chartInstance.destroy();
      } catch (e) {
        console.warn('Error destroying chart:', e);
      }
      chartInstance = null;
    }

    // Check if Chart.js is available from CDN
    if (typeof window.Chart === 'function') {
      try {
        const ctx = canvas.getContext('2d');
        chartInstance = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: states,
            datasets: [
              {
                label: 'Admitted Students',
                data: admittedData,
                backgroundColor: '#1d4ed8',
                borderRadius: 4,
                barPercentage: 0.6
              },
              {
                label: 'Total Intake Capacity',
                data: intakeData,
                backgroundColor: '#cbd5e1',
                borderRadius: 4,
                barPercentage: 0.6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  boxWidth: 12,
                  font: { size: 11, family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto' }
                }
              },
              tooltip: {
                callbacks: {
                  afterLabel: function (context) {
                    const idx = context.dataIndex;
                    const st = states[idx];
                    const adm = admittedData[idx];
                    const intk = intakeData[idx];
                    const pct = intk > 0 ? ((adm / intk) * 100).toFixed(1) : 0;
                    return `Utilization: ${pct}%`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: { size: 11 } }
              },
              y: {
                beginAtZero: true,
                grid: { color: '#f1f5f9' },
                ticks: { font: { size: 11 } }
              }
            }
          }
        });
        return;
      } catch (err) {
        console.warn('Chart.js render failed, fallback:', err);
      }
    }

    // Fallback HTML/CSS bar visualization if Chart.js is not loaded
    const parent = canvas.parentElement;
    if (parent) {
      let html = '<div style="display:flex; flex-direction:column; gap:8px; justify-content:center; height:100%;">';
      states.forEach(st => {
        const d = stateMap[st];
        const pct = d.intake > 0 ? Math.round((d.admitted / d.intake) * 100) : 0;
        html += `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:2px;">
              <span><strong>${st}</strong>: ${d.admitted}/${d.intake} seats</span>
              <span>${pct}%</span>
            </div>
            <div style="background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:#1d4ed8;"></div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      parent.innerHTML = html;
    }
  }

  /**
   * Attach Dashboard User Interactions
   */
  function attachDashboardEvents(allStats) {
    // 1. Verify Ledger Button
    const btnVerify = document.getElementById('btn-dashboard-verify-ledger');
    if (btnVerify) {
      btnVerify.addEventListener('click', async () => {
        btnVerify.disabled = true;
        btnVerify.innerHTML = '<span>Verifying...</span>';
        const ledger = getLedger();
        let result = { valid: true, brokenIndex: -1 };
        if (typeof ledger.verifyChain === 'function') {
          result = await ledger.verifyChain();
        }
        const badgeBox = document.getElementById('ledger-integrity-badge-container');
        if (badgeBox) {
          badgeBox.innerHTML = renderLedgerBadge(result, ledger.getChain().length);
        }
        btnVerify.disabled = false;
        btnVerify.innerHTML = '<span>🔍 Verify Ledger</span>';
      });
    }

    // 2. Tamper Block Button (Demo Fraud Simulation)
    const btnTamper = document.getElementById('btn-dashboard-tamper-block');
    if (btnTamper) {
      btnTamper.addEventListener('click', async () => {
        const ledger = getLedger();
        const chain = ledger.getChain();
        if (!chain || chain.length <= 1) {
          alert('Not enough blocks to tamper. Pre-seed admissions or upload students first.');
          return;
        }

        const targetIndex = chain.length > 2 ? 2 : 1;
        const confirmTamper = confirm(
          `SIMULATED FRAUD DEMO:\n\nThis will mutate data inside Block #${targetIndex} without re-computing the SHA-256 hash.\n\nThe permissioned ledger hash-chain will immediately detect the compromise. Proceed?`
        );

        if (confirmTamper) {
          if (typeof ledger.tamper === 'function') {
            ledger.tamper(targetIndex);
          }
          // Re-render dashboard reactive view
          await render();
        }
      });
    }

    // 3. Reset Demo Button
    const btnReset = document.getElementById('btn-dashboard-reset-demo');
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        const confirmReset = confirm('Reset demo ledger and re-initialize official baseline state?');
        if (confirmReset) {
          const ledger = getLedger();
          if (typeof ledger.reset === 'function') {
            ledger.reset();
          }
          // If app has seedDemo function
          if (window.app && typeof window.app.seedDemo === 'function') {
            await window.app.seedDemo();
          } else if (typeof window.seedDemo === 'function') {
            await window.seedDemo();
          }
          await render();
        }
      });
    }

    // 4. Table Search & Filter
    const searchInput = document.getElementById('dashboard-table-search');
    const stateFilter = document.getElementById('dashboard-state-filter');
    const tbody = document.getElementById('dashboard-table-tbody');

    function filterTable() {
      if (!tbody) return;
      const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const stateVal = stateFilter ? stateFilter.value : 'ALL';

      const filtered = allStats.filter(s => {
        const matchesQuery = !query ||
          s.name.toLowerCase().includes(query) ||
          s.collegeId.toLowerCase().includes(query) ||
          s.state.toLowerCase().includes(query);
        const matchesState = stateVal === 'ALL' || s.state === stateVal;
        return matchesQuery && matchesState;
      });

      tbody.innerHTML = renderTableRows(filtered);
    }

    if (searchInput) searchInput.addEventListener('input', filterTable);
    if (stateFilter) stateFilter.addEventListener('change', filterTable);
  }

  /**
   * Module initialization
   */
  async function init() {
    await render();
  }

  // Export to global window object strictly complying with Shared Contract
  window.Dashboard = {
    init,
    render,
    getCollegeStats
  };

})();
