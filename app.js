/**
 * app.js - Main Application Orchestrator & Tab Switcher for AICTE-APAAR Platform
 * Role: Agent A
 * 
 * Responsibilities:
 * - Tab switching logic (#tab-upload, #tab-certs, #tab-verify, #tab-dashboard, #tab-query, #tab-ledger)
 * - Module initialization: calls init() on window.Upload, window.Certs, window.Dashboard, window.NLQuery
 * - Seed demo state on first load: pre-admits ~40 students, 2 colleges near 95%+ utilization, 1 NRI overflow flagged
 * - Ledger Explorer UI in #tab-ledger showing the raw cryptographic hash chain and tamper verification
 */

(function () {
  'use strict';

  let currentTabId = 'tab-dashboard';

  // Seed 40 admissions and 1 NRI overflow flag into Ledger
  async function seedDemoState(force = false) {
    if (!window.Ledger || !window.SEED) return;

    const existingChain = window.Ledger.getChain();
    // Only seed if chain contains only Genesis block or forced
    if (!force && existingChain.length > 1) {
      console.log("Ledger already contains blocks. Skipping initial seed.");
      return;
    }

    if (force) {
      window.Ledger.reset();
    }

    console.log("Seeding demo admissions into Simulated Permissioned Ledger...");

    // Colleges definition reference
    // MH-COEP-01 (intake: 10, nriQuota: 2) -> admit 10 students (100% capacity)
    // TN-TCEM-02 (intake: 8, nriQuota: 1)  -> admit 8 students (100% capacity)
    // Other 22 students distributed across other colleges = total 40 students

    const seedAdmissions = [
      // 1. MH-COEP-01: 10 students (Capacity: 10 -> 100% utilization, near 95%+)
      { apaarId: "987654320001", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-CS01" },
      { apaarId: "987654320002", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-CS02" },
      { apaarId: "987654320003", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-ME01" },
      { apaarId: "987654320004", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-ME02" },
      { apaarId: "987654320005", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-EE01" },
      { apaarId: "987654320006", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-EE02" },
      { apaarId: "987654320007", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-CV01" },
      { apaarId: "987654320008", collegeId: "MH-COEP-01", isNRI: false, rollNo: "COEP-2026-CV02" },
      { apaarId: "987654320009", collegeId: "MH-COEP-01", isNRI: true,  rollNo: "COEP-2026-NRI01" },
      { apaarId: "987654320010", collegeId: "MH-COEP-01", isNRI: true,  rollNo: "COEP-2026-NRI02" },

      // 2. TN-TCEM-02: 8 students (Capacity: 8 -> 100% utilization, near 95%+)
      { apaarId: "987654320011", collegeId: "TN-TCEM-02", isNRI: true,  rollNo: "TCEM-2026-NRI01" },
      { apaarId: "987654320012", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-CS01" },
      { apaarId: "987654320013", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-CS02" },
      { apaarId: "987654320014", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-EC01" },
      { apaarId: "987654320015", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-EC02" },
      { apaarId: "987654320016", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-ME01" },
      { apaarId: "987654320017", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-CV01" },
      { apaarId: "987654320018", collegeId: "TN-TCEM-02", isNRI: false, rollNo: "TCEM-2026-IT01" },

      // 3. MH-VJTI-02 (intake: 12) -> 4 students
      { apaarId: "987654320019", collegeId: "MH-VJTI-02", isNRI: false, rollNo: "VJTI-2026-CS01" },
      { apaarId: "987654320020", collegeId: "MH-VJTI-02", isNRI: false, rollNo: "VJTI-2026-IT01" },
      { apaarId: "987654320021", collegeId: "MH-VJTI-02", isNRI: false, rollNo: "VJTI-2026-ME01" },
      { apaarId: "987654320022", collegeId: "MH-VJTI-02", isNRI: false, rollNo: "VJTI-2026-EE01" },

      // 4. KA-RVCE-01 (intake: 10) -> 3 students
      { apaarId: "987654320023", collegeId: "KA-RVCE-01", isNRI: false, rollNo: "RVCE-2026-CS01" },
      { apaarId: "987654320024", collegeId: "KA-RVCE-01", isNRI: false, rollNo: "RVCE-2026-EC01" },
      { apaarId: "987654320025", collegeId: "KA-RVCE-01", isNRI: false, rollNo: "RVCE-2026-ME01" },

      // 5. KA-BMSC-02 (intake: 12) -> 3 students
      { apaarId: "987654320026", collegeId: "KA-BMSC-02", isNRI: false, rollNo: "BMSC-2026-CS01" },
      { apaarId: "987654320027", collegeId: "KA-BMSC-02", isNRI: false, rollNo: "BMSC-2026-IT01" },
      { apaarId: "987654320028", collegeId: "KA-BMSC-02", isNRI: false, rollNo: "BMSC-2026-EE01" },

      // 6. TN-PSGC-01 (intake: 10) -> 3 students
      { apaarId: "987654320029", collegeId: "TN-PSGC-01", isNRI: false, rollNo: "PSGC-2026-CS01" },
      { apaarId: "987654320030", collegeId: "TN-PSGC-01", isNRI: false, rollNo: "PSGC-2026-ME01" },
      { apaarId: "987654320031", collegeId: "TN-PSGC-01", isNRI: false, rollNo: "PSGC-2026-EC01" },

      // 7. DL-DTUD-01 (intake: 12) -> 3 students
      { apaarId: "987654320032", collegeId: "DL-DTUD-01", isNRI: false, rollNo: "DTUD-2026-CS01" },
      { apaarId: "987654320033", collegeId: "DL-DTUD-01", isNRI: false, rollNo: "DTUD-2026-ME01" },
      { apaarId: "987654320034", collegeId: "DL-DTUD-01", isNRI: false, rollNo: "DTUD-2026-EE01" },

      // 8. DL-IGDT-02 (intake: 10) -> 2 students
      { apaarId: "987654320035", collegeId: "DL-IGDT-02", isNRI: false, rollNo: "IGDT-2026-CS01" },
      { apaarId: "987654320036", collegeId: "DL-IGDT-02", isNRI: false, rollNo: "IGDT-2026-IT01" },

      // 9. UP-HBTU-01 (intake: 10) -> 2 students
      { apaarId: "987654320037", collegeId: "UP-HBTU-01", isNRI: false, rollNo: "HBTU-2026-CH01" },
      { apaarId: "987654320038", collegeId: "UP-HBTU-01", isNRI: false, rollNo: "HBTU-2026-ME01" },

      // 10. TS-CBIT-01 (intake: 10) -> 2 students
      { apaarId: "987654320039", collegeId: "TS-CBIT-01", isNRI: false, rollNo: "CBIT-2026-CS01" },
      { apaarId: "987654320040", collegeId: "TS-CBIT-01", isNRI: false, rollNo: "CBIT-2026-EC01" }
    ];

    // Commit 40 admissions sequentially to ledger
    for (const adm of seedAdmissions) {
      const student = window.SEED.getStudent(adm.apaarId);
      await window.Ledger.addBlock("ADMISSION", {
        apaarId: adm.apaarId,
        name: student ? student.name : "Candidate",
        collegeId: adm.collegeId,
        isNRI: adm.isNRI,
        rollNo: adm.rollNo,
        admittedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 3)).toISOString()
      });
    }

    // Flag 1 NRI overflow attempt on ledger
    // Candidate 41 attempted to take a 2nd NRI seat at TN-TCEM-02 (nriQuota is 1, already full)
    const nriOverflowStudent = window.SEED.getStudent("987654320041");
    await window.Ledger.addBlock("FLAG", {
      collegeId: "TN-TCEM-02",
      severity: "high",
      reason: "NRI quota overflow attempt: Thiagarajar College of Engineering, Madurai (Quota: 1, Attempted: 2)",
      details: {
        apaarId: "987654320041",
        name: nriOverflowStudent ? nriOverflowStudent.name : "Rohan Varma",
        collegeId: "TN-TCEM-02",
        isNRI: true,
        rollNo: "TCEM-2026-NRI02",
        attemptedAt: new Date().toISOString()
      }
    });

    console.log("Demo seed complete: 40 admissions committed, 1 NRI overflow flagged.");
  }

  // Switch Active Tab
  function switchTab(tabId) {
    currentTabId = tabId;
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => {
      if (pane.id === tabId) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Notify modules on tab change
    if (tabId === 'tab-ledger') {
      renderLedgerTab();
    } else if (tabId === 'tab-dashboard' && window.Dashboard && typeof window.Dashboard.render === 'function') {
      window.Dashboard.render();
    } else if (tabId === 'tab-dashboard' && window.Dashboard && typeof window.Dashboard.init === 'function') {
      window.Dashboard.init();
    }
  }

  // Render Simulated Permissioned Ledger Explorer into #tab-ledger
  async function renderLedgerTab() {
    const container = document.getElementById('tab-ledger');
    if (!container) return;

    const chain = window.Ledger.getChain();
    const verification = await window.Ledger.verifyChain();

    let blockFilter = container.getAttribute('data-filter') || 'ALL';

    const filteredChain = chain.filter(blk => {
      if (blockFilter === 'ALL') return true;
      return blk.type === blockFilter;
    });

    const html = `
      <div class="gov-card">
        <div class="gov-card-header">
          <div>
            <h2 class="gov-card-title">Simulated Permissioned Ledger Explorer</h2>
            <p class="gov-card-subtitle">
              Append-only SHA-256 cryptographic hash chain stored in local persistence.
              Every block cryptographically binds its payload to the previous block's SHA-256 digest.
            </p>
          </div>
          <div class="header-action-pills">
            <span class="badge ${verification.valid ? 'badge-success' : 'badge-danger'} font-mono">
              ${verification.valid ? '● LEDGER INTEGRITY: VALID' : `▲ COMPROMISED AT BLOCK #${verification.brokenIndex}`}
            </span>
            <span class="badge badge-gov">Total Blocks: ${chain.length}</span>
          </div>
        </div>

        <!-- Ledger Actions Bar -->
        <div class="ledger-actions-bar mt-4">
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" id="btn-verify-chain">
              🔍 Verify Cryptographic Chain
            </button>
            <button class="btn btn-warning btn-sm" id="btn-tamper-demo">
              ⚡ Tamper Block #2 (Simulate Fraud)
            </button>
            <button class="btn btn-danger btn-sm" id="btn-reset-demo">
              🔄 Reset Demo &amp; Ledger
            </button>
          </div>
          <div class="filter-group">
            <label class="text-xs font-semibold text-gov-navy mr-2">Filter Block Type:</label>
            <select class="form-select form-select-sm" id="select-block-filter">
              <option value="ALL" ${blockFilter === 'ALL' ? 'selected' : ''}>All Types (${chain.length})</option>
              <option value="ADMISSION" ${blockFilter === 'ADMISSION' ? 'selected' : ''}>ADMISSION</option>
              <option value="FLAG" ${blockFilter === 'FLAG' ? 'selected' : ''}>FLAG</option>
              <option value="CERTIFICATE" ${blockFilter === 'CERTIFICATE' ? 'selected' : ''}>CERTIFICATE</option>
              <option value="GENESIS" ${blockFilter === 'GENESIS' ? 'selected' : ''}>GENESIS</option>
            </select>
          </div>
        </div>

        <!-- Chain Integrity Alert Banner -->
        ${!verification.valid ? `
          <div class="alert alert-danger mt-4">
            <div class="font-bold">⚠️ Cryptographic Ledger Breach Detected!</div>
            <div class="text-xs mt-1">
              Block #${verification.brokenIndex} has been tampered! The computed SHA-256 digest does not match the stored cryptographic header, invalidating the hash chain.
            </div>
            <div class="text-xs text-red-800 mt-1 font-mono">${verification.reason || ''}</div>
          </div>
        ` : `
          <div class="alert alert-success mt-4">
            <div class="font-bold">✓ Cryptographic Chain Verified</div>
            <div class="text-xs mt-1">
              All ${chain.length} blocks verified sequentially. Every SHA-256 parent link and payload digest is mathematically sound.
            </div>
          </div>
        `}

        <!-- Blocks Stream -->
        <div class="blocks-container mt-6">
          ${filteredChain.map((blk) => {
            const isBroken = !verification.valid && blk.index >= verification.brokenIndex;
            return `
              <div class="block-card ${isBroken ? 'block-card-broken' : ''} ${blk.data?.__tampered ? 'block-card-tampered' : ''}">
                <div class="block-header">
                  <div class="block-title">
                    <span class="block-index">#${blk.index}</span>
                    <span class="badge ${getBlockTypeBadgeClass(blk.type)}">${blk.type}</span>
                    ${blk.data?.__tampered ? '<span class="badge badge-danger">TAMPERED PAYLOAD</span>' : ''}
                  </div>
                  <div class="block-meta">
                    <span class="text-xs text-gov-muted">${new Date(blk.timestamp).toLocaleString()}</span>
                    <button class="btn btn-xs btn-outline ml-2 btn-tamper-single" data-index="${blk.index}">
                      Tamper Block
                    </button>
                  </div>
                </div>

                <div class="block-hashes mt-2">
                  <div class="hash-row">
                    <span class="hash-label">Prev Hash:</span>
                    <span class="hash-value font-mono">${blk.prevHash}</span>
                  </div>
                  <div class="hash-row mt-1">
                    <span class="hash-label">Block Hash:</span>
                    <span class="hash-value font-mono text-gov-navy font-bold">${blk.hash}</span>
                  </div>
                </div>

                <div class="block-payload mt-3">
                  <div class="payload-label">Data Payload:</div>
                  <pre class="payload-code">${escapeHtml(JSON.stringify(blk.data, null, 2))}</pre>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach Ledger event handlers
    const btnVerify = document.getElementById('btn-verify-chain');
    const btnTamper = document.getElementById('btn-tamper-demo');
    const btnReset = document.getElementById('btn-reset-demo');
    const selectFilter = document.getElementById('select-block-filter');

    if (btnVerify) {
      btnVerify.addEventListener('click', async () => {
        renderLedgerTab();
      });
    }

    if (btnTamper) {
      btnTamper.addEventListener('click', () => {
        window.Ledger.tamper(2);
        renderLedgerTab();
        updateLedgerBadge();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        if (confirm("Reset demo data and clear simulated ledger?")) {
          await seedDemoState(true);
          renderLedgerTab();
          updateLedgerBadge();
          if (window.Dashboard && typeof window.Dashboard.init === 'function') {
            window.Dashboard.init();
          }
        }
      });
    }

    if (selectFilter) {
      selectFilter.addEventListener('change', (e) => {
        container.setAttribute('data-filter', e.target.value);
        renderLedgerTab();
      });
    }

    const singleTamperBtns = container.querySelectorAll('.btn-tamper-single');
    singleTamperBtns.forEach(b => {
      b.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        window.Ledger.tamper(idx);
        renderLedgerTab();
        updateLedgerBadge();
      });
    });
  }

  function getBlockTypeBadgeClass(type) {
    switch (type) {
      case 'GENESIS': return 'badge-gov';
      case 'ADMISSION': return 'badge-primary';
      case 'CANCELLATION': return 'badge-danger';
      case 'CERTIFICATE': return 'badge-success';
      case 'FLAG': return 'badge-warning';
      default: return 'badge-light';
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Update Global Ledger Status Badge in Top Header
  async function updateLedgerBadge() {
    const badge = document.getElementById('global-ledger-status-badge');
    if (!badge || !window.Ledger) return;

    const res = await window.Ledger.verifyChain();
    if (res.valid) {
      badge.className = 'status-indicator status-valid';
      badge.innerHTML = '● Ledger: VERIFIED';
      badge.title = 'Simulated Permissioned Ledger SHA-256 chain is valid.';
    } else {
      badge.className = 'status-indicator status-compromised';
      badge.innerHTML = `▲ Ledger: BREACHED (#${res.brokenIndex})`;
      badge.title = `Data tamper detected at block #${res.brokenIndex}.`;
    }
  }

  // App Initialization
  async function initApp() {
    console.log("Initializing AICTE-APAAR Unified Platform...");

    // 1. Seed demo state if needed
    await seedDemoState(false);

    // 2. Initialize modules
    if (window.Upload && typeof window.Upload.init === 'function') {
      window.Upload.init();
    }
    if (window.Dashboard && typeof window.Dashboard.init === 'function') {
      window.Dashboard.init();
    }
    if (window.Certs && typeof window.Certs.init === 'function') {
      window.Certs.init();
    }
    if (window.NLQuery && typeof window.NLQuery.init === 'function') {
      window.NLQuery.init();
    }

    // 3. Render initial tab
    renderLedgerTab();
    updateLedgerBadge();

    // 4. Setup Tab Navigation Click Listeners
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab) {
          switchTab(targetTab);
        }
      });
    });

    // 5. Global Listeners for Ledger updates
    window.addEventListener('ledger:updated', () => {
      updateLedgerBadge();
      if (currentTabId === 'tab-ledger') {
        renderLedgerTab();
      }
    });

    console.log("Platform initialized successfully.");
  }

  // Export App interface
  window.App = {
    init: initApp,
    switchTab: switchTab,
    seedDemoState: seedDemoState,
    updateLedgerBadge: updateLedgerBadge,
    renderLedgerTab: renderLedgerTab
  };

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
