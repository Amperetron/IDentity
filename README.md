# APAAR-based Unified Admission & Credential Platform (SIH26263)
**AICTE Demonstration System • Multi-Node Permissioned Network & API Shared Persistence (/api/blocks)**

A client-side admission compliance, anti-seat-hoarding, and verifiable digital credential platform developed for the All India Council for Technical Education (AICTE). Built to run natively on **GitHub Pages** or directly from local storage (`file://`) with zero build steps, zero npm dependencies, zero node backend services, and real-time multi-tab shared persistence via `/api/blocks`.

---

## 5-Line AICTE Evaluator Demo Script

1. **Launch**: Open `index.html` in any modern web browser (runs from `file://` or GitHub Pages with zero build step; room defaults to `public-demo`).
2. **Multi-Tab Realtime Sync**: Click **"🔗 Share Room"** in the top banner and paste the link into a second browser window/tab (or incognito). Admitting a student or issuing a certificate in Tab 1 immediately updates Tab 2 in real time!
3. **Inspect Validator Network**: Click **Validator Network** to observe the 3 simulated validator nodes (`Validator-MH`, `Validator-KA`, `Validator-AICTE`) with live block heights, head hashes, and active BFT consensus (3/3 healthy).
4. **Test Byzantine Fault Tolerance & Tampering**: In **Validator Network**, click **"⚡ Tamper Node 2 Block #2"** to observe `Validator-KA` immediately flag as `DIVERGED` while the 2/3 majority consensus preserves network integrity; then click **"🩺 Heal Node"** to resync it from the majority chain.
5. **Test Anti-Hoarding & Ingestion**: Switch to **Bulk Admissions**, click **"⚡ Load Clean Batch"** to watch the multi-node round-robin consensus pipeline in action (`PROPOSE` → `VALIDATE` → `SIGN` with ECDSA P-256 → `COMMIT`); then click **"⚠️ Load Error Batch"** to see instant policy rejections (seat hoarding, unknown APAAR, NRI overflow).

---

## API-Based Shared Persistence & Multi-Tab Sync Architecture (`/api/blocks`)

- **Backend API Integration (`store.js` / `window.Store`)**:
  - `Store.pull()`: Dispatches `GET /api/blocks?room=<roomId>` to fetch all committed blocks for the active room ordered by index (`idx asc`).
  - `Store.push(block)`: Dispatches `POST /api/blocks` with `{ room, idx, block }` for atomic persistence.
  - Zero Client SDK & Zero Anon Keys: Client-side Supabase script tag and public anon key usage have been completely removed, eliminating credential exposure in the browser.
- **Room Isolation (`?room=...`)**:
  - Multi-tenant room isolation driven by URL parameter `?room=<roomId>` or `CONFIG.ROOM` (defaults to `"public-demo"`).
  - Each room maintains completely isolated ledger chains and states.
  - "Share Room" button generates a shareable link; "Switch Room" allows jumping to any room instantly.
- **Concurrency & Conflict Resolution**:
  - If concurrent proposals attempt to commit at the same index, `/api/blocks` returns HTTP 409 (`code: 23505`).
  - `Ledger.addBlock` catches the conflict, re-pulls the latest chain from `/api/blocks`, re-validates admission compliance rules (`Rules.checkAdmission`), rebuilds on top of the fresh chain tip, and retries once.
  - If a rule fails during re-validation (e.g. anti-seat-hoarding violation due to a concurrent admission), the transaction is cleanly rejected with a clear explanation banner.
- **Offline-First Fallback**:
  - If `/api` is unreachable (e.g. running standalone from `file://` or GitHub Pages without a backend proxy), the platform gracefully operates entirely from browser `localStorage` as an offline-first system.
  - An amber `"Offline (local only)"` badge is displayed in the header and room banner.
  - Never throws unhandled exceptions or crashes.
- **Safe Room Reset**:
  - Clicking "Reset Demo" clears local browser state and switches to a fresh room `?room=demo-<random>`.
  - Shared database rows for existing rooms are **never** dropped or deleted.

---

## Multi-Node Permissioned Network Architecture

- **3 Validator Nodes**:
  - `Validator-MH` (Western Zone • COEP, Pune)
  - `Validator-KA` (Southern Zone • RVCE, Bengaluru)
  - `Validator-AICTE` (Central Apex Zone • AICTE HQ, New Delhi)
- **Independent Storage per Node**: Each validator maintains its own cryptographic hash chain persisted in browser `localStorage` under `aicte_ledger_node_{nodeId}_{room}`.
- **Round-Robin Proposer**: Blocks alternate round-robin across the 3 nodes for block packaging and Merkle tree generation.
- **Threshold BFT Consensus (≥ 2 of 3)**:
  - Each validator verifies the candidate block parent hash, Merkle root, and state transitions.
  - Each validator digitally signs the block SHA-256 digest with its private **ECDSA P-256** key.
  - A block is committed only when threshold signatures (≥ 2 of 3) are verified.
- **Merkle Roots**:
  - **Block Data Merkle Root**: Each block contains a binary Merkle tree root of its data fields/transactions.
  - **Chain Global Merkle Root**: `Ledger.getMerkleRoot()` calculates a binary Merkle tree root across all block hashes in the consensus chain.
- **Tamper Detection & Healing**:
  - `Ledger.tamper(index, nodeId)` corrupts only the target node local storage copy.
  - The minority node head hash diverges and is detected and labeled `DIVERGED` (`1 NODE DIVERGED - CONSENSUS HOLDS (2/3)`), while healthy nodes maintain consensus.
  - `Ledger.heal(nodeId?)` resynchronizes diverged nodes from the 2/3 majority consensus chain.

---

## Key Architectural Principles & Assumptions

- **Sandbox Adapter**: Local sandbox registry (`SEED.apaar` in `data.js`) containing 60 simulated candidates with 12-digit APAAR IDs, names, and birth dates. No external government network calls are made.
- **Simulated Permissioned Multi-Node Ledger**: An append-only cryptographic hash chain (`Ledger` in `ledger.js`) using `crypto.subtle` SHA-256 digests and ECDSA P-256 signatures persisted across multiple nodes in `localStorage`.
- **Derived State (Single Source of Truth)**: As mandated by AICTE policy, `Rules.getCollegeStats()` computes college seat occupancies, NRI quotas, and candidate eligibility by replaying the ledger hash chain—never relying on mutable counters.
- **Seat Hoarding Prevention**: A candidate holding an active `ADMISSION` block cannot be admitted to any other institution unless a prior `CANCELLATION` block has been recorded on the chain.
- **Pinned CDN Libraries**: Chart.js v4.4.1 (charts), PapaParse v5.4.1 (CSV parsing), SheetJS v0.18.5 (Excel parsing), and qrcode.js v1.0.0 (QR generation).
- **Zero Build Step**: Pure HTML5 and vanilla JavaScript with traditional `<script>` tags, ensuring total compatibility on mobile browsers, GitHub Pages, and offline sandboxes.

---

## File Structure & Module Organization

```text
IDentity/
├── index.html            (Government Dashboard UI Shell, Tabs & Script Tags)
├── style.css             (Responsive Gov Light Theme Stylesheet & Node Styles)
├── app.js                (App Orchestrator, Demo Seeding, Tab Routing, Ledger UI)
├── data.js               (Seed Data - 12 Colleges, 60 Sandbox APAARs)
├── store.js              (API Shared Persistence /api/blocks, Room Isolation & Offline Fallback)
├── ledger.js             (Multi-Node Permissioned SHA-256 Ledger, P-256 BFT & Cloud Store)
├── network.js            (Multi-Node Validator UI, Live Hashes, Consensus Pipeline)
├── rules.js              (Compliance, Capacity & Anti-Seat-Hoarding Engine)
├── upload.js             (Bulk CSV/XLSX Ingestion & Row-Level Validation)
├── samples/
│   ├── clean.csv         (Valid admissions batch)
│   └── errors.csv        (Batch demonstrating anti-hoarding, unknown APAAR, NRI overflow)
├── certs.js              (ECDSA P-256 Keypair, Certificate Signing & QR)
├── anomalies.js          (Velocity Z-Score & Capacity Anomaly Detection)
├── dashboard.js          (State Charts, College Table, Tamper/Reset Controls & On-Chain Anchor Panel)
├── nlquery.js            (Natural Language Query with Cloudflare LLM Proxy & Local Fallback)
├── config.js             (Configuration - CONTRACT_ADDRESS, CHAIN_ID, EXPLORER, SUPABASE_URL, SUPABASE_ANON_KEY, ROOM)
├── anchor.js             (Ethereum Sepolia Testnet Anchoring via MetaMask & Ethers v5)
└── README.md             (System Documentation & 5-Line Demo Script)
```

---

## On-Chain Testnet Anchoring (Ethereum Sepolia) & LLM Query Engine

### 1. Testnet Anchoring (`anchor.js` & `config.js`)
- **Sepolia Testnet Contract**: Connects via MetaMask (`window.ethereum`) to anchor the permissioned ledger root (`Ledger.getMerkleRoot()`) or certificate hashes onto Ethereum Sepolia.
- **`Anchor.connect()`**: Authorizes MetaMask and switches/adds network chain ID `11155111`.
- **`Anchor.anchorNow()`**: Calls `contract.anchor(bytes32 root)`, logs transaction hash linked to Sepolia Etherscan, and persists anchor records in `localStorage`.
- **`Anchor.verifyAgainstChain()`**: Queries the contract `Anchored` event logs and compares the on-chain root with the local ledger root, reporting `ANCHOR MATCH` or `LEDGER CHANGED SINCE ANCHOR`.
- **On-chain Anchor Panel**: Interactive dashboard panel with Connect, Anchor Now, and Verify controls.
- **Certificate Anchoring**: Allows instant on-chain anchoring of digital credentials directly from the issuance card.

### 2. Natural Language Query Engine (`nlquery.js`)
- **Cloudflare Worker LLM Proxy**: Dispatches queries via POST to `CONFIG.LLM_PROXY_URL` returning `{filters:[{field,op,value}], sort:{field,dir}}`.
- **Strict Whitelist & Type Safety**:
  - Whitelisted fields: `name`, `state`, `intake`, `admitted`, `nriAdmitted`, `nriQuota`, `utilization`.
  - Whitelisted ops: `>`, `<`, `>=`, `<=`, `=`, `contains`.
  - Never executes arbitrary code or SQL; strictly evaluates validated JSON filters against `Rules.getCollegeStats()`.
- **Silently Labeled Fallback**: Automatically falls back to the deterministic local keyword parser labeled `"Parsed locally"` upon empty proxy URL, network error, or 6-second timeout.
- **Zero API Keys**: No API secrets stored anywhere in client code.

---

## Sample Admission Files

- **`samples/clean.csv`**: Contains valid students from the sandbox APAAR pool applying to institutions with available capacity and within quota limits.
- **`samples/errors.csv`**: Demonstrates robust error handling and policy enforcement:
  - *Seat Hoarding Detection*: Duplicate APAAR already admitted in the ledger.
  - *Unknown APAAR*: Unregistered candidate not in Sandbox.
  - *NRI Quota Overflow*: Attempted admission beyond college NRI limit.
  - *Intake Capacity Limit*: Attempted admission into a 100% full institution.
  - *Missing Column Data*: Incomplete rows caught before processing.
