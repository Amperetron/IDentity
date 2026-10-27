/**
 * upload.js - Bulk Admissions Upload Module (CSV/XLSX) for AICTE-APAAR Platform
 * Shared Contract:
 * window.Upload = {
 *   init: function(),
 *   processFile: function(file),
 *   processCSVText: function(csvText)
 * }
 * 
 * Required Columns: apaarId, name, collegeId, isNRI, rollNo
 * Uses: PapaParse (CSV), SheetJS/xlsx (XLSX), Rules.checkAdmission, Ledger.addBlock
 */

(function () {
  'use strict';

  // Sample data stored in-memory for 1-click evaluation without network or file picker
  const CLEAN_SAMPLE_CSV = `apaarId,name,collegeId,isNRI,rollNo
987654320042,Avani Saxena,DL-IGDT-02,false,IGDT-2026-CS01
987654320043,Aditya Joshi,UP-IETL-02,false,IETL-2026-ME04
987654320044,Siya Singhania,TS-VCEH-02,false,VCEH-2026-EC02
987654320045,Samarth Malhotra,DL-DTUD-01,true,DTUD-2026-NRI01
987654320046,Anvi Choudhary,KA-RVCE-01,false,RVCE-2026-CS08
987654320047,Manish Choudhary,KA-BMSC-02,false,BMSC-2026-EE05`;

  const ERRORS_SAMPLE_CSV = `apaarId,name,collegeId,isNRI,rollNo
987654320001,Aarav Sharma,KA-RVCE-01,false,RVCE-ERR-01
999999999999,Fake Candidate,DL-DTUD-01,false,DTU-ERR-02
987654320048,Navya Kaushik,TN-TCEM-02,true,TCE-ERR-03
987654320049,Vivaan Chopra,MH-COEP-01,false,COEP-ERR-04
987654320050,Gauri Somani,TS-VCEH-02,false,
987654320051,,UP-IETL-02,false,IET-ERR-06
,Yashwant Das,DL-IGDT-02,false,IGDT-ERR-07
987654320052,Shreya Shinde,TS-VCEH-02,false,VCEH-BATCH-01
987654320052,Shreya Shinde,KA-BMSC-02,false,BMSC-BATCH-02`;

  let currentFilter = 'ALL'; // 'ALL', 'ADMITTED', 'REJECTED'
  let lastProcessedResults = [];

  function normalizeRowKeys(rawRow) {
    const row = {};
    for (const key of Object.keys(rawRow)) {
      const cleanKey = key.trim().toLowerCase();
      if (cleanKey === 'apaarid' || cleanKey === 'apaar_id' || cleanKey === 'apaar') {
        row.apaarId = String(rawRow[key] || '').trim();
      } else if (cleanKey === 'name' || cleanKey === 'studentname' || cleanKey === 'student_name') {
        row.name = String(rawRow[key] || '').trim();
      } else if (cleanKey === 'collegeid' || cleanKey === 'college_id' || cleanKey === 'college') {
        row.collegeId = String(rawRow[key] || '').trim();
      } else if (cleanKey === 'isnri' || cleanKey === 'is_nri' || cleanKey === 'nri') {
        row.isNRI = String(rawRow[key] !== undefined ? rawRow[key] : '').trim();
      } else if (cleanKey === 'rollno' || cleanKey === 'roll_no' || cleanKey === 'rollnumber') {
        row.rollNo = String(rawRow[key] || '').trim();
      } else {
        row[key] = rawRow[key];
      }
    }
    return row;
  }

  async function processParsedRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      alert("No data rows found in the uploaded file.");
      return;
    }

    const results = [];
    let admittedCount = 0;
    let rejectedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const row = normalizeRowKeys(rawRow);
      const rowNumber = i + 1; // 1-indexed data row

      // Required column presence check
      const missingFields = [];
      if (!row.apaarId) missingFields.push("apaarId");
      if (!row.name) missingFields.push("name");
      if (!row.collegeId) missingFields.push("collegeId");
      if (row.isNRI === undefined || row.isNRI === "") missingFields.push("isNRI");
      if (!row.rollNo) missingFields.push("rollNo");

      if (missingFields.length > 0) {
        rejectedCount++;
        results.push({
          rowNumber,
          apaarId: row.apaarId || "(empty)",
          name: row.name || "(empty)",
          collegeId: row.collegeId || "(empty)",
          isNRI: row.isNRI || "(empty)",
          rollNo: row.rollNo || "(empty)",
          status: "REJECTED",
          reason: `Missing required column value(s): ${missingFields.join(", ")}`
        });
        continue;
      }

      // Validate through Rules engine against Sandbox + Ledger state
      const check = window.Rules.checkAdmission({
        apaarId: row.apaarId,
        name: row.name,
        collegeId: row.collegeId,
        isNRI: row.isNRI,
        rollNo: row.rollNo
      });

      if (check.ok) {
        // Commit admission block to the simulated ledger
        const isNRIBool = window.Rules.isNRI(row.isNRI);
        const block = await window.Ledger.addBlock("ADMISSION", {
          apaarId: row.apaarId,
          name: row.name,
          collegeId: row.collegeId,
          isNRI: isNRIBool,
          rollNo: row.rollNo,
          admittedAt: new Date().toISOString()
        });

        admittedCount++;
        results.push({
          rowNumber,
          apaarId: row.apaarId,
          name: row.name,
          collegeId: row.collegeId,
          isNRI: isNRIBool ? "Yes" : "No",
          rollNo: row.rollNo,
          status: "ADMITTED",
          blockIndex: block.index,
          hash: block.hash,
          reason: `Admitted on Ledger (Block #${block.index}, Hash: ${block.hash.substring(0, 10)}...)`
        });
      } else {
        rejectedCount++;
        results.push({
          rowNumber,
          apaarId: row.apaarId,
          name: row.name,
          collegeId: row.collegeId,
          isNRI: window.Rules.isNRI(row.isNRI) ? "Yes" : "No",
          rollNo: row.rollNo,
          status: "REJECTED",
          reason: check.reason
        });
      }
    }

    lastProcessedResults = results;
    renderResults(results, admittedCount, rejectedCount);

    // Notify any listening components
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('admissions:uploaded', {
        detail: { total: rows.length, admitted: admittedCount, rejected: rejectedCount }
      }));
    }
  }

  function renderResults(results, admittedCount, rejectedCount) {
    const container = document.getElementById('upload-results-container');
    if (!container) return;

    const filtered = results.filter(r => {
      if (currentFilter === 'ADMITTED') return r.status === 'ADMITTED';
      if (currentFilter === 'REJECTED') return r.status === 'REJECTED';
      return true;
    });

    const html = `
      <div class="results-card mt-6">
        <div class="results-header">
          <div class="results-title-group">
            <h3 class="text-xl font-bold text-gov-navy">Batch Ingestion Results</h3>
            <p class="text-sm text-gov-muted">Evaluation completed using AICTE Anti-Hoarding Rules and Simulated SHA-256 Ledger</p>
          </div>
          <div class="results-badges">
            <span class="metric-pill metric-pill-total">Total: ${results.length}</span>
            <span class="metric-pill metric-pill-success">✓ Admitted: ${admittedCount}</span>
            <span class="metric-pill metric-pill-error">✕ Rejected: ${rejectedCount}</span>
          </div>
        </div>

        <div class="filter-toolbar mt-4">
          <span class="text-xs font-semibold uppercase text-gov-muted">Filter Rows:</span>
          <div class="btn-group">
            <button class="btn btn-sm ${currentFilter === 'ALL' ? 'btn-primary' : 'btn-outline'}" id="btn-filter-all">All (${results.length})</button>
            <button class="btn btn-sm ${currentFilter === 'ADMITTED' ? 'btn-success' : 'btn-outline'}" id="btn-filter-admitted">Admitted (${admittedCount})</button>
            <button class="btn btn-sm ${currentFilter === 'REJECTED' ? 'btn-danger' : 'btn-outline'}" id="btn-filter-rejected">Errors (${rejectedCount})</button>
          </div>
        </div>

        <div class="table-responsive mt-4">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px;">Row</th>
                <th>APAAR ID</th>
                <th>Candidate Name</th>
                <th>College ID</th>
                <th style="width: 60px;">NRI</th>
                <th>Roll No</th>
                <th style="width: 100px;">Status</th>
                <th>Validation / Ledger Details</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr><td colspan="8" class="text-center py-6 text-gov-muted">No records match the selected filter.</td></tr>
              ` : filtered.map(r => `
                <tr class="${r.status === 'ADMITTED' ? 'row-admitted' : 'row-rejected'}">
                  <td class="font-mono font-bold">${r.rowNumber}</td>
                  <td class="font-mono text-xs font-semibold">${escapeHtml(r.apaarId)}</td>
                  <td>${escapeHtml(r.name)}</td>
                  <td><span class="badge badge-light font-mono">${escapeHtml(r.collegeId)}</span></td>
                  <td>${r.isNRI === 'Yes' || r.isNRI === 'true' ? '<span class="badge badge-warning">NRI</span>' : 'No'}</td>
                  <td class="font-mono text-xs">${escapeHtml(r.rollNo)}</td>
                  <td>
                    ${r.status === 'ADMITTED' 
                      ? '<span class="badge badge-success">ADMITTED</span>' 
                      : '<span class="badge badge-danger">REJECTED</span>'}
                  </td>
                  <td class="text-xs ${r.status === 'ADMITTED' ? 'text-green-700 font-mono' : 'text-red-700 font-medium'}">
                    ${escapeHtml(r.reason)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach filter listeners
    const btnAll = document.getElementById('btn-filter-all');
    const btnAdm = document.getElementById('btn-filter-admitted');
    const btnRej = document.getElementById('btn-filter-rejected');

    if (btnAll) btnAll.addEventListener('click', () => { currentFilter = 'ALL'; renderResults(results, admittedCount, rejectedCount); });
    if (btnAdm) btnAdm.addEventListener('click', () => { currentFilter = 'ADMITTED'; renderResults(results, admittedCount, rejectedCount); });
    if (btnRej) btnRej.addEventListener('click', () => { currentFilter = 'REJECTED'; renderResults(results, admittedCount, rejectedCount); });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function handleCSVText(csvText) {
    if (!window.Papa) {
      alert("PapaParse library not loaded. Please verify internet connectivity.");
      return;
    }
    const parsed = window.Papa.parse(csvText.trim(), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    if (parsed.errors && parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
      alert("Failed to parse CSV: " + parsed.errors[0].message);
      return;
    }

    processParsedRows(parsed.data);
  }

  function handleFile(file) {
    if (!file) return;
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = function (e) {
        handleCSVText(e.target.result);
      };
      reader.readAsText(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      if (!window.XLSX) {
        alert("SheetJS (xlsx) library not loaded. Please verify internet connectivity.");
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
          processParsedRows(rows);
        } catch (err) {
          alert("Error parsing Excel workbook: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.");
    }
  }

  const Upload = {
    init() {
      const container = document.getElementById('tab-upload');
      if (!container) return;

      container.innerHTML = `
        <div class="gov-card">
          <div class="gov-card-header">
            <div>
              <h2 class="gov-card-title">Bulk Student Admissions Ingestion</h2>
              <p class="gov-card-subtitle">
                Official institutional roster intake interface. Verifies each candidate against the 
                <strong>Sandbox APAAR Registry</strong>, prevents <strong>Seat Hoarding</strong>, and checks 
                <strong>College Intakes &amp; NRI Quotas</strong> before appending to the <strong>Simulated Permissioned Ledger</strong>.
              </p>
            </div>
            <div class="header-action-pills">
              <span class="badge badge-gov">Sandbox Adapter</span>
              <span class="badge badge-info">Multi-Format (CSV / Excel)</span>
            </div>
          </div>

          <!-- Quick Evaluation Buttons & Sample Downloads -->
          <div class="demo-samples-banner">
            <div class="demo-samples-text">
              <span class="font-bold text-gov-navy">AICTE Evaluator Fast-Track:</span>
              <span>Test the automated policy &amp; anti-fraud validation with pre-loaded demo batches.</span>
            </div>
            <div class="demo-samples-actions">
              <button class="btn btn-primary btn-sm" id="btn-load-clean">
                ⚡ Load Clean Batch (clean.csv)
              </button>
              <button class="btn btn-warning btn-sm" id="btn-load-errors">
                ⚠️ Load Error Batch (errors.csv)
              </button>
              <a href="samples/clean.csv" download="clean.csv" class="btn btn-outline btn-sm">
                ⬇ clean.csv
              </a>
              <a href="samples/errors.csv" download="errors.csv" class="btn btn-outline btn-sm">
                ⬇ errors.csv
              </a>
            </div>
          </div>

          <!-- Required Schema Specs -->
          <div class="schema-guideline mt-4">
            <span class="font-semibold text-xs text-gov-navy uppercase tracking-wider">Required Column Schema:</span>
            <div class="schema-tags">
              <code class="schema-tag">apaarId (12-digit)</code>
              <code class="schema-tag">name (Candidate Full Name)</code>
              <code class="schema-tag">collegeId (e.g. MH-COEP-01)</code>
              <code class="schema-tag">isNRI (true / false)</code>
              <code class="schema-tag">rollNo (Institutional Roll No)</code>
            </div>
          </div>

          <!-- Drag and Drop Dropzone -->
          <div class="upload-dropzone mt-4" id="upload-dropzone">
            <input type="file" id="file-input" accept=".csv, .xlsx, .xls" class="file-input-hidden" />
            <div class="dropzone-content">
              <svg class="dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h4 class="text-base font-semibold text-gov-navy">Drag &amp; Drop CSV or Excel file here</h4>
              <p class="text-xs text-gov-muted mt-1">Supports .csv, .xlsx, and .xls files</p>
              <button class="btn btn-outline btn-sm mt-3" type="button" id="btn-browse-file">
                Browse Files on Device
              </button>
            </div>
          </div>

          <!-- Collapsible Manual CSV Paste -->
          <details class="paste-details mt-4">
            <summary class="paste-summary font-semibold text-xs text-gov-navy cursor-pointer">
              ✏️ Or paste CSV text directly into text field
            </summary>
            <div class="paste-body mt-2">
              <textarea id="csv-paste-area" class="code-textarea" rows="5" placeholder="apaarId,name,collegeId,isNRI,rollNo&#10;987654320042,Avani Saxena,DL-IGDT-02,false,IGDT-2026-CS01"></textarea>
              <div class="mt-2 text-right">
                <button class="btn btn-secondary btn-sm" id="btn-process-pasted">Process Pasted CSV</button>
              </div>
            </div>
          </details>

          <!-- Dynamic Results Container -->
          <div id="upload-results-container"></div>
        </div>
      `;

      // Event Listeners
      const dropzone = document.getElementById('upload-dropzone');
      const fileInput = document.getElementById('file-input');
      const btnBrowse = document.getElementById('btn-browse-file');
      const btnClean = document.getElementById('btn-load-clean');
      const btnErrors = document.getElementById('btn-load-errors');
      const btnPasted = document.getElementById('btn-process-pasted');
      const pasteArea = document.getElementById('csv-paste-area');

      if (btnBrowse && fileInput) {
        btnBrowse.addEventListener('click', () => fileInput.click());
      }

      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
        });
      }

      if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('dropzone-active');
        });

        dropzone.addEventListener('dragleave', () => {
          dropzone.classList.remove('dropzone-active');
        });

        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('dropzone-active');
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
          }
        });
      }

      if (btnClean) {
        btnClean.addEventListener('click', () => {
          handleCSVText(CLEAN_SAMPLE_CSV);
        });
      }

      if (btnErrors) {
        btnErrors.addEventListener('click', () => {
          handleCSVText(ERRORS_SAMPLE_CSV);
        });
      }

      if (btnPasted && pasteArea) {
        btnPasted.addEventListener('click', () => {
          const text = pasteArea.value.trim();
          if (!text) {
            alert("Please paste CSV data into the text box.");
            return;
          }
          handleCSVText(text);
        });
      }
    },

    processCSVText: handleCSVText,
    processFile: handleFile
  };

  window.Upload = Upload;
})();
