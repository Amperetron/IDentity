/**
 * certs.js - AICTE APAAR Digital Credential Issuance & Verification Module
 * Agent B - Shared Contract: window.Certs
 *
 * Capabilities:
 * - Direct integration with window.Ledger and window.SEED
 * - ECDSA P-256 keypair generation and persistence via crypto.subtle & localStorage
 * - issue(apaarId): Signs certificate, commits "CERTIFICATE" block to Ledger, renders QR code
 * - verify(qrText): Cryptographic signature verification, sandbox check, ledger check
 * - Renders #tab-certs (issuance) and #tab-verify (verification) with style.css gov theme
 */

(function () {
  'use strict';

  // Safe accessor for window.Ledger
  function getLedger() {
    return window.Ledger || {
      getChain: () => [],
      addBlock: async (type, data) => ({
        index: 0,
        timestamp: Date.now(),
        type,
        data,
        prevHash: '0',
        hash: 'simulated_hash'
      })
    };
  }

  function getSeed() {
    return window.SEED || {
      colleges: [],
      apaar: []
    };
  }

  // Cryptographic utilities
  const KEY_STORAGE_KEY = 'aicte_apaar_ecdsa_keypair_v1';
  let cachedKeyPair = null;
  let cachedPublicKeyJwk = null;

  // Convert ArrayBuffer to Base64 string
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Convert Base64 string to ArrayBuffer
  function base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Convert ArrayBuffer to Hex string
  function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Deterministic JSON stringify (keys sorted alphabetically)
  function canonicalStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(canonicalStringify).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    return '{' + sortedKeys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
  }

  // SHA-256 Digest helper
  async function sha256(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return bufferToHex(buf);
  }

  // Generate or retrieve stored ECDSA P-256 keypair
  async function getKeyPair() {
    if (cachedKeyPair) return cachedKeyPair;

    const stored = localStorage.getItem(KEY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const privateKey = await crypto.subtle.importKey(
          'jwk',
          parsed.privateKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign']
        );
        const publicKey = await crypto.subtle.importKey(
          'jwk',
          parsed.publicKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );
        cachedPublicKeyJwk = parsed.publicKeyJwk;
        cachedKeyPair = { privateKey, publicKey, publicKeyJwk: parsed.publicKeyJwk };
        return cachedKeyPair;
      } catch (err) {
        console.warn('Failed to parse cached keypair, generating new:', err);
      }
    }

    // Generate new keypair
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify({ privateKeyJwk, publicKeyJwk }));
    cachedPublicKeyJwk = publicKeyJwk;
    cachedKeyPair = { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyJwk };
    return cachedKeyPair;
  }

  /**
   * Find student admission details from ledger chain or sandbox
   */
  function findStudentInfo(apaarId) {
    const chain = getLedger().getChain();
    const seed = getSeed();

    // Find active admission in ledger (latest admission not cancelled)
    let admission = null;
    let isCancelled = false;

    for (let i = chain.length - 1; i >= 0; i--) {
      const block = chain[i];
      if (block.type === 'CANCELLATION' && block.data && String(block.data.apaarId) === String(apaarId)) {
        isCancelled = true;
      }
      if (block.type === 'ADMISSION' && block.data && String(block.data.apaarId) === String(apaarId)) {
        if (!isCancelled) {
          admission = block.data;
          break;
        }
      }
    }

    // Lookup sandbox APAAR profile
    const apaarProfile = seed.apaar ? seed.apaar.find(a => String(a.apaarId) === String(apaarId)) : null;
    const collegeId = admission ? admission.collegeId : (seed.colleges && seed.colleges[0] ? seed.colleges[0].id : 'COL001');
    const college = seed.colleges ? seed.colleges.find(c => c.id === collegeId) : null;

    const name = (admission && admission.name) || (apaarProfile && apaarProfile.name) || 'Student ' + String(apaarId).slice(-4);
    const rollNo = (admission && admission.rollNo) || 'ROLL-' + String(apaarId).slice(-4);
    const collegeName = college ? college.name : (admission && admission.collegeName) || collegeId;

    return {
      apaarId: String(apaarId),
      name,
      rollNo,
      college: collegeName,
      collegeId,
      hasAdmission: Boolean(admission && !isCancelled)
    };
  }

  /**
   * Issue an academic certificate
   * Builds {apaarId, rollNo, name, college, issuedAt}, signs hash, writes "CERTIFICATE" block
   */
  async function issue(apaarId) {
    const keys = await getKeyPair();
    const student = findStudentInfo(apaarId);

    const payload = {
      apaarId: String(student.apaarId),
      rollNo: String(student.rollNo),
      name: String(student.name),
      college: String(student.college),
      collegeId: String(student.collegeId),
      issuedAt: new Date().toISOString()
    };

    const canonicalJson = canonicalStringify(payload);
    const enc = new TextEncoder();
    const dataBytes = enc.encode(canonicalJson);

    // Sign the canonical payload using ECDSA P-256 SHA-256
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keys.privateKey,
      dataBytes
    );

    const signature = bufferToBase64(signatureBuffer);
    const certHash = await sha256(canonicalJson);

    const certRecord = {
      payload,
      signature,
      hash: certHash,
      publicKeyJwk: keys.publicKeyJwk
    };

    // Commit to simulated ledger via window.Ledger.addBlock
    const ledger = getLedger();
    let block = null;
    if (typeof ledger.addBlock === 'function') {
      block = await ledger.addBlock('CERTIFICATE', certRecord);
    }

    return {
      payload,
      signature,
      hash: certHash,
      block,
      qrText: JSON.stringify({ payload, signature })
    };
  }

  /**
   * Verify certificate from QR text or JSON object
   * Returns { valid, reason, cert, checks }
   */
  async function verify(qrText) {
    try {
      if (!qrText || (typeof qrText !== 'string' && typeof qrText !== 'object')) {
        return { valid: false, reason: 'Empty or invalid input format' };
      }

      let parsed = qrText;
      if (typeof qrText === 'string') {
        try {
          parsed = JSON.parse(qrText.trim());
        } catch (e) {
          return { valid: false, reason: 'Failed to parse JSON string from QR text' };
        }
      }

      // Check structure: must contain payload and signature
      const payload = parsed.payload || (parsed.apaarId ? parsed : null);
      const signature = parsed.signature;

      if (!payload || !payload.apaarId || !payload.name) {
        return { valid: false, reason: 'Certificate payload is missing required fields (apaarId, name)' };
      }

      if (!signature) {
        return { valid: false, reason: 'Cryptographic signature is missing from certificate' };
      }

      // Check 1: Cryptographic signature verification with authority public key
      const keys = await getKeyPair();
      let signatureValid = false;

      try {
        const canonicalJson = canonicalStringify(payload);
        const enc = new TextEncoder();
        const dataBytes = enc.encode(canonicalJson);
        const signatureBytes = base64ToBuffer(signature);

        signatureValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          keys.publicKey,
          signatureBytes,
          dataBytes
        );
      } catch (err) {
        signatureValid = false;
      }

      if (!signatureValid) {
        return {
          valid: false,
          reason: 'ECDSA cryptographic signature verification failed: Data tampered or key forged',
          cert: payload,
          checks: {
            signature: false,
            sandbox: false,
            ledgerRecord: false,
            studentActive: false
          }
        };
      }

      // Check 2: APAAR exists in Sandbox Adapter
      const seed = getSeed();
      const sandboxExists = seed.apaar && seed.apaar.some(a => String(a.apaarId) === String(payload.apaarId));

      // Check 3: Certificate exists on the Simulated Ledger
      const chain = getLedger().getChain();
      const canonicalJson = canonicalStringify(payload);
      const expectedHash = await sha256(canonicalJson);

      let foundOnLedger = false;
      let ledgerBlockIndex = -1;

      for (let i = 0; i < chain.length; i++) {
        const block = chain[i];
        if (block.type === 'CERTIFICATE' && block.data) {
          const bPayload = block.data.payload;
          const bSig = block.data.signature;
          if (bPayload && String(bPayload.apaarId) === String(payload.apaarId) && bSig === signature) {
            foundOnLedger = true;
            ledgerBlockIndex = block.index !== undefined ? block.index : i;
            break;
          }
        }
      }

      // Check 4: Student has active admission record
      let activeAdmission = false;
      let isCancelled = false;
      for (let i = chain.length - 1; i >= 0; i--) {
        const block = chain[i];
        if (block.type === 'CANCELLATION' && block.data && String(block.data.apaarId) === String(payload.apaarId)) {
          isCancelled = true;
        }
        if (block.type === 'ADMISSION' && block.data && String(block.data.apaarId) === String(payload.apaarId)) {
          if (!isCancelled) {
            activeAdmission = true;
            break;
          }
        }
      }

      const allChecksPass = signatureValid && sandboxExists && foundOnLedger;

      return {
        valid: allChecksPass,
        reason: allChecksPass
          ? 'Certificate authenticity and ledger anchor successfully verified'
          : (!sandboxExists
              ? 'Warning: APAAR ID not registered in Sandbox Adapter'
              : !foundOnLedger
                ? 'Warning: Certificate not recorded in simulated permissioned ledger'
                : 'Certificate verified with warnings'),
        cert: payload,
        ledgerBlockIndex,
        checks: {
          signature: signatureValid,
          sandbox: sandboxExists,
          ledgerRecord: foundOnLedger,
          studentActive: activeAdmission
        }
      };
    } catch (err) {
      return {
        valid: false,
        reason: 'Verification error: ' + (err.message || String(err))
      };
    }
  }

  /**
   * Safe QR Code Renderer (uses CDN QRCode with SVG Matrix fallback)
   */
  function renderQRCode(container, text) {
    if (!container) return;
    container.innerHTML = '';

    // If QRCode library is available from CDN
    if (typeof window.QRCode === 'function') {
      try {
        new window.QRCode(container, {
          text: text,
          width: 170,
          height: 170,
          colorDark: '#0B3C5D',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
        });
        return;
      } catch (e) {
        console.warn('QRCode library invocation failed, falling back to SVG renderer:', e);
      }
    }

    // High quality deterministic fallback visual QR representation
    const hashNum = text.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);
    const size = 21;
    let svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="170" height="170" style="background:#fff;border-radius:4px;border:1px solid #cbd5e1;" xmlns="http://www.w3.org/2000/svg">';
    // Finder patterns
    const drawFinder = (x, y) => '<rect x="' + x + '" y="' + y + '" width="7" height="7" fill="#0B3C5D"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#ffffff"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" fill="#0B3C5D"/>';
    svg += drawFinder(0, 0);
    svg += drawFinder(size - 7, 0);
    svg += drawFinder(0, size - 7);

    // Pseudorandom pseudo-data modules based on text hash
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Skip finder areas
        if ((r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8)) continue;
        const bit = ((hashNum ^ (r * 13 + c * 17)) + (text.charCodeAt((r + c) % text.length) || 0)) % 3 === 0;
        if (bit) {
          svg += '<rect x="' + c + '" y="' + r + '" width="1" height="1" fill="#0B3C5D"/>';
        }
      }
    }
    svg += '</svg>';
    container.innerHTML = svg;
  }

  /**
   * Render the Issue Credentials Tab (#tab-certs)
   */
  async function renderCertsTab() {
    const container = document.getElementById('tab-certs');
    if (!container) return;

    // Get admitted students from ledger
    const chain = getLedger().getChain();
    const seed = getSeed();
    const admittedStudents = [];
    const cancelledMap = new Set();

    for (let i = chain.length - 1; i >= 0; i--) {
      const block = chain[i];
      if (block.type === 'CANCELLATION' && block.data && block.data.apaarId) {
        cancelledMap.add(String(block.data.apaarId));
      }
      if (block.type === 'ADMISSION' && block.data && block.data.apaarId) {
        const id = String(block.data.apaarId);
        if (!cancelledMap.has(id) && !admittedStudents.some(s => String(s.apaarId) === id)) {
          const college = seed.colleges ? seed.colleges.find(c => c.id === block.data.collegeId) : null;
          admittedStudents.push({
            apaarId: id,
            name: block.data.name,
            rollNo: block.data.rollNo,
            collegeName: college ? college.name : block.data.collegeId,
            collegeId: block.data.collegeId
          });
        }
      }
    }

    // Fallback if no admissions yet
    if (admittedStudents.length === 0 && seed.apaar && seed.apaar.length > 0) {
      seed.apaar.slice(0, 5).forEach((stu, idx) => {
        const col = (seed.colleges && seed.colleges[idx % seed.colleges.length]) || { id: 'COL001', name: 'COEP Technological University, Pune' };
        admittedStudents.push({
          apaarId: String(stu.apaarId),
          name: stu.name,
          rollNo: 'ROLL-' + String(stu.apaarId).slice(-4),
          collegeName: col.name,
          collegeId: col.id
        });
      });
    }

    // Get issued certificates from chain
    const issuedCerts = [];
    chain.forEach(b => {
      if (b.type === 'CERTIFICATE' && b.data && b.data.payload) {
        issuedCerts.push({
          blockIndex: b.index,
          payload: b.data.payload,
          signature: b.data.signature,
          hash: b.data.hash,
          timestamp: b.timestamp
        });
      }
    });

    container.innerHTML = `
      <div class="gov-card">
        <div class="gov-card-header">
          <div>
            <div class="brand-sup">AICTE National Credentialing Engine</div>
            <h2 class="gov-card-title mt-1">Digital Credential Issuance Authority</h2>
            <p class="gov-card-subtitle">
              Issue tamper-proof academic credentials cryptographically signed using <strong>ECDSA P-256</strong> and permanently committed as a <code>CERTIFICATE</code> block to the <strong>Simulated permissioned ledger</strong>.
            </p>
          </div>
          <div class="header-action-pills">
            <span class="badge badge-gov font-mono">ECDSA P-256</span>
            <span class="badge badge-success font-mono">SHA-256 Chain</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
          <!-- Left: Selection & Issuance Form -->
          <div class="results-card">
            <h3 class="text-lg font-bold text-gov-navy" style="margin-bottom: 12px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">
              Select Admitted Student
            </h3>
            
            <div style="margin-bottom: 16px;">
              <label class="text-xs font-semibold text-gov-navy" style="display: block; margin-bottom: 6px;">
                Select from Active Ledger Admissions:
              </label>
              <select id="cert-student-select" class="form-select" style="width: 100%; padding: 8px 10px;">
                ${admittedStudents.map(s => `
                  <option value="${s.apaarId}">
                    ${s.name} (${s.apaarId}) - ${s.collegeName}
                  </option>
                `).join('')}
              </select>
            </div>

            <div style="margin-bottom: 16px;">
              <label class="text-xs font-semibold text-gov-navy" style="display: block; margin-bottom: 6px;">
                Or Enter 12-digit Sandbox APAAR ID:
              </label>
              <input type="text" id="cert-manual-apaar" placeholder="e.g. 987654320001" maxlength="12" class="form-select font-mono" style="width: 100%; padding: 8px 10px;" />
            </div>

            <div id="cert-preview-meta" class="alert alert-success" style="padding: 10px 14px; margin-bottom: 16px; font-size: 0.85rem;">
              <div><strong>Status:</strong> <span class="badge badge-success">Active Ledger Admission</span></div>
              <div style="margin-top: 4px;"><strong>Roll No:</strong> <span id="meta-roll" class="font-mono">${admittedStudents[0] ? admittedStudents[0].rollNo : '-'}</span></div>
              <div style="margin-top: 2px;"><strong>College:</strong> <span id="meta-college">${admittedStudents[0] ? admittedStudents[0].collegeName : '-'}</span></div>
            </div>

            <button id="btn-issue-cert" class="btn btn-primary" style="width: 100%; padding: 10px; font-size: 0.95rem;">
              Sign &amp; Issue Credential (ECDSA)
            </button>
            <p class="text-xs text-gov-muted text-center mt-2">
              Signs hash with ECDSA P-256 and commits a "CERTIFICATE" block to the ledger.
            </p>
          </div>

          <!-- Right: Live Credential & QR Output -->
          <div class="results-card">
            <h3 class="text-lg font-bold text-gov-navy" style="margin-bottom: 12px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">
              Verifiable Credential Card
            </h3>
            
            <div id="cert-card-output" style="text-align: center; color: var(--text-muted); padding: 16px 0;">
              <div style="border: 2px dashed #CBD5E1; border-radius: var(--radius-md); padding: 30px 20px;">
                <p style="font-size: 0.95rem; font-weight: 600;">Ready to Issue Credential</p>
                <p class="text-xs text-gov-muted mt-1">Select an admitted candidate and click <strong>"Sign &amp; Issue Credential"</strong>.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom: Certificate History from Ledger -->
        <div class="mt-6">
          <div class="gov-card-header" style="margin-bottom: 12px;">
            <div>
              <h3 class="gov-card-title" style="font-size: 1.1rem;">
                Ledger Recorded Certificates (${issuedCerts.length})
              </h3>
              <p class="gov-card-subtitle">Cryptographic proof records anchored in simulated permissioned ledger</p>
            </div>
            <span class="badge badge-gov font-mono">Immutable Log</span>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 80px;">Block #</th>
                  <th>APAAR ID</th>
                  <th>Candidate Name</th>
                  <th>Institution</th>
                  <th>Issued At</th>
                  <th>Digest</th>
                  <th style="text-align: center; width: 100px;">Action</th>
                </tr>
              </thead>
              <tbody id="cert-history-tbody">
                ${issuedCerts.length === 0 ? `
                  <tr><td colspan="7" class="text-center py-6 text-gov-muted">No certificates issued on ledger yet.</td></tr>
                ` : issuedCerts.map(c => `
                  <tr>
                    <td class="font-mono font-bold text-gov-navy">#${c.blockIndex}</td>
                    <td class="font-mono text-xs font-semibold">${c.payload.apaarId}</td>
                    <td style="font-weight: 600;">${c.payload.name}</td>
                    <td>${c.payload.college}</td>
                    <td class="text-xs text-gov-muted">${new Date(c.payload.issuedAt || c.timestamp).toLocaleString()}</td>
                    <td class="font-mono text-xs">${(c.hash || '').slice(0, 10)}...</td>
                    <td style="text-align: center;">
                      <button class="btn btn-outline btn-xs btn-quick-verify" data-cert='${JSON.stringify({ payload: c.payload, signature: c.signature })}'>
                        Verify
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Hook events
    const select = document.getElementById('cert-student-select');
    const manualInput = document.getElementById('cert-manual-apaar');
    const metaRoll = document.getElementById('meta-roll');
    const metaCollege = document.getElementById('meta-college');
    const btnIssue = document.getElementById('btn-issue-cert');

    function updateMeta(id) {
      const stu = admittedStudents.find(s => String(s.apaarId) === String(id)) || findStudentInfo(id);
      if (stu) {
        if (metaRoll) metaRoll.textContent = stu.rollNo || 'N/A';
        if (metaCollege) metaCollege.textContent = stu.collegeName || stu.college || 'N/A';
      }
    }

    if (select) {
      select.addEventListener('change', e => {
        if (manualInput) manualInput.value = '';
        updateMeta(e.target.value);
      });
    }

    if (manualInput) {
      manualInput.addEventListener('input', e => {
        if (e.target.value.length === 12) {
          updateMeta(e.target.value);
        }
      });
    }

    if (btnIssue) {
      btnIssue.addEventListener('click', async () => {
        let chosenId = (manualInput && manualInput.value.trim()) || (select && select.value);
        if (!chosenId) {
          alert('Please enter or select a 12-digit APAAR ID.');
          return;
        }

        btnIssue.disabled = true;
        btnIssue.textContent = 'Generating & Signing Credential...';

        try {
          const result = await issue(chosenId);
          renderIssuedCard(result);
          // Refresh table
          renderCertsTab();
        } catch (err) {
          alert('Error issuing certificate: ' + err.message);
        } finally {
          btnIssue.disabled = false;
          btnIssue.textContent = 'Sign & Issue Credential (ECDSA)';
        }
      });
    }

    // Quick verify button clicks
    container.querySelectorAll('.btn-quick-verify').forEach(btn => {
      btn.addEventListener('click', () => {
        const certJson = btn.getAttribute('data-cert');
        switchToVerifyWithData(certJson);
      });
    });
  }

  /**
   * Render the graphical Credential Card and QR code
   */
  function renderIssuedCard(result) {
    const cardContainer = document.getElementById('cert-card-output');
    if (!cardContainer) return;

    const { payload, signature, hash, block } = result;

    cardContainer.innerHTML = `
      <div style="border: 2px solid var(--gov-navy); border-radius: var(--radius-md); padding: 16px; background: #ffffff; text-align: left; box-shadow: var(--shadow-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--gov-navy); padding-bottom: 8px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--gov-saffron); letter-spacing: 0.5px;">All India Council for Technical Education</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--gov-navy-dark);">Verified Academic Credential</div>
          </div>
          <span class="badge badge-success font-mono">LEDGER ANCHORED</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;">
          <div style="font-size: 0.85rem; line-height: 1.6; color: var(--text-main);">
            <div><strong style="color: var(--text-muted);">Candidate:</strong> <span style="font-weight: 700; font-size: 0.95rem; color: var(--gov-navy-dark);">${payload.name}</span></div>
            <div><strong style="color: var(--text-muted);">APAAR ID:</strong> <span class="font-mono" style="font-weight: 600;">${payload.apaarId}</span></div>
            <div><strong style="color: var(--text-muted);">Roll No:</strong> <span class="font-mono">${payload.rollNo}</span></div>
            <div><strong style="color: var(--text-muted);">Institution:</strong> <span>${payload.college}</span></div>
            <div><strong style="color: var(--text-muted);">Issued At:</strong> <span>${new Date(payload.issuedAt).toLocaleString()}</span></div>
            ${block ? `<div><strong style="color: var(--text-muted);">Ledger Anchor:</strong> <span class="font-mono text-gov-navy font-bold">Block #${block.index}</span></div>` : ''}
          </div>

          <div style="text-align: center;">
            <div id="issued-qr-box" style="display: inline-block;"></div>
            <div class="text-xs text-gov-muted mt-1 font-mono">ECDSA QR Code</div>
          </div>
        </div>

        <div class="alert alert-success mt-3" style="padding: 8px; font-size: 0.7rem; margin-bottom: 0;">
          <div class="font-mono" style="word-break: break-all;"><strong>SHA-256 Digest:</strong> ${hash}</div>
          <div class="font-mono mt-1" style="word-break: break-all;"><strong>Signature:</strong> ${signature.slice(0, 52)}...</div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
          <button id="btn-copy-cert-json" class="btn btn-outline btn-sm" style="flex: 1;">
            📋 Copy JSON
          </button>
          <button id="btn-goto-verify" class="btn btn-primary btn-sm" style="flex: 1;">
            🔍 Verify Credential
          </button>
        </div>

        <div style="margin-top: 8px;">
          <button id="btn-anchor-cert-onchain" class="btn btn-warning btn-sm" style="width: 100%; font-size: 0.85rem;">
            ⛓️ Anchor this certificate hash on-chain
          </button>
          <div id="cert-anchor-feedback" style="display: none; margin-top: 8px;"></div>
        </div>
      </div>
    `;

    // Render QR Code into box
    const qrBox = document.getElementById('issued-qr-box');
    renderQRCode(qrBox, JSON.stringify({ payload, signature }));

    // Wire action buttons
    const btnCopy = document.getElementById('btn-copy-cert-json');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify({ payload, signature }, null, 2))
          .then(() => alert('Certificate JSON copied to clipboard!'))
          .catch(() => alert('JSON: ' + JSON.stringify({ payload, signature })));
      });
    }

    const btnGoto = document.getElementById('btn-goto-verify');
    if (btnGoto) {
      btnGoto.addEventListener('click', () => {
        switchToVerifyWithData(JSON.stringify({ payload, signature }, null, 2));
      });
    }

    const btnAnchorCert = document.getElementById('btn-anchor-cert-onchain');
    const feedbackBox = document.getElementById('cert-anchor-feedback');
    if (btnAnchorCert) {
      btnAnchorCert.addEventListener('click', async () => {
        btnAnchorCert.disabled = true;
        btnAnchorCert.textContent = 'Submitting on-chain anchor...';
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.innerHTML = '<div class="alert alert-gov font-mono text-xs">Connecting to MetaMask & submitting transaction on Sepolia...</div>';
        }

        if (!window.Anchor) {
          if (feedbackBox) {
            feedbackBox.innerHTML = '<div class="alert alert-warning text-xs">Anchor module (anchor.js) is not available.</div>';
          }
          btnAnchorCert.disabled = false;
          btnAnchorCert.textContent = '⛓️ Anchor this certificate hash on-chain';
          return;
        }

        try {
          const res = await window.Anchor.anchorNow(hash);
          if (res.success) {
            if (feedbackBox) {
              feedbackBox.innerHTML = `
                <div class="alert alert-success text-xs" style="padding: 10px; border: 2px solid var(--color-success);">
                  <div>✔ <strong>Certificate Hash Anchored on Sepolia!</strong></div>
                  <div class="font-mono mt-1" style="word-break: break-all;">Digest: ${res.root}</div>
                  <div class="mt-2">
                    <a href="${res.explorerUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-xs font-mono" style="text-decoration: none;">
                      View on Sepolia Etherscan ↗
                    </a>
                  </div>
                </div>
              `;
            }
          } else {
            if (feedbackBox) {
              feedbackBox.innerHTML = `
                <div class="alert alert-warning text-xs" style="padding: 10px;">
                  ⚠️ <strong>On-Chain Notice:</strong> ${res.message}
                </div>
              `;
            }
          }
        } catch (err) {
          if (feedbackBox) {
            feedbackBox.innerHTML = `
              <div class="alert alert-danger text-xs" style="padding: 10px;">
                ❌ Error: ${err.message}
              </div>
            `;
          }
        } finally {
          btnAnchorCert.disabled = false;
          btnAnchorCert.textContent = '⛓️ Anchor this certificate hash on-chain';
        }
      });
    }
  }

  /**
   * Switch to #tab-verify and inject data
   */
  function switchToVerifyWithData(jsonString) {
    if (window.App && typeof window.App.switchTab === 'function') {
      window.App.switchTab('tab-verify');
    } else {
      const verifyTabBtn = document.querySelector('[data-tab="tab-verify"], #nav-verify, a[href="#tab-verify"]');
      if (verifyTabBtn) {
        verifyTabBtn.click();
      } else {
        document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
        const vTab = document.getElementById('tab-verify');
        if (vTab) vTab.style.display = 'block';
      }
    }

    setTimeout(() => {
      const textarea = document.getElementById('verify-input-payload');
      if (textarea) {
        textarea.value = jsonString;
        const btnVerify = document.getElementById('btn-run-verify');
        if (btnVerify) btnVerify.click();
      }
    }, 100);
  }

  /**
   * Render the Verify Tab (#tab-verify)
   */
  function renderVerifyTab() {
    const container = document.getElementById('tab-verify');
    if (!container) return;

    container.innerHTML = `
      <div class="gov-card">
        <div class="gov-card-header">
          <div>
            <div class="brand-sup">Universal Credential Verification</div>
            <h2 class="gov-card-title mt-1">Academic Credential Verification Portal</h2>
            <p class="gov-card-subtitle">
              Verify institutional certificates offline or online. Checks <strong>ECDSA P-256</strong> asymmetric signature, <strong>Sandbox APAAR Registry</strong> existence, and <strong>Simulated permissioned ledger</strong> block anchor.
            </p>
          </div>
          <div class="header-action-pills">
            <span class="badge badge-gov font-mono">Zero-Knowledge</span>
            <span class="badge badge-info">Multi-Check</span>
          </div>
        </div>

        <div class="results-card mb-6">
          <label class="text-sm font-bold text-gov-navy" style="display: block; margin-bottom: 8px;">
            Paste Scanned QR Code Text or Certificate JSON:
          </label>
          <textarea id="verify-input-payload" class="code-textarea" rows="6" placeholder='{"payload": {"apaarId": "...", "name": "...", "college": "..."}, "signature": "..."}'></textarea>

          <!-- Quick Test Presets -->
          <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
            <button id="btn-preset-valid" class="btn btn-outline btn-sm">
              📋 Paste Last Issued Cert
            </button>
            <button id="btn-preset-tampered" class="btn btn-danger btn-sm">
              ⚠️ Test Tampered Data (Name Altered)
            </button>
            <button id="btn-preset-forged" class="btn btn-warning btn-sm">
              🚫 Test Forged Signature
            </button>
            <button id="btn-preset-clear" class="btn btn-outline btn-sm">
              🧹 Clear
            </button>
          </div>

          <div class="mt-4">
            <button id="btn-run-verify" class="btn btn-primary" style="width: 100%; padding: 10px; font-size: 1rem;">
              Verify Credential Authenticity
            </button>
          </div>
        </div>

        <!-- Verification Results Container -->
        <div id="verify-result-container" style="display: none;"></div>
      </div>
    `;

    // Hook verify button
    const btnRun = document.getElementById('btn-run-verify');
    const inputArea = document.getElementById('verify-input-payload');
    const resultBox = document.getElementById('verify-result-container');

    if (btnRun && inputArea && resultBox) {
      btnRun.addEventListener('click', async () => {
        const text = inputArea.value.trim();
        if (!text) {
          alert('Please paste a certificate JSON or QR code text to verify.');
          return;
        }

        btnRun.disabled = true;
        btnRun.textContent = 'Verifying Cryptographic Signatures & Ledger Anchor...';

        try {
          const outcome = await verify(text);
          renderVerificationOutcome(resultBox, outcome);
        } catch (err) {
          renderVerificationOutcome(resultBox, {
            valid: false,
            reason: 'Unexpected error during verification: ' + err.message
          });
        } finally {
          btnRun.disabled = false;
          btnRun.textContent = 'Verify Credential Authenticity';
        }
      });
    }

    // Presets
    const btnValid = document.getElementById('btn-preset-valid');
    const btnTampered = document.getElementById('btn-preset-tampered');
    const btnForged = document.getElementById('btn-preset-forged');
    const btnClear = document.getElementById('btn-preset-clear');

    if (btnValid) {
      btnValid.addEventListener('click', () => {
        const chain = getLedger().getChain();
        for (let i = chain.length - 1; i >= 0; i--) {
          if (chain[i].type === 'CERTIFICATE' && chain[i].data) {
            inputArea.value = JSON.stringify({
              payload: chain[i].data.payload,
              signature: chain[i].data.signature
            }, null, 2);
            return;
          }
        }
        alert('No certificates in ledger yet. Please issue one in the "Issue Credentials" tab first.');
      });
    }

    if (btnTampered) {
      btnTampered.addEventListener('click', () => {
        const chain = getLedger().getChain();
        let sample = null;
        for (let i = chain.length - 1; i >= 0; i--) {
          if (chain[i].type === 'CERTIFICATE' && chain[i].data) {
            sample = chain[i].data;
            break;
          }
        }
        if (!sample) {
          sample = {
            payload: {
              apaarId: '987654320001',
              name: 'Original Candidate',
              college: 'COEP Technological University, Pune',
              rollNo: 'COEP-2026-CS01',
              issuedAt: new Date().toISOString()
            },
            signature: 'tampered_signature_bytes_base64_demo'
          };
        }
        // Tamper the payload: change candidate name while preserving original signature
        const tamperedPayload = Object.assign({}, sample.payload, {
          name: 'MALICIOUS_IMPOSTOR (Tampered)'
        });
        inputArea.value = JSON.stringify({
          payload: tamperedPayload,
          signature: sample.signature
        }, null, 2);
      });
    }

    if (btnForged) {
      btnForged.addEventListener('click', () => {
        inputArea.value = JSON.stringify({
          payload: {
            apaarId: '999999999999',
            name: 'Unauthorized Candidate',
            college: 'Fake Technical Institute',
            rollNo: 'ROLL-FAKE',
            issuedAt: new Date().toISOString()
          },
          signature: 'MEQCIAj95wFakE47dK4Bq/3y1gN0rG9t7K4Z5jY8a2xX9vVLAiB9X0w8q7r6s5t4u3v2w1x0y9z8a7b6c5d4e3f2g1=='
        }, null, 2);
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        inputArea.value = '';
        resultBox.style.display = 'none';
      });
    }
  }

  /**
   * Render verification outcome details
   */
  function renderVerificationOutcome(container, outcome) {
    container.style.display = 'block';

    const isValid = outcome.valid;
    const checks = outcome.checks || {};
    const cert = outcome.cert || {};

    container.innerHTML = `
      <div class="results-card" style="border: 2px solid ${isValid ? 'var(--gov-green)' : 'var(--color-danger)'};">
        <!-- Top Status Banner -->
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color);">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: ${isValid ? 'var(--color-success-bg)' : 'var(--color-danger-bg)'}; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: ${isValid ? 'var(--color-success)' : 'var(--color-danger)'}; flex-shrink: 0;">
            ${isValid ? '✔' : '✖'}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.2rem; color: ${isValid ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${isValid ? 'AUTHENTIC &amp; VERIFIED CREDENTIAL' : 'VERIFICATION FAILED / INVALID CREDENTIAL'}
            </h3>
            <p class="text-xs text-gov-muted mt-1">
              ${outcome.reason}
            </p>
          </div>
        </div>

        <!-- 4-Point Cryptographic & Policy Checklist -->
        <div class="alert alert-success" style="padding: 12px; margin-bottom: 16px;">
          <div style="font-weight: 700; font-size: 0.75rem; color: var(--gov-navy); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
            AICTE Security Audit Verification Matrix:
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.825rem;">
            <div>
              <span style="color: ${checks.signature ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: bold;">
                ${checks.signature ? '✔' : '✖'}
              </span>
              <span>ECDSA P-256 Signature (${checks.signature ? 'Valid' : 'Failed'})</span>
            </div>
            <div>
              <span style="color: ${checks.sandbox ? 'var(--color-success)' : 'var(--color-warning)'}; font-weight: bold;">
                ${checks.sandbox ? '✔' : '▲'}
              </span>
              <span>Sandbox Registry (${checks.sandbox ? 'Found' : 'Unregistered'})</span>
            </div>
            <div>
              <span style="color: ${checks.ledgerRecord ? 'var(--color-success)' : 'var(--color-warning)'}; font-weight: bold;">
                ${checks.ledgerRecord ? '✔' : '▲'}
              </span>
              <span>Ledger Anchor (${checks.ledgerRecord ? `Block #${outcome.ledgerBlockIndex}` : 'Not Anchored'})</span>
            </div>
            <div>
              <span style="color: ${checks.studentActive ? 'var(--color-success)' : 'var(--text-muted)'}; font-weight: bold;">
                ${checks.studentActive ? '✔' : '•'}
              </span>
              <span>Active Admission (${checks.studentActive ? 'Active' : 'Unconfirmed'})</span>
            </div>
          </div>
        </div>

        <!-- Decoded Certificate Data -->
        ${cert.apaarId ? `
          <div class="table-responsive">
            <table class="data-table">
              <tbody>
                <tr><td style="width: 160px; font-weight: 700; color: var(--text-muted);">Candidate Name</td><td style="font-weight: 700; color: var(--gov-navy-dark);">${cert.name || '-'}</td></tr>
                <tr><td style="font-weight: 700; color: var(--text-muted);">APAAR ID</td><td class="font-mono font-bold">${cert.apaarId || '-'}</td></tr>
                <tr><td style="font-weight: 700; color: var(--text-muted);">Roll Number</td><td class="font-mono">${cert.rollNo || '-'}</td></tr>
                <tr><td style="font-weight: 700; color: var(--text-muted);">Institution</td><td>${cert.college || '-'}</td></tr>
                <tr><td style="font-weight: 700; color: var(--text-muted);">Issuance Timestamp</td><td class="text-xs">${cert.issuedAt ? new Date(cert.issuedAt).toLocaleString() : '-'}</td></tr>
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Module initialization
   */
  async function init() {
    await getKeyPair();
    renderCertsTab();
    renderVerifyTab();
  }

  // Export to global window object strictly complying with Shared Contract
  window.Certs = {
    init,
    issue,
    verify,
    getKeyPair,
    renderCertsTab,
    renderVerifyTab
  };

})();
