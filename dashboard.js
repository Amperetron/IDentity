/**
 * dashboard.js - AICTE National Central Admission Oversight Dashboard
 * Agent B - Shared Contract: window.Dashboard
 *
 * Capabilities:
 * - Renders into #tab-dashboard
 * - Interacts directly with window.Ledger and window.Rules
 *   Methods: addBlock, getChain, verifyChain, tamper, reset on window.Ledger
 *   Methods: checkAdmission, getCollegeStats on window.Rules
 * - State-wise utilization bar chart using Chart.js (with canvas cleanup & fallback)
 * - College compliance & seat allocation table with search and state filter
 * - Dynamic anomaly alert list with severity indicators
 * - Simulated permissioned ledger integrity badge (SHA-256 validation)
 * - "Tamper block" and "Reset demo" buttons with instant reactive re-rendering
 * - Prominently displays labels: "Simulated permissioned ledger" and "Sandbox adapter"
 * - Mobile responsive government light-theme styling using style.css classes
 */

(function () {
  'use strict';

  let chartInstance = null;

  // Safe accessor for window.Ledger
  function getLedger() {
    return window.Ledger || {
      getChain: () => [],
      verifyChain: async () => ({ valid: true, brokenIndex: -1 }),
      tamper: (idx) => console.log('Tamper block', idx),
      reset: () => console.log('Reset ledger')
    };
  }

  // Safe accessor for window.Rules
  function getRules() {
    return window.Rules || null;
  }

  function getSeed() {
    return window.SEED || {
      colleges: [],
      apaar: []
    };
  }

  function getAnomaliesModule() {
    return window.Anomalies || null;
  }

  /**
   * Derive college stats: calls window.Rules.getCollegeStats() directly,
   * with fallback adapter deriving state from window.Ledger.getChain().
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
      c.utilization = c.intake > 0 ? (c.admitted / c.intake) * 100 : 0;
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
    const overallUtilPct = totalIntake > 0 ? ((totalAdmitted / totalIntake) * 100).toFixed(1) : '0.0';

    // Build DOM structure utilizing style.css government theme classes
    container.innerHTML = `
      <div class="dashboard-module">
        
        <!-- Header Banner with Architecture Labels -->
        <div class="gov-card mb-6">
          <div class="gov-card-header">
            <div>
              <div class="brand-sup">AICTE National Admission Oversight</div>
              <h2 class="gov-card-title mt-1">Institutional Intake &amp; Credential Ledger Dashboard</h2>
              <p class="gov-card-subtitle">
                Real-time seat audit, anti-seat-hoarding surveillance, and cryptographic chain verification for technical education institutions.
              </p>
            </div>
            <div class="header-action-pills">
              <span class="badge-pill" title="Immutable append-only ledger">
                <span class="badge-dot dot-green"></span>
                <span class="badge-label">Simulated permissioned ledger</span>
              </span>
              <span class="badge-pill" title="Local mock APAAR registry">
                <span class="badge-dot dot-cyan"></span>
                <span class="badge-label">Sandbox adapter</span>
              </span>
            </div>
          </div>

          <!-- Ledger Status & Demonstration Toolbar -->
          <div class="ledger-actions-bar mt-2">
            <div id="ledger-integrity-badge-container">
              ${renderLedgerBadge(verifyResult, chain.length)}
            </div>

            <div class="btn-group">
              <button class="btn btn-outline btn-sm" id="btn-dashboard-verify-ledger">
                🔍 Verify Ledger Chain
              </button>
              <button class="btn btn-warning btn-sm" id="btn-dashboard-tamper-block">
                ⚡ Tamper Validator-KA (Simulate Divergence)
              </button>
              <button class="btn btn-danger btn-sm" id="btn-dashboard-reset-demo">
                🔄 Reset Demo
              </button>
            </div>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px;">
          <div class="gov-card" style="border-left: 4px solid var(--gov-navy); padding: 1.15rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Institutions</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: var(--gov-navy-dark); margin-top: 4px;">${totalColleges}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Across 6 Key States</div>
          </div>

          <div class="gov-card" style="border-left: 4px solid #2563EB; padding: 1.15rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Admitted</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: #1D4ED8; margin-top: 4px;">${totalAdmitted} <span style="font-size: 0.9rem; font-weight: 600; color: var(--text-muted);">/ ${totalIntake}</span></div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${overallUtilPct}% Capacity Utilized</div>
          </div>

          <div class="gov-card" style="border-left: 4px solid var(--gov-saffron); padding: 1.15rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">NRI Admissions</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: var(--gov-saffron); margin-top: 4px;">${totalNRIAdmitted}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Strict Quota Cap Enforcement</div>
          </div>

          <div class="gov-card" style="border-left: 4px solid ${anomalies.length > 0 ? 'var(--color-danger)' : 'var(--gov-green)'}; padding: 1.15rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Active Anomalies</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: ${anomalies.length > 0 ? 'var(--color-danger)' : 'var(--gov-green)'}; margin-top: 4px;">${anomalies.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Z-Score, Capacity &amp; Burst Flags</div>
          </div>

          <div class="gov-card" style="border-left: 4px solid #64748B; padding: 1.15rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Ledger Blocks</div>
            <div style="font-size: 1.6rem; font-weight: 800; color: var(--gov-navy); margin-top: 4px;">#${chain.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">SHA-256 Hash Chain Height</div>
          </div>
        </div>

        <!-- On-Chain Anchor Panel (Ethereum Sepolia Testnet) -->
        ${renderOnChainAnchorPanel()}

        <!-- Middle Section: Chart & Anomaly Panel -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; margin-bottom: 24px;">
          
          <!-- State-wise Utilization Bar Chart Container -->
          <div class="gov-card">
            <div class="gov-card-header" style="margin-bottom: 1rem;">
              <div>
                <h3 class="gov-card-title" style="font-size: 1.05rem;">State-wise Capacity &amp; Seat Utilization</h3>
                <p class="gov-card-subtitle">Aggregate admitted seats vs. intake quotas per state</p>
              </div>
              <span class="badge badge-gov font-mono">Chart.js</span>
            </div>

            <div style="position: relative; height: 280px; width: 100%;">
              <canvas id="dashboard-state-chart"></canvas>
            </div>
          </div>

          <!-- Anomalies & Risk Alerts List -->
          <div class="gov-card" style="display: flex; flex-direction: column;">
            <div class="gov-card-header" style="margin-bottom: 1rem;">
              <div>
                <h3 class="gov-card-title" style="font-size: 1.05rem;">Live Compliance &amp; Fraud Alerts</h3>
                <p class="gov-card-subtitle">Automated z-score velocity, burst upload &amp; quota breach detection</p>
              </div>
              <span class="badge ${anomalies.length > 0 ? 'badge-danger' : 'badge-success'}">
                ${anomalies.length} Flag${anomalies.length === 1 ? '' : 's'}
              </span>
            </div>

            <div id="dashboard-anomaly-list" style="overflow-y: auto; max-height: 280px; padding-right: 4px; display: flex; flex-direction: column; gap: 10px;">
              ${renderAnomalyCards(anomalies)}
            </div>
          </div>

        </div>

        <!-- Bottom Section: College Compliance Table -->
        <div class="gov-card">
          <div class="gov-card-header" style="margin-bottom: 1rem; flex-wrap: wrap;">
            <div>
              <h3 class="gov-card-title" style="font-size: 1.1rem;">Institutional Seat Allocation &amp; Compliance Audit</h3>
              <p class="gov-card-subtitle">Derived strictly from immutable simulated permissioned ledger blocks</p>
            </div>

            <!-- Table Filters -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <input type="text" id="dashboard-table-search" placeholder="Search college or ID..." class="form-select" style="min-width: 180px;" />
              <select id="dashboard-state-filter" class="form-select">
                <option value="ALL">All States</option>
                ${getUniqueStates(stats).map(st => `<option value="${st}">${st}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Responsive Data Table -->
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 120px;">College ID</th>
                  <th>Institution Name</th>
                  <th>State</th>
                  <th style="text-align: right;">Intake</th>
                  <th style="text-align: right;">Admitted</th>
                  <th style="width: 150px;">Utilization</th>
                  <th style="text-align: right;">NRI (Admitted/Cap)</th>
                  <th style="text-align: center; width: 130px;">Status</th>
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
   * Render On-Chain Anchor Panel (Ethereum Sepolia Testnet)
   */
  function renderOnChainAnchorPanel() {
    const config = window.CONFIG || {
      CONTRACT_ADDRESS: "",
      CHAIN_ID: 11155111,
      EXPLORER: "https://sepolia.etherscan.io",
      LLM_PROXY_URL: ""
    };
    const anchor = window.Anchor || null;
    const hasMetaMask = Boolean(window.ethereum);
    const hasContract = Boolean(config.CONTRACT_ADDRESS && config.CONTRACT_ADDRESS.trim());
    const storedAnchors = (anchor && typeof anchor.getStoredAnchors === 'function')
      ? anchor.getStoredAnchors()
      : (function () {
          try {
            const raw = localStorage.getItem('aicte_apaar_anchors');
            return raw ? JSON.parse(raw) : [];
          } catch (e) { return []; }
        })();

    let warningHtml = '';
    if (!hasMetaMask) {
      warningHtml += `
        <div class="alert alert-warning" style="margin-bottom: 12px; font-size: 0.82rem; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.1rem;">🦊</span>
          <div>
            <strong>MetaMask Not Detected:</strong> Install MetaMask browser extension to submit on-chain anchors to Sepolia. Local simulated ledger integrity and verification remain fully active.
          </div>
        </div>
      `;
    }
    if (!hasContract) {
      warningHtml += `
        <div class="alert alert-warning" style="margin-bottom: 12px; font-size: 0.82rem; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.1rem;">📝</span>
          <div>
            <strong>CONTRACT_ADDRESS Missing:</strong> Set <code>CONTRACT_ADDRESS</code> in <code>config.js</code> or enter below to enable Ethereum Sepolia anchoring.
          </div>
        </div>
      `;
    }

    return `
      <div class="gov-card mb-6" id="dashboard-anchor-panel" style="border-top: 3px solid #6366F1;">
        <div class="gov-card-header" style="margin-bottom: 1rem; flex-wrap: wrap;">
          <div>
            <div class="brand-sup" style="color: #4F46E5;">Public Blockchain Anchoring</div>
            <h3 class="gov-card-title mt-1" style="font-size: 1.1rem;">On-Chain Anchor (Ethereum Sepolia)</h3>
            <p class="gov-card-subtitle">
              Publish cryptographic checkpoints of the permissioned ledger root (or full chain SHA-256) to public EVM testnet.
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <span class="badge badge-gov font-mono">Sepolia: 11155111</span>
            <span id="anchor-wallet-badge" class="badge ${hasMetaMask ? 'badge-primary' : 'badge-outline'} font-mono">
              ${hasMetaMask ? 'MetaMask Ready' : 'No MetaMask'}
            </span>
          </div>
        </div>

        ${warningHtml}

        <!-- Contract Config & Wallet Bar -->
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px; margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center;">
          <div style="flex: 1; min-width: 280px;">
            <label class="text-xs font-semibold text-gov-navy" style="display: block; margin-bottom: 4px;">
              Anchor Smart Contract Address:
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="anchor-contract-input" value="${config.CONTRACT_ADDRESS || ''}" placeholder="0x... (Sepolia Anchor Contract)" class="form-select font-mono text-xs" style="flex: 1; padding: 6px 10px;" />
              <button class="btn btn-outline btn-xs" id="btn-save-anchor-contract">Save</button>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
            <button class="btn btn-outline btn-sm" id="btn-anchor-connect">
              🦊 Connect
            </button>
            <button class="btn btn-primary btn-sm" id="btn-anchor-now">
              ⛓️ Anchor now
            </button>
            <button class="btn btn-success btn-sm" id="btn-anchor-verify">
              🔍 Verify
            </button>
          </div>
        </div>

        <!-- Dynamic Output / Status Box -->
        <div id="anchor-status-box" style="display: none; margin-bottom: 14px;"></div>

        <!-- Recent Anchors Table -->
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span class="text-xs font-semibold text-gov-navy uppercase">Recent On-Chain Anchors (${storedAnchors.length})</span>
            <span class="text-xs text-gov-muted font-mono">Persisted in localStorage</span>
          </div>
          <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
            <table class="data-table" style="font-size: 0.8rem;">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Root / Hash</th>
                  <th>Tx Hash (Sepolia Etherscan)</th>
                </tr>
              </thead>
              <tbody id="anchor-history-tbody">
                ${storedAnchors.length === 0 ? `
                  <tr><td colspan="4" class="text-center py-4 text-gov-muted">No anchors submitted yet in this browser session.</td></tr>
                ` : storedAnchors.slice(0, 5).map(a => `
                  <tr>
                    <td class="text-xs">${new Date(a.timestamp).toLocaleTimeString()}</td>
                    <td><span class="badge badge-gov font-mono">${a.type || 'LEDGER_ROOT'}</span></td>
                    <td class="font-mono text-xs">${(a.root || '').slice(0, 16)}...</td>
                    <td>
                      <a href="${a.explorerUrl || (config.EXPLORER + '/tx/' + a.txHash)}" target="_blank" rel="noopener noreferrer" class="font-mono text-xs" style="color: #2563EB; text-decoration: underline;">
                        ${(a.txHash || '').slice(0, 14)}... ↗
                      </a>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  }

  /**
   * Render Ledger Integrity Badge
   */
  function renderLedgerBadge(verifyResult, blockCount) {
    const nodeStatus = (verifyResult && verifyResult.nodeStatus) || (window.Ledger && window.Ledger.getNodes ? window.Ledger.getNodes() : []);
    const divergedNodes = Array.isArray(nodeStatus) ? nodeStatus.filter(n => n.status === 'diverged') : [];
    const isDiverged = divergedNodes.length > 0;

    if (!verifyResult || !verifyResult.valid) {
      const brokenIdx = verifyResult ? verifyResult.brokenIndex : 0;
      return `
        <div class="alert alert-danger" style="margin-bottom: 0; padding: 0.5rem 0.85rem; display: flex; align-items: center; gap: 8px; border: 2px solid var(--color-danger);">
          <span style="font-size: 1.1rem; color: var(--color-danger); font-weight: bold;">▲</span>
          <div>
            <div class="font-mono" style="font-weight: 800; font-size: 0.8rem; color: var(--color-danger);">
              CONSENSUS FAILED: TAMPER DETECTED AT BLOCK #${brokenIdx}!
            </div>
            <div style="font-size: 0.72rem; color: #991B1B;">
              SHA-256 digest mismatch: Majority chain consensus broken
            </div>
          </div>
        </div>
      `;
    } else if (isDiverged) {
      return `
        <div class="alert alert-warning" style="margin-bottom: 0; padding: 0.5rem 0.85rem; display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-warning);">
          <span style="font-size: 1.1rem; color: var(--color-warning); font-weight: bold;">▲</span>
          <div>
            <div class="font-mono" style="font-weight: 700; font-size: 0.8rem; color: var(--color-warning);">
              1 NODE DIVERGED - CONSENSUS HOLDS (2/3)
            </div>
            <div style="font-size: 0.72rem; color: #92400E;">
              ${divergedNodes.map(n => n.name).join(', ')} diverged from state. Majority 2/3 consensus preserves ledger integrity.
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="alert alert-success" style="margin-bottom: 0; padding: 0.5rem 0.85rem; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1rem; color: var(--color-success); font-weight: bold;">✔</span>
          <div>
            <div class="font-mono" style="font-weight: 700; font-size: 0.8rem; color: var(--color-success);">
              SIMULATED PERMISSIONED LEDGER: INTACT
            </div>
            <div style="font-size: 0.72rem; color: #166534;">
              All ${blockCount} SHA-256 blocks cryptographically linked and verified (3/3 Consensus)
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
        <div style="text-align: center; color: var(--color-success); padding: 30px 10px; background: #F0FDF4; border-radius: 6px; border: 1px dashed #BBF7D0;">
          <div style="font-size: 1.3rem;">✔</div>
          <div style="font-weight: 700; font-size: 0.9rem; margin-top: 4px;">Zero Violations Detected</div>
          <div style="font-size: 0.75rem; color: #166534; margin-top: 2px;">All institutions within intake caps &amp; approved NRI quota.</div>
        </div>
      `;
    }

    return anomalies.map(a => {
      const isHigh = a.severity === 'high';
      const isMed = a.severity === 'med';
      const bg = isHigh ? '#FEF2F2' : isMed ? '#FFFBEB' : '#EFF6FF';
      const border = isHigh ? '#FECACA' : isMed ? '#FDE68A' : '#BFDBFE';
      const badgeBg = isHigh ? 'badge-danger' : isMed ? 'badge-warning' : 'badge-primary';

      return `
        <div style="background: ${bg}; border-left: 4px solid ${isHigh ? 'var(--color-danger)' : isMed ? 'var(--gov-saffron)' : '#2563EB'}; border: 1px solid ${border}; border-left-width: 4px; padding: 10px 12px; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: var(--gov-navy-dark);">${a.collegeName || a.collegeId}</span>
            <span class="badge ${badgeBg}">
              ${a.severity.toUpperCase()} RISK
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
      return `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #94A3B8;">No colleges registered.</td></tr>`;
    }

    return stats.map(s => {
      const utilFrac = s.utilization > 1 ? s.utilization / 100 : s.utilization;
      const utilPct = (utilFrac * 100).toFixed(1);
      const isNriOver = s.nriAdmitted > s.nriQuota;
      const isCapCritical = utilFrac >= 0.95;

      let statusBadge = `<span class="badge badge-success">Compliant</span>`;
      if (isNriOver) {
        statusBadge = `<span class="badge badge-danger">NRI Breach</span>`;
      } else if (isCapCritical) {
        statusBadge = `<span class="badge badge-warning">Capacity Critical</span>`;
      }

      // Progress bar color
      const barColor = isCapCritical ? 'var(--color-danger)' : utilFrac > 0.8 ? 'var(--gov-saffron)' : 'var(--gov-navy)';

      return `
        <tr class="${isNriOver ? 'row-rejected' : ''}">
          <td class="font-mono" style="font-weight: 600; color: var(--gov-navy);">${s.collegeId}</td>
          <td style="font-weight: 600; color: var(--text-main);">${s.name}</td>
          <td style="color: var(--text-muted);">${s.state}</td>
          <td style="text-align: right; font-weight: 600;">${s.intake}</td>
          <td style="text-align: right; font-weight: 700; color: var(--gov-navy-dark);">${s.admitted}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1; height: 6px; background: #E2E8F0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${Math.min(utilFrac * 100, 100)}%; height: 100%; background: ${barColor};"></div>
              </div>
              <span class="font-mono" style="font-size: 0.75rem; font-weight: 600; color: #475569; width: 42px; text-align: right;">${utilPct}%</span>
            </div>
          </td>
          <td style="text-align: right; font-weight: 600; color: ${isNriOver ? 'var(--color-danger)' : '#475569'};">
            ${s.nriAdmitted} / ${s.nriQuota}
          </td>
          <td style="text-align: center;">${statusBadge}</td>
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

    // Destroy existing chart instance before creating new one
    if (chartInstance) {
      try {
        chartInstance.destroy();
      } catch (e) {
        console.warn('Error destroying chart instance:', e);
      }
      chartInstance = null;
    }

    // Check if Chart.js is loaded
    if (typeof window.Chart === 'function') {
      try {
        const ctx = canvas.getContext('2d');
        chartInstance = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: states,
            datasets: [
              {
                label: 'Admitted Seats',
                data: admittedData,
                backgroundColor: '#0B3C5D',
                borderRadius: 4,
                barPercentage: 0.6
              },
              {
                label: 'Intake Capacity',
                data: intakeData,
                backgroundColor: '#CBD5E1',
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
                  font: { size: 11, family: 'Inter, -apple-system, sans-serif' }
                }
              },
              tooltip: {
                callbacks: {
                  afterLabel: function (context) {
                    const idx = context.dataIndex;
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
                grid: { color: '#F1F5F9' },
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
            <div style="background:#E2E8F0; height:8px; border-radius:4px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:var(--gov-navy);"></div>
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
        btnVerify.textContent = 'Verifying...';
        const ledger = getLedger();
        let result = { valid: true, brokenIndex: -1 };
        if (typeof ledger.verifyChain === 'function') {
          result = await ledger.verifyChain();
        }
        const badgeBox = document.getElementById('ledger-integrity-badge-container');
        if (badgeBox) {
          badgeBox.innerHTML = renderLedgerBadge(result, ledger.getChain().length);
        }
        if (window.App && typeof window.App.updateLedgerBadge === 'function') {
          window.App.updateLedgerBadge();
        }
        btnVerify.disabled = false;
        btnVerify.textContent = '🔍 Verify Ledger Chain';
      });
    }

    // 2. Tamper Block Button (Demo Fraud Simulation)
    const btnTamper = document.getElementById('btn-dashboard-tamper-block');
    if (btnTamper) {
      btnTamper.addEventListener('click', async () => {
        const ledger = getLedger();
        const chain = ledger.getChain();
        if (!chain || chain.length <= 1) {
          alert('Not enough blocks to tamper. Please pre-seed admissions or upload students first.');
          return;
        }

        const targetIndex = chain.length > 2 ? 2 : 1;
        const confirmTamper = confirm(
          `SIMULATED BYZANTINE FAULT DEMO:\n\nThis will mutate data inside Block #${targetIndex} on Validator-KA only.\n\nValidator-KA will diverge, but the 2/3 majority consensus will preserve ledger integrity. Proceed?`
        );

        if (confirmTamper) {
          if (typeof ledger.tamper === 'function') {
            ledger.tamper(targetIndex, 'node-ka');
          }
          if (window.App && typeof window.App.updateLedgerBadge === 'function') {
            window.App.updateLedgerBadge();
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
          if (window.App && typeof window.App.seedDemoState === 'function') {
            await window.App.seedDemoState(true);
          } else {
            const ledger = getLedger();
            if (typeof ledger.reset === 'function') {
              ledger.reset();
            }
          }
          if (window.App && typeof window.App.updateLedgerBadge === 'function') {
            window.App.updateLedgerBadge();
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

    // 5. On-Chain Anchor Panel Events (Ethereum Sepolia)
    const btnSaveContract = document.getElementById('btn-save-anchor-contract');
    const inputContract = document.getElementById('anchor-contract-input');
    const btnConnect = document.getElementById('btn-anchor-connect');
    const btnAnchorNow = document.getElementById('btn-anchor-now');
    const btnAnchorVerify = document.getElementById('btn-anchor-verify');
    const statusBox = document.getElementById('anchor-status-box');

    if (btnSaveContract && inputContract) {
      btnSaveContract.addEventListener('click', () => {
        const val = inputContract.value.trim();
        if (window.CONFIG && typeof window.CONFIG.save === 'function') {
          window.CONFIG.save({ CONTRACT_ADDRESS: val });
        } else if (window.CONFIG) {
          window.CONFIG.CONTRACT_ADDRESS = val;
        }
        alert('Contract address updated: ' + (val || '(cleared)'));
        render();
      });
    }

    if (btnConnect) {
      btnConnect.addEventListener('click', async () => {
        btnConnect.disabled = true;
        btnConnect.textContent = 'Connecting...';
        if (!window.Anchor) {
          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerHTML = `<div class="alert alert-warning">Anchor module (anchor.js) is loading or unavailable.</div>`;
          }
          btnConnect.disabled = false;
          btnConnect.textContent = '🦊 Connect';
          return;
        }

        const res = await window.Anchor.connect();
        if (statusBox) {
          statusBox.style.display = 'block';
          if (res.connected) {
            statusBox.innerHTML = `
              <div class="alert alert-success" style="padding: 10px 14px;">
                ✔ <strong>Wallet Connected:</strong> <span class="font-mono">${res.account}</span> (Sepolia 11155111)
              </div>
            `;
          } else {
            statusBox.innerHTML = `
              <div class="alert alert-warning" style="padding: 10px 14px;">
                ⚠️ <strong>MetaMask Notice:</strong> ${res.message}
              </div>
            `;
          }
        }
        btnConnect.disabled = false;
        btnConnect.textContent = res.connected ? `🦊 ${res.account.slice(0, 6)}...` : '🦊 Connect';
      });
    }

    if (btnAnchorNow) {
      btnAnchorNow.addEventListener('click', async () => {
        btnAnchorNow.disabled = true;
        btnAnchorNow.textContent = 'Anchoring...';
        if (!window.Anchor) {
          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerHTML = `<div class="alert alert-warning">Anchor module (anchor.js) is loading or unavailable.</div>`;
          }
          btnAnchorNow.disabled = false;
          btnAnchorNow.textContent = '⛓️ Anchor now';
          return;
        }

        const res = await window.Anchor.anchorNow();
        if (statusBox) {
          statusBox.style.display = 'block';
          if (res.success) {
            statusBox.innerHTML = `
              <div class="alert alert-success" style="padding: 10px 14px; border: 2px solid var(--color-success);">
                <div>✔ <strong>${res.message}</strong></div>
                <div class="font-mono text-xs mt-1" style="word-break: break-all;"><strong>Root:</strong> ${res.root}</div>
                <div class="mt-2">
                  <a href="${res.explorerUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-xs font-mono" style="text-decoration: none;">
                    View on Sepolia Etherscan ↗
                  </a>
                </div>
              </div>
            `;
            setTimeout(render, 1500);
          } else {
            statusBox.innerHTML = `
              <div class="alert alert-warning" style="padding: 10px 14px;">
                ⚠️ <strong>Anchor Notice:</strong> ${res.message}
              </div>
            `;
          }
        }
        btnAnchorNow.disabled = false;
        btnAnchorNow.textContent = '⛓️ Anchor now';
      });
    }

    if (btnAnchorVerify) {
      btnAnchorVerify.addEventListener('click', async () => {
        btnAnchorVerify.disabled = true;
        btnAnchorVerify.textContent = 'Verifying on-chain...';
        if (!window.Anchor) {
          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerHTML = `<div class="alert alert-warning">Anchor module (anchor.js) is loading or unavailable.</div>`;
          }
          btnAnchorVerify.disabled = false;
          btnAnchorVerify.textContent = '🔍 Verify';
          return;
        }

        const res = await window.Anchor.verifyAgainstChain();
        if (statusBox) {
          statusBox.style.display = 'block';
          if (res.status === 'ANCHOR MATCH') {
            statusBox.innerHTML = `
              <div class="alert alert-success" style="padding: 10px 14px; border: 2px solid var(--color-success);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge badge-success font-mono font-bold" style="font-size: 0.85rem; padding: 4px 8px;">ANCHOR MATCH</span>
                  <strong style="color: var(--color-success);">Ledger Verified Against Blockchain</strong>
                </div>
                <div class="text-xs text-gov-muted mt-2">${res.message}</div>
                <div class="font-mono text-xs mt-1" style="word-break: break-all;">
                  <strong>Contract Anchored Root:</strong> ${res.latestRoot}<br/>
                  <strong>Current Ledger Root:</strong> ${res.currentLedgerRoot}
                </div>
              </div>
            `;
          } else if (res.status === 'LEDGER CHANGED SINCE ANCHOR') {
            statusBox.innerHTML = `
              <div class="alert alert-danger" style="padding: 10px 14px; border: 2px solid var(--color-danger);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge badge-danger font-mono font-bold" style="font-size: 0.85rem; padding: 4px 8px;">LEDGER CHANGED SINCE ANCHOR</span>
                  <strong style="color: var(--color-danger);">Root Discrepancy Detected</strong>
                </div>
                <div class="text-xs mt-2" style="color: #991B1B;">${res.message}</div>
                <div class="font-mono text-xs mt-1" style="word-break: break-all;">
                  <strong>Contract Anchored Root:</strong> ${res.latestRoot || 'None'}<br/>
                  <strong>Current Ledger Root:</strong> ${res.currentLedgerRoot}
                </div>
              </div>
            `;
          } else {
            statusBox.innerHTML = `
              <div class="alert alert-warning" style="padding: 10px 14px;">
                ⚠️ <strong>Verification Notice:</strong> ${res.message}
              </div>
            `;
          }
        }
        btnAnchorVerify.disabled = false;
        btnAnchorVerify.textContent = '🔍 Verify';
      });
    }
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
