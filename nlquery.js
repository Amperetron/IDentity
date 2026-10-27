/**
 * nlquery.js - Natural Language Query Engine for AICTE Admission Oversight
 * Agent B - Shared Contract: window.NLQuery
 *
 * Capabilities:
 * - run(question) -> { rows, explanation }
 * - Fast, deterministic local keyword parsing engine (Zero external LLM / network calls)
 * - Recognizes:
 *   - State names (e.g. Maharashtra, Karnataka, Delhi, Tamil Nadu, Gujarat, Uttar Pradesh)
 *   - "NRI", "quota", "exceeded", "overflow", "breach"
 *   - "above N%", "> N%", "over N%"
 *   - "full", "capacity", "exhausted", "vacant", "available"
 *   - "anomaly", "anomalies", "flags", "fraud", "violations"
 *   - 12-digit APAAR IDs & student credential searches
 *   - "certificate", "credentials", "issued"
 * - Interactive UI with suggestion query chips, query explanation, and dynamic results table
 */

(function () {
  'use strict';

  // Fallback / Adapter for environment independence
  function getLedger() {
    return window.Ledger || {
      getChain: () => []
    };
  }

  function getSeed() {
    return window.SEED || {
      colleges: [],
      apaar: []
    };
  }

  function getCollegeStats() {
    if (window.Rules && typeof window.Rules.getCollegeStats === 'function') {
      try {
        const stats = window.Rules.getCollegeStats();
        if (Array.isArray(stats) && stats.length > 0) return stats;
      } catch (e) {
        console.warn('Rules.getCollegeStats failed in nlquery:', e);
      }
    }
    if (window.Dashboard && typeof window.Dashboard.getCollegeStats === 'function') {
      return window.Dashboard.getCollegeStats();
    }

    // Direct calculation
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
   * Natural Language Query Parser & Executor
   * Returns { rows: Array<Object>, explanation: string }
   */
  async function run(question) {
    if (!question || typeof question !== 'string') {
      return {
        rows: [],
        explanation: 'Please enter a valid natural language query.'
      };
    }

    const q = question.trim().toLowerCase();
    const stats = getCollegeStats();
    const chain = getLedger().getChain();
    const seed = getSeed();

    // -----------------------------------------------------------------
    // 1. Query: Anomalies / Flags / Fraud
    // -----------------------------------------------------------------
    if (q.includes('anomaly') || q.includes('anomalies') || q.includes('flag') || q.includes('fraud') || q.includes('violation')) {
      let anomalies = [];
      if (window.Anomalies && typeof window.Anomalies.detect === 'function') {
        anomalies = await window.Anomalies.detect();
      } else if (window.Anomalies && typeof window.Anomalies.getAnomalies === 'function') {
        anomalies = window.Anomalies.getAnomalies();
      } else {
        // Fallback scan from ledger FLAG blocks
        chain.forEach(b => {
          if (b.type === 'FLAG' && b.data) anomalies.push(b.data);
        });
      }

      const rows = anomalies.map(a => ({
        'Severity': a.severity ? a.severity.toUpperCase() : 'HIGH',
        'College ID': a.collegeId || '-',
        'Institution': a.collegeName || a.collegeId || '-',
        'Violation Type': a.type || 'POLICY_ALERT',
        'Reason & Details': a.reason || '-'
      }));

      return {
        rows,
        explanation: `Identified ${rows.length} active risk anomalies and compliance flags recorded across institutions.`
      };
    }

    // -----------------------------------------------------------------
    // 2. Query: Certificates / Credentials
    // -----------------------------------------------------------------
    if (q.includes('certificate') || q.includes('credential') || q.includes('issued')) {
      const certBlocks = chain.filter(b => b.type === 'CERTIFICATE' && b.data);
      const rows = certBlocks.map(b => {
        const payload = (b.data && b.data.payload) || {};
        return {
          'Block #': b.index !== undefined ? '#' + b.index : '-',
          'APAAR ID': payload.apaarId || '-',
          'Student Name': payload.name || '-',
          'Institution': payload.college || '-',
          'Roll Number': payload.rollNo || '-',
          'Issued Date': payload.issuedAt ? new Date(payload.issuedAt).toLocaleDateString() : '-'
        };
      });

      return {
        rows,
        explanation: `Found ${rows.length} cryptographically signed credentials committed to the simulated ledger.`
      };
    }

    // -----------------------------------------------------------------
    // 3. Query: Student APAAR ID Search (12-digit number)
    // -----------------------------------------------------------------
    const apaarMatch = q.match(/\b\d{12}\b/);
    if (apaarMatch) {
      const searchId = apaarMatch[0];
      const matchingBlocks = chain.filter(b => b.data && String(b.data.apaarId) === searchId);
      const profile = (seed.apaar || []).find(a => String(a.apaarId) === searchId);

      const rows = matchingBlocks.map(b => ({
        'Block #': b.index !== undefined ? '#' + b.index : '-',
        'Action': b.type,
        'APAAR ID': searchId,
        'Candidate': (b.data && b.data.name) || (profile && profile.name) || 'Registered Student',
        'College ID': (b.data && b.data.collegeId) || '-',
        'Timestamp': new Date(b.timestamp).toLocaleString()
      }));

      return {
        rows,
        explanation: `Retrieved ${rows.length} ledger event(s) for Sandbox APAAR ID ${searchId}${profile ? ` (${profile.name})` : ''}.`
      };
    }

    // -----------------------------------------------------------------
    // 4. Institutional Query Filters (State, NRI, Utilization)
    // -----------------------------------------------------------------
    let filtered = [...stats];
    const explanations = [];

    // Filter A: State Name Match
    const allStates = new Set();
    stats.forEach(s => { if (s.state) allStates.add(s.state.toLowerCase()); });
    (seed.colleges || []).forEach(c => { if (c.state) allStates.add(c.state.toLowerCase()); });

    let matchedState = null;
    allStates.forEach(st => {
      if (q.includes(st)) {
        matchedState = st;
      }
    });

    if (matchedState) {
      filtered = filtered.filter(s => (s.state || '').toLowerCase() === matchedState);
      explanations.push(`located in ${matchedState.charAt(0).toUpperCase() + matchedState.slice(1)}`);
    }

    // Filter B: NRI Exceeded / Quota Breach / Overflow
    const isNriExceeded = (q.includes('nri') || q.includes('quota')) &&
      (q.includes('exceed') || q.includes('overflow') || q.includes('breach') || q.includes('over') || q.includes('violation'));
    const isNriGeneral = q.includes('nri') && !isNriExceeded;

    // Scan chain for any college flagged for NRI overflow/attempts
    const nriFlaggedColleges = new Set();
    chain.forEach(b => {
      if (b.type === 'FLAG' && b.data && b.data.collegeId) {
        const r = (b.data.reason || '').toLowerCase();
        if (r.includes('nri') || b.data.type === 'NRI_QUOTA_BREACH') {
          nriFlaggedColleges.add(b.data.collegeId.toLowerCase());
        }
      }
    });

    if (isNriExceeded) {
      filtered = filtered.filter(s => s.nriAdmitted > s.nriQuota || nriFlaggedColleges.has(s.collegeId.toLowerCase()));
      explanations.push('exceeding approved NRI quota or flagged for NRI overflow attempts');
    } else if (isNriGeneral) {
      filtered = filtered.filter(s => s.nriAdmitted > 0 || nriFlaggedColleges.has(s.collegeId.toLowerCase()));
      explanations.push('with active NRI admissions or NRI quota requests');
    }

    // Filter C: Utilization Percentage Filter ("above N%", "> N%", "over N%")
    const pctMatch = q.match(/(?:above|>|over|greater than|more than)\s*(\d+)\s*%/i) || q.match(/>\s*(\d+)/);
    if (pctMatch) {
      const threshold = parseFloat(pctMatch[1]);
      filtered = filtered.filter(s => {
        const util = s.utilization > 1 ? s.utilization : s.utilization * 100;
        return util >= threshold;
      });
      explanations.push(`with intake utilization >= ${threshold}%`);
    } else if (q.includes('full') || q.includes('exhausted') || q.includes('capacity')) {
      filtered = filtered.filter(s => {
        const util = s.utilization > 1 ? s.utilization / 100 : s.utilization;
        return util >= 0.95 || s.admitted >= s.intake;
      });
      explanations.push('at or near full capacity (>= 95% utilization)');
    } else if (q.includes('vacant') || q.includes('available') || q.includes('empty')) {
      filtered = filtered.filter(s => s.admitted < s.intake);
      explanations.push('with available vacant seats');
    }

    // Convert filtered stats to display rows
    const rows = filtered.map(s => {
      const util = s.utilization > 1 ? s.utilization / 100 : s.utilization;
      const isFlagged = nriFlaggedColleges.has(s.collegeId.toLowerCase());
      const isNriOver = s.nriAdmitted > s.nriQuota || isFlagged;
      let comp = 'COMPLIANT';
      if (isNriOver) comp = 'NRI QUOTA BREACH';
      else if (util >= 0.95) comp = 'CAPACITY CRITICAL';

      return {
        'College ID': s.collegeId,
        'Institution': s.name,
        'State': s.state,
        'Total Intake': s.intake,
        'Admitted': s.admitted,
        'Utilization': `${(util * 100).toFixed(1)}%`,
        'NRI Admitted': `${s.nriAdmitted} / ${s.nriQuota}`,
        'Compliance': comp
      };
    });

    const explanationText = explanations.length > 0
      ? `Found ${rows.length} college(s) ${explanations.join(' and ')}.`
      : `Displaying all ${rows.length} registered technical institutions.`;

    return {
      rows,
      explanation: explanationText
    };
  }

  /**
   * Render the Natural Language Query UI into #tab-query
   */
  function render() {
    const container = document.getElementById('tab-query');
    if (!container) return;

    container.innerHTML = `
      <div class="nlquery-root" style="max-width: 1000px; margin: 0 auto; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #0f2942 0%, #1e4976 100%); color: #ffffff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <h2 style="margin: 0; font-size: 1.4rem; font-weight: 700;">AICTE Natural Language Query Engine</h2>
              <p style="margin: 6px 0 0; opacity: 0.9; font-size: 0.85rem;">
                Deterministic Local Rule & Semantic Keyword Parser • Zero Latency • No External LLM Calls
              </p>
            </div>
            <span style="background: #2563eb; color: #fff; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
              Local Keyword Engine
            </span>
          </div>
        </div>

        <!-- Query Input Section -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px;">
          <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
            <input type="text" id="nlquery-input" placeholder='Ask AICTE engine: e.g. "Colleges in Maharashtra above 90%", "Colleges exceeding NRI quota", "Show all anomalies"' style="flex: 1; min-width: 280px; padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; box-sizing: border-box;" />
            <button id="btn-nlquery-run" style="padding: 12px 24px; background: #0f2942; color: #ffffff; border: none; border-radius: 6px; font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: background 0.2s;">
              Run Query
            </button>
          </div>

          <!-- Quick Suggestion Query Chips -->
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 8px;">
              Quick Search Presets (Click to Execute):
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="nlquery-preset-chips">
              <button class="nl-chip" data-query="Colleges with utilization above 90%" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; padding: 5px 10px; border-radius: 16px; font-size: 0.8rem; cursor: pointer;">
                🎯 Above 90% utilization
              </button>
              <button class="nl-chip" data-query="Colleges exceeding NRI quota" style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 5px 10px; border-radius: 16px; font-size: 0.8rem; cursor: pointer;">
                ⚠️ Colleges exceeding NRI quota
              </button>
              <button class="nl-chip" data-query="Show all detected anomalies" style="background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 5px 10px; border-radius: 16px; font-size: 0.8rem; cursor: pointer;">
                🚨 Show all detected anomalies
              </button>
              <button class="nl-chip" data-query="Colleges in Maharashtra" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 5px 10px; border-radius: 16px; font-size: 0.8rem; cursor: pointer;">
                📍 Colleges in Maharashtra
              </button>
              <button class="nl-chip" data-query="Colleges in Karnataka above 80%" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; padding: 5px 10px; border-radius: 16px; font-size: 0.8rem; cursor: pointer;">
                ⚡ Karnataka above 80%
              </button>
              <button class="nl-chip" data-query="List all issued certificates" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 5px 10px; border-radius: 16px; font-size: 0.8rem; cursor: pointer;">
                📜 Issued certificates
              </button>
            </div>
          </div>
        </div>

        <!-- Query Output Container -->
        <div id="nlquery-output-box" style="display: none; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Explanation Header -->
          <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #2563eb; letter-spacing: 0.5px;">Engine Interpretation</div>
              <div id="nlquery-explanation-text" style="font-size: 0.95rem; font-weight: 600; color: #1e293b; margin-top: 2px;"></div>
            </div>
            <span id="nlquery-result-count" style="background: #0f2942; color: #ffffff; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 12px;"></span>
          </div>

          <!-- Dynamic Results Table -->
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
              <thead id="nlquery-table-thead"></thead>
              <tbody id="nlquery-table-tbody"></tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    // Hook search button & input
    const input = document.getElementById('nlquery-input');
    const btnRun = document.getElementById('btn-nlquery-run');
    const outputBox = document.getElementById('nlquery-output-box');
    const expText = document.getElementById('nlquery-explanation-text');
    const countBadge = document.getElementById('nlquery-result-count');
    const thead = document.getElementById('nlquery-table-thead');
    const tbody = document.getElementById('nlquery-table-tbody');

    async function executeQuery(text) {
      if (!text || !text.trim()) return;

      btnRun.disabled = true;
      btnRun.textContent = 'Executing...';

      try {
        const result = await run(text);
        outputBox.style.display = 'block';
        expText.textContent = result.explanation;
        countBadge.textContent = `${result.rows.length} Result${result.rows.length === 1 ? '' : 's'}`;

        if (result.rows.length === 0) {
          thead.innerHTML = '';
          tbody.innerHTML = `<tr><td style="padding: 24px; text-align: center; color: #94a3b8;">No matching records found for this query. Try one of the preset chips above.</td></tr>`;
        } else {
          // Dynamic columns based on row keys
          const headers = Object.keys(result.rows[0]);
          thead.innerHTML = `
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
              ${headers.map(h => `<th style="padding: 10px 12px;">${h}</th>`).join('')}
            </tr>
          `;

          tbody.innerHTML = result.rows.map(row => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              ${headers.map(h => {
                const val = row[h];
                let cellContent = val;
                // Add badge styling for Compliance / Severity
                if (h === 'Compliance' || h === 'Severity') {
                  const isBad = String(val).includes('BREACH') || String(val).includes('HIGH') || String(val).includes('ALERT');
                  const isWarn = String(val).includes('CRITICAL') || String(val).includes('MED');
                  const bg = isBad ? '#fee2e2' : isWarn ? '#fef3c7' : '#ecfdf5';
                  const textCol = isBad ? '#991b1b' : isWarn ? '#92400e' : '#065f46';
                  cellContent = `<span style="background: ${bg}; color: ${textCol}; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">${val}</span>`;
                }
                return `<td style="padding: 10px 12px;">${cellContent}</td>`;
              }).join('')}
            </tr>
          `).join('');
        }
      } catch (err) {
        alert('Query execution failed: ' + err.message);
      } finally {
        btnRun.disabled = false;
        btnRun.textContent = 'Run Query';
      }
    }

    if (btnRun && input) {
      btnRun.addEventListener('click', () => executeQuery(input.value));
      input.addEventListener('keypress', e => {
        if (e.key === 'Enter') executeQuery(input.value);
      });
    }

    // Hook preset chips
    container.querySelectorAll('.nl-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const qText = chip.getAttribute('data-query');
        if (input) input.value = qText;
        executeQuery(qText);
      });
    });

    // Run initial demo query automatically so tab is instantly populated!
    executeQuery('Colleges with utilization above 90%');
  }

  /**
   * Module initialization
   */
  async function init() {
    render();
  }

  // Export to global window object strictly complying with Shared Contract
  window.NLQuery = {
    init,
    run,
    render
  };

})();
