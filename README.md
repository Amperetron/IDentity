# APAAR-based Unified Admission & Credential Platform (SIH26263)
**AICTE Demonstration System &bull; Offline-First Static Web Application**

A client-side admission compliance, anti-seat-hoarding, and verifiable digital credential platform developed for the All India Council for Technical Education (AICTE). Built to run natively on **GitHub Pages** or directly from local storage (`file://`) with zero build steps, zero npm dependencies, and zero external backend services.

---

## 5-Line AICTE Evaluator Demo Script

1. **Launch**: Open `index.html` in any modern web browser (works from `file://` or GitHub Pages without a server).
2. **Inspect Dashboard**: View real-time institutional utilization charts and anomaly alerts derived strictly from the permissioned ledger (~40 pre-admitted students, 2 colleges at 100% capacity, 1 flagged NRI overflow).
3. **Test Anti-Hoarding & Ingestion**: Click the **Bulk Admissions** tab, then click **"⚡ Load Clean Batch"** to see successful commits; next, click **"⚠️ Load Error Batch"** to observe instant rejection of seat-hoarding, unknown APAAR IDs, NRI quota overflows, and malformed rows.
4. **Issue & Verify Credentials**: Navigate to **Issue Credentials** to generate an ECDSA P-256 cryptographically signed certificate with QR code, then switch to **Verify Credential** to validate QR signatures offline.
5. **Demonstrate Ledger Integrity**: Open **Ledger Explorer**, click **"⚡ Tamper Block #2"** to watch the SHA-256 integrity check immediately detect the cryptographic breach, then click **"🔄 Reset Demo & Ledger"** to restore pristine state.

---

## Key Architectural Principles & Assumptions

- **Sandbox Adapter**: Local sandbox registry (`SEED.apaar` in `data.js`) containing 60 simulated candidates with 12-digit APAAR IDs, names, and birth dates. No external government network calls are made.
- **Simulated Permissioned Ledger**: An append-only cryptographic hash chain (`Ledger` in `ledger.js`) using `crypto.subtle` SHA-256 digests persisted in browser `localStorage`. Each block cryptographically binds to its parent hash, providing tamper-evident auditability.
- **Derived State (Single Source of Truth)**: As mandated by AICTE policy, `Rules.getCollegeStats()` computes college seat occupancies, NRI quotas, and candidate eligibility by replaying the ledger hash chain—never relying on mutable counters.
- **Seat Hoarding Prevention**: A candidate holding an active `ADMISSION` block cannot be admitted to any other institution unless a prior `CANCELLATION` block has been recorded on the chain.
- **Pinned CDN Libraries**: Chart.js v4.4.1 (charts), PapaParse v5.4.1 (CSV parsing), SheetJS v0.18.5 (Excel parsing), and qrcode.js v1.0.0 (QR generation).
- **Zero Build Step**: Pure HTML5 and vanilla JavaScript with traditional `<script>` tags, ensuring total compatibility on mobile browsers and offline sandboxes.

---

## File Structure & Agent Division of Roles

```text
IDentity/
├── index.html            (Agent A: Government Dashboard UI Shell & Tabs)
├── style.css             (Agent A: Responsive Gov Light Theme Stylesheet)
├── app.js                (Agent A: App Orchestrator, Demo Seeding, Tab Routing, Ledger UI)
├── data.js               (Agent A: Seed Data - 12 Colleges, 60 Sandbox APAARs)
├── ledger.js             (Agent A: SHA-256 Hash Chain with Tamper Simulation)
├── rules.js              (Agent A: Compliance, Capacity & Anti-Seat-Hoarding Engine)
├── upload.js             (Agent A: Bulk CSV/XLSX Ingestion & Row-Level Validation)
├── samples/
│   ├── clean.csv         (Agent A: Valid admissions batch)
│   └── errors.csv        (Agent A: Batch demonstrating anti-hoarding, unknown APAAR, NRI overflow)
├── certs.js              (Agent B: ECDSA P-256 Keypair, Certificate Signing & QR)
├── anomalies.js          (Agent B: Velocity Z-Score & Capacity Anomaly Detection)
├── dashboard.js          (Agent B: State Charts, College Table, Tamper/Reset Controls)
├── nlquery.js            (Agent B: Client-Side Natural Language Keyword Query Parser)
└── README.md             (System Documentation & 5-Line Demo Script)
```

---

## Sample Admission Files

- **`samples/clean.csv`**: Contains valid students from the sandbox APAAR pool applying to institutions with available capacity and within quota limits.
- **`samples/errors.csv`**: Demonstrates robust error handling and policy enforcement:
  - *Seat Hoarding Detection*: Duplicate APAAR already admitted in the ledger.
  - *Unknown APAAR*: Unregistered candidate not in Sandbox.
  - *NRI Quota Overflow*: Attempted admission beyond college's NRI limit.
  - *Intake Capacity Limit*: Attempted admission into a 100% full institution.
  - *Missing Column Data*: Incomplete rows caught before processing.
