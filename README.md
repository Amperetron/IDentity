# APAAR-based Unified Admission & Credential Platform (SIH26263)
**AICTE Demonstration System &bull; Offline-First Multi-Node Permissioned Network**

A client-side admission compliance, anti-seat-hoarding, and verifiable digital credential platform developed for the All India Council for Technical Education (AICTE). Built to run natively on **GitHub Pages** or directly from local storage (`file://`) with zero build steps, zero npm dependencies, and zero external backend services.

---

## 5-Line AICTE Evaluator Demo Script

1. **Launch**: Open `index.html` in any modern web browser (runs offline from `file://` or GitHub Pages with zero servers).
2. **Inspect Dashboard & Multi-Node Network**: View live institutional capacity charts on the Dashboard, then click **Validator Network** to inspect the 3 simulated validator nodes (`Validator-MH`, `Validator-KA`, `Validator-AICTE`) with live head hashes and active BFT consensus (3/3 healthy).
3. **Test Byzantine Fault Tolerance & Tampering**: In **Validator Network**, click **"⚡ Tamper Node 2 Block #2"** to observe `Validator-KA` immediately flag as `DIVERGED` while the 2/3 majority consensus preserves network integrity; then click **"🩺 Heal Node"** to resync it from the majority chain.
4. **Test Anti-Hoarding & Ingestion**: Switch to **Bulk Admissions**, click **"⚡ Load Clean Batch"** to watch the multi-node round-robin consensus pipeline in action (`PROPOSE` &rarr; `VALIDATE` &rarr; `SIGN` with ECDSA P-256 &rarr; `COMMIT`); then click **"⚠️ Load Error Batch"** to see instant policy rejections (seat hoarding, unknown APAAR, NRI overflow).
5. **Issue & Verify Credentials**: Navigate to **Issue Credentials** to generate an ECDSA P-256 cryptographically signed certificate with QR code, then switch to **Verify Credential** to validate QR signatures offline.

---

## Multi-Node Permissioned Network Architecture

- **3 Validator Nodes**:
  - `Validator-MH` (Western Zone &bull; COEP, Pune)
  - `Validator-KA` (Southern Zone &bull; RVCE, Bengaluru)
  - `Validator-AICTE` (Central Apex Zone &bull; AICTE HQ, New Delhi)
- **Independent Storage per Node**: Each validator maintains its own cryptographic hash chain persisted in browser `localStorage` under `aicte_ledger_node_{nodeId}`.
- **Round-Robin Proposer**: Blocks alternate round-robin across the 3 nodes for block packaging and Merkle tree generation.
- **Threshold BFT Consensus (&ge; 2 of 3)**:
  - Each validator verifies the candidate block's parent hash, Merkle root, and state transitions.
  - Each validator digitally signs the block SHA-256 digest with its private **ECDSA P-256** key.
  - A block is committed only when threshold signatures (&ge; 2 of 3) are verified.
- **Merkle Roots**:
  - **Block Data Merkle Root**: Each block contains a binary Merkle tree root of its data fields/transactions.
  - **Chain Global Merkle Root**: `Ledger.getMerkleRoot()` calculates a binary Merkle tree root across all block hashes in the consensus chain.
- **Tamper Detection & Healing**:
  - `Ledger.tamper(index, nodeId)` corrupts only the target node's local storage copy.
  - The minority node's head hash diverges and is detected and labeled `DIVERGED`, while healthy nodes maintain consensus.
  - `Ledger.heal(nodeId?)` resynchronizes diverged nodes from the 2/3 majority consensus chain.

---

## Key Architectural Principles & Assumptions

- **Sandbox Adapter**: Local sandbox registry (`SEED.apaar` in `data.js`) containing 60 simulated candidates with 12-digit APAAR IDs, names, and birth dates. No external government network calls are made.
- **Simulated Permissioned Multi-Node Ledger**: An append-only cryptographic hash chain (`Ledger` in `ledger.js`) using `crypto.subtle` SHA-256 digests and ECDSA P-256 signatures persisted across multiple nodes in `localStorage`.
- **Derived State (Single Source of Truth)**: As mandated by AICTE policy, `Rules.getCollegeStats()` computes college seat occupancies, NRI quotas, and candidate eligibility by replaying the ledger hash chain—never relying on mutable counters.
- **Seat Hoarding Prevention**: A candidate holding an active `ADMISSION` block cannot be admitted to any other institution unless a prior `CANCELLATION` block has been recorded on the chain.
- **Pinned CDN Libraries**: Chart.js v4.4.1 (charts), PapaParse v5.4.1 (CSV parsing), SheetJS v0.18.5 (Excel parsing), and qrcode.js v1.0.0 (QR generation).
- **Zero Build Step**: Pure HTML5 and vanilla JavaScript with traditional `<script>` tags, ensuring total compatibility on mobile browsers and offline sandboxes.

---

## File Structure & Agent Division of Roles

```text
IDentity/
├── index.html            (Agent A: Government Dashboard UI Shell & Tabs)
├── style.css             (Agent A: Responsive Gov Light Theme Stylesheet & Node Styles)
├── app.js                (Agent A: App Orchestrator, Demo Seeding, Tab Routing, Ledger UI)
├── data.js               (Agent A: Seed Data - 12 Colleges, 60 Sandbox APAARs)
├── ledger.js             (Agent A: Multi-Node Permissioned SHA-256 Ledger & P-256 BFT)
├── network.js            (Agent A: Multi-Node Validator UI, Live Hashes, Consensus Pipeline)
├── rules.js              (Agent A: Compliance, Capacity & Anti-Seat-Hoarding Engine)
├── upload.js             (Agent A: Bulk CSV/XLSX Ingestion & Row-Level Validation)
├── samples/
│   ├── clean.csv         (Agent A: Valid admissions batch)
│   └── errors.csv        (Agent A: Batch demonstrating anti-hoarding, unknown APAAR, NRI overflow)
├── certs.js              (Agent B: ECDSA P-256 Keypair, Certificate Signing & QR)
├── anomalies.js          (Agent B: Velocity Z-Score & Capacity Anomaly Detection)
├── dashboard.js          (Agent B: State Charts, College Table, Tamper/Reset Controls & On-Chain Anchor Panel)
├── nlquery.js            (Agent B: Natural Language Query with Cloudflare LLM Proxy & Local Fallback)
├── config.js             (Agent B: Platform Configuration - CONTRACT_ADDRESS, CHAIN_ID, EXPLORER, LLM_PROXY_URL)
├── anchor.js             (Agent B: Ethereum Sepolia Testnet Anchoring via MetaMask & Ethers v5)
└── README.md             (System Documentation & 5-Line Demo Script)
```

<!--
================================================================================
NOTICE FOR AGENT A (index.html owner):
To enable Ethereum testnet anchoring and platform configuration, add the following
script tags to index.html immediately before app.js:

  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js"></script>
  <script src="config.js"></script>
  <script src="anchor.js"></script>
================================================================================
-->

---

## On-Chain Testnet Anchoring (Ethereum Sepolia) & LLM Query Engine (Agent B)

### 1. Testnet Anchoring (`anchor.js` & `config.js`)
- **Sepolia Testnet Contract**: Connects via MetaMask (`window.ethereum`) to anchor the permissioned ledger root (`Ledger.getMerkleRoot()`, falling back to full chain SHA-256) or certificate hashes onto Ethereum Sepolia.
- **`Anchor.connect()`**: Authorizes MetaMask and switches/adds network chain ID `11155111`.
- **`Anchor.anchorNow()`**: Calls `contract.anchor(bytes32 root)`, logs transaction hash linked to Sepolia Etherscan, and persists anchor records in `localStorage`.
- **`Anchor.verifyAgainstChain()`**: Queries the contract's `Anchored` event logs and compares the on-chain root with the local ledger root, reporting `ANCHOR MATCH` or `LEDGER CHANGED SINCE ANCHOR`.
- **On-chain Anchor Panel**: Interactive dashboard panel with Connect, Anchor Now, and Verify controls, displaying clear notices if MetaMask or `CONTRACT_ADDRESS` is absent without breaking offline workflows.
- **Certificate Anchoring**: Allows instant on-chain anchoring of digital credentials directly from the issuance card.

### 2. Natural Language Query Engine (`nlquery.js`)
- **Cloudflare Worker LLM Proxy**: Dispatches queries via POST to `CONFIG.LLM_PROXY_URL` returning `{filters:[{field,op,value}], sort:{field,dir}}`.
- **Strict Whitelist & Type Safety**:
  - Whitelisted fields: `name`, `state`, `intake`, `admitted`, `nriAdmitted`, `nriQuota`, `utilization`.
  - Whitelisted ops: `>`, `<`, `>=`, `<=`, `=`, `contains`.
  - Never executes arbitrary code or SQL; strictly evaluates validated JSON filters against `Rules.getCollegeStats()`.
- **Silently Labeled Fallback**: Automatically falls back to the deterministic local keyword parser labeled `"Parsed locally"` upon empty proxy URL, network error, or 6-second timeout.
- **Zero API Keys**: No API keys or secrets stored anywhere in client code.
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
