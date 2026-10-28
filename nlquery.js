/**
 * nlquery.js - Natural Language Query Engine for AICTE Admission Oversight
 * Agent B - Shared Contract: window.NLQuery
 *
 * Capabilities:
 * - Direct integration with window.Ledger, window.Rules, and window.Anomalies
 *   Methods: Rules.getCollegeStats, Ledger.getChain, Anomalies.detect
 * - run(question) -> { rows, explanation, source }
 * - Dual Engine Architecture:
 *   1. Real LLM Proxy via CONFIG.LLM_PROXY_URL (Cloudflare Worker POST {question})
 *      -> Returns JSON filter {filters:[{field,op,value}], sort:{field,dir}}
 *      -> Whitelist fields: name, state, intake, admitted, nriAdmitted, nriQuota, utilization
 *      -> Whitelist ops: > < >= <= = contains
 *      -> Strictly validates types and executes in JS on Rules.getCollegeStats()
 *      -> Displays interpreted filter to user
 *   2. Safe deterministic local keyword & regex parser fallback
 *      -> Silently triggers on empty LLM_PROXY_URL, network error, invalid response, or 6s timeout
 *      -> Result clearly labeled "Parsed locally"
 * - Interactive UI with preset query chips, explanation banner, and responsive results table
 * - NO API keys in any client file
 */

(function () {
  'use strict';

  // Strict field whitelist as mandated by contract
  const WHITELIST_FIELDS = [
    'name',
    'state',
    'intake',
    'admitted',
    'nriAdmitted',
    'nriQuota',
    'utilization'
  ];

  // Strict operator whitelist as mandated by contract
  const WHITELIST_OPS = ['>', '<', '>=', '<=', '=', 'contains'];

  // Normalization map for LLM field synonyms
  const FIELD_SYNONYMS = {
    'name': 'name',
    'institution': 'name',
    'collegename': 'name',
    'college': 'name',
    'state': 'state',
    'intake': 'intake',
    'totalintake': 'intake',
    'capacity': 'intake',
    'admitted': 'admitted',
    'totaladmitted': 'admitted',
    'admissions': 'admitted',
    'nriadmitted': 'nriAdmitted',
    'nri_admitted': 'nriAdmitted',
    'nri': 'nriAdmitted',
    'nriquota': 'nriQuota',
    'nri_quota': 'nriQuota',
    'quota': 'nriQuota',
    'utilization': 'utilization',
    'util': 'utilization',
    'occupancy': 'utilization'
  };

  /**
   * Safe accessor for window.CONFIG
   */
  function getConfig() {
    return window.CONFIG || {
      CONTRACT_ADDRESS: "",
      CHAIN_ID: 11155111,
      EXPLORER: "https://sepolia.etherscan.io",
      LLM_PROXY_URL: ""
    };
  }

  // Safe accessor for window.Ledger
  function getLedger() {
    return window.Ledger || {
      getChain: () => []
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

  /**
   * Derive college stats: calls window.Rules.getCollegeStats() directly,
   * with fallback adapter deriving state from window.Ledger.getChain().
   */
  function getCollegeStats() {
    const rules = getRules();
    if (rules && typeof rules.getCollegeStats === 'function') {
      try {
        const stats = rules.getCollegeStats();
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
   * Validate and sanitize a single filter object from LLM
   * Whitelist fields: name, state, intake, admitted, nriAdmitted, nriQuota, utilization
   * Whitelist ops: > < >= <= = contains
   * Validate types: numeric fields must be Numbers, string fields must be Strings
   */
  function validateFilterItem(item) {
    if (!item || typeof item !== 'object') return null;

    // Field normalization & validation
    const rawField = String(item.field || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const field = FIELD_SYNONYMS[rawField];
    if (!field || !WHITELIST_FIELDS.includes(field)) {
      return null;
    }

    // Operator normalization & validation
    let op = String(item.op || '').trim().toLowerCase();
    if (op === '==' || op === '===') op = '=';
    if (op === 'includes' || op === 'include' || op === 'like') op = 'contains';
    if (!WHITELIST_OPS.includes(op)) {
      return null;
    }

    // Type validation
    const isNumericField = ['intake', 'admitted', 'nriAdmitted', 'nriQuota', 'utilization'].includes(field);

    if (isNumericField) {
      if (op === 'contains') return null; // contains is invalid for numbers
      let num = Number(String(item.value).replace('%', '').trim());
      if (isNaN(num)) return null;

      // Handle fractional utilization (e.g. 0.9 for 90%)
      if (field === 'utilization' && num > 0 && num <= 1) {
        num = num * 100;
      }
      return { field, op, value: num, type: 'number' };
    } else {
      // String fields (name, state)
      if (op !== '=' && op !== 'contains') return null;
      const strVal = String(item.value !== undefined ? item.value : '').trim();
      if (!strVal) return null;
      return { field, op, value: strVal, type: 'string' };
    }
  }

  /**
   * Validate sort definition from LLM
   */
  function validateSort(sort) {
    if (!sort || typeof sort !== 'object' || !sort.field) return null;
    const rawField = String(sort.field).toLowerCase().replace(/[^a-z0-9_]/g, '');
    const field = FIELD_SYNONYMS[rawField];
    if (!field || !WHITELIST_FIELDS.includes(field)) return null;
    const dir = String(sort.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    return { field, dir };
  }

  /**
   * Execute real LLM Query via Cloudflare Worker proxy
   * POST { question } -> { filters: [{field, op, value}], sort: {field, dir} }
   * Enforces 6s timeout, whitelists, type safety, and executes in JS on Rules.getCollegeStats()
   */
  async function runLLM(question) {
    const config = getConfig();
    if (!config.LLM_PROXY_URL || !config.LLM_PROXY_URL.trim()) {
      throw new Error('LLM_PROXY_URL_EMPTY');
    }

    // 6-second timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let response;
    try {
      response = await fetch(config.LLM_PROXY_URL.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`LLM Proxy returned HTTP ${response.status}`);
    }

    const json = await response.json();
    const filterData = json.filters ? json : (json.data && json.data.filters ? json.data : null);

    if (!filterData || !Array.isArray(filterData.filters)) {
      throw new Error('Invalid JSON filter structure from proxy');
    }

    // Validate and sanitize each filter
    const validatedFilters = [];
    for (const f of filterData.filters) {
      const valid = validateFilterItem(f);
      if (valid) validatedFilters.push(valid);
    }

    if (validatedFilters.length === 0) {
      throw new Error('No valid whitelisted filters in LLM response');
    }

    const validatedSort = validateSort(filterData.sort);

    // Apply filters in JS to Rules.getCollegeStats()
    const stats = getCollegeStats();
    let filtered = stats.filter(row => {
      return validatedFilters.every(f => {
        const cell = row[f.field];
        if (f.type === 'number') {
          const cNum = Number(cell);
          if (f.op === '>') return cNum > f.value;
          if (f.op === '>=') return cNum >= f.value;
          if (f.op === '<') return cNum < f.value;
          if (f.op === '<=') return cNum <= f.value;
          if (f.op === '=') return cNum === f.value;
          return false;
        } else {
          const cStr = String(cell || '').toLowerCase();
          const tStr = String(f.value).toLowerCase();
          if (f.op === 'contains') return cStr.includes(tStr);
          if (f.op === '=') return cStr === tStr;
          return false;
        }
      });
    });

    // Apply sort if present
    if (validatedSort) {
      const mult = validatedSort.dir === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        const valA = a[validatedSort.field];
        const valB = b[validatedSort.field];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * mult;
        }
        return String(valA || '').localeCompare(String(valB || '')) * mult;
      });
    }

    // Format display rows
    const rows = filtered.map(s => {
      const utilFrac = s.utilization > 1 ? s.utilization / 100 : s.utilization;
      const isNriOver = s.nriAdmitted > s.nriQuota;
      let comp = 'COMPLIANT';
      if (isNriOver) comp = 'NRI QUOTA BREACH';
      else if (utilFrac >= 0.95 || s.admitted >= s.intake) comp = 'CAPACITY CRITICAL';

      return {
        'College ID': s.collegeId,
        'Institution': s.name,
        'State': s.state,
        'Total Intake': s.intake,
        'Admitted': s.admitted,
        'Utilization': `${(utilFrac * 100).toFixed(1)}%`,
        'NRI Admitted': `${s.nriAdmitted} / ${s.nriQuota}`,
        'Compliance': comp
      };
    });

    // Format interpreted filter explanation
    const filterDescriptions = validatedFilters.map(f => {
      return `${f.field} ${f.op} ${typeof f.value === 'string' ? `"${f.value}"` : f.value}`;
    }).join(' AND ');

    const sortDescription = validatedSort ? ` &bull; Sorted by: ${validatedSort.field} (${validatedSort.dir})` : '';
    const explanation = `Interpreted filter: [${filterDescriptions}]${sortDescription} &bull; Matched ${rows.length} institution(s)`;

    return {
      rows,
      explanation,
      source: 'LLM',
      filter: validatedFilters,
      sort: validatedSort
    };
  }

  /**
   * Deterministic local keyword and regex query parser
   * Safe fallback engine used whenever LLM proxy is unavailable, times out, or unconfigured
   */
  async function runLocal(question) {
    const q = question.trim().toLowerCase();
    const stats = getCollegeStats();
    const chain = getLedger().getChain();
    const seed = getSeed();

    // 1. Anomalies / Flags / Fraud
    if (q.includes('anomaly') || q.includes('anomalies') || q.includes('flag') || q.includes('fraud') || q.includes('violation')) {
      let anomalies = [];
      if (window.Anomalies && typeof window.Anomalies.detect === 'function') {
        anomalies = await window.Anomalies.detect();
      } else if (window.Anomalies && typeof window.Anomalies.getAnomalies === 'function') {
        anomalies = window.Anomalies.getAnomalies();
      } else {
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
        explanation: `Identified ${rows.length} active risk anomalies and compliance flags recorded across institutions.`,
        source: 'LOCAL'
      };
    }

    // 2. Certificates / Credentials
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
        explanation: `Found ${rows.length} cryptographically signed credentials committed to the simulated ledger.`,
        source: 'LOCAL'
      };
    }

    // 3. Student APAAR ID Search (12-digit number)
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
        explanation: `Retrieved ${rows.length} ledger event(s) for Sandbox APAAR ID ${searchId}${profile ? ` (${profile.name})` : ''}.`,
        source: 'LOCAL'
      };
    }

    // 4. Institutional Query Filters (State, NRI, Utilization)
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

    // Filter B: NRI Exceeded / Quota Breach
    const isNriExceeded = (q.includes('nri') || q.includes('quota')) &&
      (q.includes('exceed') || q.includes('overflow') || q.includes('breach') || q.includes('over') || q.includes('violation'));
    const isNriGeneral = q.includes('nri') && !isNriExceeded;

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
      explanations.push('exceeding approved NRI quota');
    } else if (isNriGeneral) {
      filtered = filtered.filter(s => s.nriAdmitted > 0 || nriFlaggedColleges.has(s.collegeId.toLowerCase()));
      explanations.push('with active NRI admissions');
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
      explanation: explanationText,
      source: 'LOCAL'
    };
  }

  /**
   * Primary Entry Point: run(question)
   * Dispatches to Real LLM with Safe Fallback:
   * 1. If CONFIG.LLM_PROXY_URL is configured, attempts LLM proxy POST {question} (6s timeout)
   * 2. On any error, timeout, or empty URL, silently falls back to keyword parser
   * 3. Result labeled "Parsed locally" on fallback
   */
  async function run(question) {
    if (!question || typeof question !== 'string') {
      return {
        rows: [],
        explanation: 'Please enter a valid natural language query.',
        source: 'LOCAL'
      };
    }

    const config = getConfig();
    const hasProxy = Boolean(config.LLM_PROXY_URL && config.LLM_PROXY_URL.trim());

    if (hasProxy) {
      try {
        return await runLLM(question);
      } catch (err) {
        // Silently fall back to local parser
        console.info('LLM proxy request fallback to local parser:', err.message);
      }
    }

    // Local parser fallback execution
    const localRes = await runLocal(question);
    return {
      ...localRes,
      explanation: `Parsed locally: ${localRes.explanation}`,
      source: 'LOCAL'
    };
  }

  /**
   * Render the Natural Language Query UI into #tab-query
   */
  function render() {
    const container = document.getElementById('tab-query');
    if (!container) return;

    const config = getConfig();
    const hasProxy = Boolean(config.LLM_PROXY_URL && config.LLM_PROXY_URL.trim());

    container.innerHTML = `
      <div class="gov-card">
        <!-- Header Banner -->
        <div class="gov-card-header" style="flex-wrap: wrap;">
          <div>
            <div class="brand-sup">AICTE Policy Intelligence</div>
            <h2 class="gov-card-title mt-1">Natural Language Query Engine</h2>
            <p class="gov-card-subtitle">
              Query institutional capacity, NRI quotas, and ledger records with real LLM proxy and automatic safe local keyword fallback.
            </p>
          </div>
          <div class="header-action-pills" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span id="nlquery-proxy-badge" class="badge ${hasProxy ? 'badge-primary' : 'badge-gov'} font-mono">
              ${hasProxy ? 'LLM Proxy: Active' : 'Engine: Local / Fallback Ready'}
            </span>
            <button class="btn btn-outline btn-xs font-mono" id="btn-toggle-proxy-settings">
              ⚙️ Proxy Settings
            </button>
          </div>
        </div>

        <!-- Optional Proxy Settings Dropdown -->
        <div id="proxy-settings-card" style="display: none; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--gov-navy); margin-bottom: 4px;">
            Cloudflare Worker LLM Proxy Endpoint
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">
            Worker accepts POST {question} and returns {filters:[{field,op,value}], sort:{field,dir}}. Zero API keys stored on client.
          </div>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="nlquery-proxy-input" value="${config.LLM_PROXY_URL || ''}" placeholder="https://<worker-subdomain>.workers.dev" class="form-select font-mono text-xs" style="flex: 1; padding: 6px 10px;" />
            <button class="btn btn-primary btn-xs" id="btn-save-proxy-url">Save</button>
          </div>
        </div>

        <!-- Query Input Section -->
        <div class="results-card mb-6">
          <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
            <input type="text" id="nlquery-input" placeholder='Ask AICTE engine: e.g. "Colleges in Maharashtra above 90%", "Colleges exceeding NRI quota", "Show all anomalies"' class="form-select" style="flex: 1; min-width: 280px; padding: 10px 14px; font-size: 0.95rem;" />
            <button id="btn-nlquery-run" class="btn btn-primary" style="padding: 10px 20px;">
              Run Query
            </button>
          </div>

          <!-- Quick Suggestion Query Chips -->
          <div>
            <div class="text-xs font-semibold text-gov-navy uppercase tracking-wider mb-2">
              Quick Search Presets (Click to Execute):
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="nlquery-preset-chips">
              <button class="btn btn-outline btn-xs nl-chip" data-query="Colleges with utilization above 90%">
                🎯 Above 90% utilization
              </button>
              <button class="btn btn-danger btn-xs nl-chip" data-query="Colleges exceeding NRI quota">
                ⚠️ Colleges exceeding NRI quota
              </button>
              <button class="btn btn-warning btn-xs nl-chip" data-query="Show all detected anomalies">
                🚨 Show all detected anomalies
              </button>
              <button class="btn btn-outline btn-xs nl-chip" data-query="Colleges in Maharashtra">
                📍 Colleges in Maharashtra
              </button>
              <button class="btn btn-outline btn-xs nl-chip" data-query="Colleges in Karnataka above 80%">
                ⚡ Karnataka above 80%
              </button>
              <button class="btn btn-success btn-xs nl-chip" data-query="List all issued certificates">
                📜 Issued certificates
              </button>
            </div>
          </div>
        </div>

        <!-- Query Output Container -->
        <div id="nlquery-output-box" style="display: none;" class="results-card">
          <!-- Explanation Header -->
          <div class="alert alert-success" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <div class="font-mono" style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--gov-navy); letter-spacing: 0.5px;">Engine Interpretation</div>
              <div id="nlquery-explanation-text" style="font-size: 0.9rem; font-weight: 600; color: var(--text-main); margin-top: 2px;"></div>
            </div>
            <span id="nlquery-result-count" class="badge badge-primary font-mono font-bold"></span>
          </div>

          <!-- Dynamic Results Table -->
          <div class="table-responsive">
            <table class="data-table">
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

    // Proxy settings toggles
    const btnToggleSettings = document.getElementById('btn-toggle-proxy-settings');
    const settingsCard = document.getElementById('proxy-settings-card');
    const btnSaveProxy = document.getElementById('btn-save-proxy-url');
    const proxyInput = document.getElementById('nlquery-proxy-input');

    if (btnToggleSettings && settingsCard) {
      btnToggleSettings.addEventListener('click', () => {
        settingsCard.style.display = settingsCard.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (btnSaveProxy && proxyInput) {
      btnSaveProxy.addEventListener('click', () => {
        const val = proxyInput.value.trim();
        if (window.CONFIG && typeof window.CONFIG.save === 'function') {
          window.CONFIG.save({ LLM_PROXY_URL: val });
        } else if (window.CONFIG) {
          window.CONFIG.LLM_PROXY_URL = val;
        }
        alert('LLM Proxy URL updated: ' + (val || '(cleared)'));
        render();
      });
    }

    async function executeQuery(text) {
      if (!text || !text.trim()) return;

      btnRun.disabled = true;
      btnRun.textContent = 'Executing...';

      try {
        const result = await run(text);
        outputBox.style.display = 'block';

        // Render explanation with source label
        if (result.source === 'LLM') {
          expText.innerHTML = `<span class="badge badge-primary font-mono" style="margin-right: 6px;">LLM Filter</span> ${result.explanation}`;
        } else {
          expText.innerHTML = `<span class="badge badge-gov font-mono" style="margin-right: 6px;">Parsed locally</span> ${result.explanation.replace('Parsed locally: ', '')}`;
        }

        countBadge.textContent = `${result.rows.length} Result${result.rows.length === 1 ? '' : 's'}`;

        if (result.rows.length === 0) {
          thead.innerHTML = '';
          tbody.innerHTML = `<tr><td style="padding: 24px; text-align: center; color: var(--text-muted);">No matching records found for this query. Try one of the preset chips above.</td></tr>`;
        } else {
          // Dynamic columns based on row keys
          const headers = Object.keys(result.rows[0]);
          thead.innerHTML = `
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          `;

          tbody.innerHTML = result.rows.map(row => `
            <tr>
              ${headers.map(h => {
                const val = row[h];
                let cellContent = val;
                // Add badge styling for Compliance / Severity
                if (h === 'Compliance' || h === 'Severity') {
                  const isBad = String(val).includes('BREACH') || String(val).includes('HIGH') || String(val).includes('ALERT');
                  const isWarn = String(val).includes('CRITICAL') || String(val).includes('MED');
                  const badgeClass = isBad ? 'badge-danger' : isWarn ? 'badge-warning' : 'badge-success';
                  cellContent = `<span class="badge ${badgeClass}">${val}</span>`;
                }
                return `<td>${cellContent}</td>`;
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
    render,
    runLLM,
    runLocal,
    validateFilterItem,
    validateSort
  };

})();
