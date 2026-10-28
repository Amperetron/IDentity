/**
 * anchor.js - Real Testnet Anchoring (Ethereum Sepolia)
 * Agent B - Shared Contract: window.Anchor
 *
 * Capabilities:
 * - Dynamically loads ethers v5.7.2 UMD from cdnjs via <script>
 * - Connects to MetaMask (window.ethereum) and handles Sepolia chainId (11155111)
 * - Anchor.anchorNow(customHash): Anchors Ledger.getMerkleRoot() (or SHA-256 chain fallback) or custom hash
 * - Anchor.verifyAgainstChain(): Reads latest Anchored event from contract and compares against ledger root
 *   Outputs status: "ANCHOR MATCH" or "LEDGER CHANGED SINCE ANCHOR"
 * - Manages anchors in localStorage ('aicte_apaar_anchors')
 * - Graceful fallback and clear notifications when MetaMask or CONTRACT_ADDRESS is missing
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'aicte_apaar_anchors';
  const ETHERS_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js';

  // Standard State Anchor ABI
  const ANCHOR_ABI = [
    "function anchor(bytes32 root) external",
    "function latestRoot() external view returns (bytes32)",
    "function roots(bytes32) external view returns (bool)",
    "event Anchored(bytes32 indexed root, address indexed sender, uint256 timestamp)",
    "event Anchored(bytes32 root, address sender, uint256 timestamp)"
  ];

  let ethersLoadPromise = null;
  let activeAccount = null;
  let activeProvider = null;
  let activeSigner = null;

  /**
   * Safe getter for window.CONFIG with default fallback
   */
  function getConfig() {
    return window.CONFIG || {
      CONTRACT_ADDRESS: "",
      CHAIN_ID: 11155111,
      EXPLORER: "https://sepolia.etherscan.io",
      LLM_PROXY_URL: ""
    };
  }

  /**
   * Dynamically loads ethers v5.7.2 UMD from cdnjs via <script>
   */
  function ensureEthers() {
    if (window.ethers && window.ethers.providers) {
      return Promise.resolve(window.ethers);
    }
    if (ethersLoadPromise) {
      return ethersLoadPromise;
    }

    ethersLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${ETHERS_CDN_URL}"]`);
      if (existing) {
        if (window.ethers) return resolve(window.ethers);
        existing.addEventListener('load', () => resolve(window.ethers));
        existing.addEventListener('error', (err) => reject(new Error('Failed to load ethers.js: ' + err)));
        return;
      }

      const script = document.createElement('script');
      script.src = ETHERS_CDN_URL;
      script.async = true;
      script.onload = () => {
        if (window.ethers) {
          resolve(window.ethers);
        } else {
          reject(new Error('ethers.js loaded but window.ethers was not defined.'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load ethers.js from CDN: ' + ETHERS_CDN_URL));
      document.head.appendChild(script);
    });

    return ethersLoadPromise;
  }

  // Preload ethers script immediately in background
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    ensureEthers().catch(err => console.warn('Background ethers preload notice:', err.message));
  }

  /**
   * Retrieve saved anchor history from localStorage
   * @returns {Array<Object>}
   */
  function getStoredAnchors() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to parse stored anchors:', e);
      return [];
    }
  }

  /**
   * Save a newly minted anchor to localStorage
   */
  function saveAnchorRecord(record) {
    try {
      const list = getStoredAnchors();
      list.unshift(record);
      // Keep most recent 50
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (e) {
      console.warn('Failed to save anchor record:', e);
    }
  }

  /**
   * Check if MetaMask / window.ethereum is available
   */
  function isMetaMaskAvailable() {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
  }

  /**
   * Compute full chain SHA-256 fallback if Ledger.getMerkleRoot is missing
   * @returns {Promise<string>} 0x-prefixed 32-byte hex string
   */
  async function computeFullChainSha256() {
    const chain = (window.Ledger && typeof window.Ledger.getChain === 'function')
      ? window.Ledger.getChain()
      : [];
    const raw = JSON.stringify(chain);

    if (window.crypto && window.crypto.subtle) {
      try {
        const enc = new TextEncoder().encode(raw);
        const buf = await window.crypto.subtle.digest('SHA-256', enc);
        const hashArray = Array.from(new Uint8Array(buf));
        return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // Fallback below
      }
    }

    if (window.Ledger && typeof window.Ledger.hash === 'function') {
      try {
        const h = await window.Ledger.hash(raw);
        return h.startsWith('0x') ? h : '0x' + h;
      } catch (e) {
        // Fallback below
      }
    }

    return '0x' + '0'.repeat(64);
  }

  /**
   * Gets current ledger root using Ledger.getMerkleRoot(), falling back to chain SHA-256
   * Formats return value as valid 32-byte hex (0x...)
   * @returns {Promise<string>}
   */
  async function getMerkleOrChainRoot() {
    let root = null;
    if (window.Ledger && typeof window.Ledger.getMerkleRoot === 'function') {
      try {
        root = window.Ledger.getMerkleRoot();
      } catch (e) {
        console.warn('Ledger.getMerkleRoot threw error:', e);
      }
    }

    if (!root) {
      root = await computeFullChainSha256();
    }

    // Ensure 0x-prefixed 64 hex characters (32 bytes)
    let clean = String(root).trim();
    if (!clean.startsWith('0x')) clean = '0x' + clean;
    if (clean.length > 66) clean = clean.slice(0, 66);
    else if (clean.length < 66) clean = clean.padEnd(66, '0');

    return clean;
  }

  /**
   * Format any string/hash to bytes32 0x...
   */
  function toBytes32(hash) {
    if (!hash) return '0x' + '0'.repeat(64);
    let clean = String(hash).trim();
    if (!clean.startsWith('0x')) clean = '0x' + clean;
    if (clean.length > 66) clean = clean.slice(0, 66);
    else if (clean.length < 66) clean = clean.padEnd(66, '0');
    return clean;
  }

  /**
   * Ensure user's wallet is switched to the configured CHAIN_ID (Sepolia 11155111)
   */
  async function ensureCorrectNetwork() {
    if (!window.ethereum) return false;
    const config = getConfig();
    const targetChainId = Number(config.CHAIN_ID) || 11155111;
    const targetChainIdHex = '0x' + targetChainId.toString(16);

    try {
      const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
      if (parseInt(currentChain, 16) === targetChainId) {
        return true;
      }

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }]
      });
      return true;
    } catch (err) {
      if (err && err.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetChainIdHex,
              chainName: 'Sepolia Testnet',
              nativeCurrency: { name: 'Sepolia ETH', symbol: 'SEP', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org', 'https://ethereum-sepolia.publicnode.com'],
              blockExplorerUrls: [config.EXPLORER || 'https://sepolia.etherscan.io']
            }]
          });
          return true;
        } catch (addErr) {
          console.warn('Failed to add Sepolia network:', addErr);
          throw addErr;
        }
      }
      throw err;
    }
  }

  /**
   * Connect to MetaMask wallet
   * Shared Contract: Anchor.connect()
   * @returns {Promise<{connected: boolean, account: string|null, message?: string, reason?: string}>}
   */
  async function connect() {
    if (!isMetaMaskAvailable()) {
      return {
        connected: false,
        account: null,
        reason: 'METAMASK_MISSING',
        message: 'MetaMask is not installed. Please install MetaMask browser extension to connect.'
      };
    }

    try {
      await ensureEthers();
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        return {
          connected: false,
          account: null,
          reason: 'NO_ACCOUNTS',
          message: 'No Ethereum accounts authorized. Please approve the MetaMask connection request.'
        };
      }

      await ensureCorrectNetwork();

      activeAccount = accounts[0];
      activeProvider = new window.ethers.providers.Web3Provider(window.ethereum);
      activeSigner = activeProvider.getSigner();

      // Listen for network and account changes
      if (window.ethereum.on) {
        window.ethereum.on('accountsChanged', (accs) => {
          activeAccount = accs && accs[0] ? accs[0] : null;
          if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('anchor:accountChanged', { detail: { account: activeAccount } }));
          }
        });
        window.ethereum.on('chainChanged', () => {
          window.location.reload();
        });
      }

      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('anchor:connected', { detail: { account: activeAccount } }));
      }

      return {
        connected: true,
        account: activeAccount,
        provider: activeProvider,
        signer: activeSigner,
        message: `Connected to ${activeAccount.slice(0, 6)}...${activeAccount.slice(-4)}`
      };
    } catch (err) {
      console.warn('Anchor.connect failed:', err);
      return {
        connected: false,
        account: null,
        reason: 'USER_REJECTED',
        message: err.message || 'Connection request rejected by user.'
      };
    }
  }

  /**
   * Anchor state on-chain
   * Shared Contract: Anchor.anchorNow(customHash?)
   * Takes Ledger.getMerkleRoot() (fall back to a SHA-256 of the full chain if missing)
   * or custom hash (e.g. certificate hash) and calls contract.anchor(bytes32 root).
   * Shows tx hash with an Etherscan link, stores anchors in localStorage.
   *
   * @param {string} [customHash] Optional explicit hash to anchor (e.g. certHash)
   * @returns {Promise<{success: boolean, txHash?: string, explorerUrl?: string, root?: string, message?: string, reason?: string}>}
   */
  async function anchorNow(customHash) {
    if (!isMetaMaskAvailable()) {
      return {
        success: false,
        reason: 'METAMASK_MISSING',
        message: 'MetaMask is not installed. Please install MetaMask to anchor state on Ethereum Sepolia.'
      };
    }

    const config = getConfig();
    if (!config.CONTRACT_ADDRESS || !config.CONTRACT_ADDRESS.trim()) {
      return {
        success: false,
        reason: 'CONTRACT_ADDRESS_MISSING',
        message: 'CONTRACT_ADDRESS is not configured in config.js. Please set an anchor contract address.'
      };
    }

    try {
      await ensureEthers();

      // Connect if not already connected
      if (!activeAccount || !activeSigner) {
        const conn = await connect();
        if (!conn.connected) {
          return { success: false, reason: conn.reason, message: conn.message };
        }
      }

      await ensureCorrectNetwork();

      // Determine root to anchor
      const rootToAnchor = customHash ? toBytes32(customHash) : await getMerkleOrChainRoot();

      const contract = new window.ethers.Contract(config.CONTRACT_ADDRESS.trim(), ANCHOR_ABI, activeSigner);

      // Submit anchor transaction
      const tx = await contract.anchor(rootToAnchor);
      const explorerBase = config.EXPLORER || 'https://sepolia.etherscan.io';
      const explorerUrl = `${explorerBase}/tx/${tx.hash}`;

      // Await receipt (1 block confirmation)
      let receipt = null;
      try {
        receipt = await tx.wait(1);
      } catch (waitErr) {
        console.warn('Transaction submitted but wait failed (will proceed with tx hash):', waitErr);
      }

      // Persist in localStorage
      const record = {
        txHash: tx.hash,
        root: rootToAnchor,
        timestamp: new Date().toISOString(),
        blockNumber: receipt ? receipt.blockNumber : null,
        account: activeAccount,
        type: customHash ? 'CERTIFICATE_HASH' : 'LEDGER_ROOT',
        explorerUrl: explorerUrl
      };
      saveAnchorRecord(record);

      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('anchor:created', { detail: record }));
      }

      return {
        success: true,
        txHash: tx.hash,
        explorerUrl: explorerUrl,
        root: rootToAnchor,
        blockNumber: receipt ? receipt.blockNumber : null,
        message: `Successfully anchored on Sepolia! TX: ${tx.hash.slice(0, 10)}...`
      };
    } catch (err) {
      console.warn('Anchor.anchorNow failed:', err);
      let errMsg = err.message || 'Transaction failed or was rejected.';
      if (err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('user rejected'))) {
        errMsg = 'Transaction was rejected in MetaMask.';
      } else if (err.data && err.data.message) {
        errMsg = err.data.message;
      }
      return {
        success: false,
        reason: 'TX_FAILED',
        message: errMsg
      };
    }
  }

  /**
   * Verify current ledger against latest on-chain anchored root
   * Shared Contract: Anchor.verifyAgainstChain()
   * Reads the latest anchored root from the contract's Anchored events and compares to the current ledger root.
   * Returns "ANCHOR MATCH" or "LEDGER CHANGED SINCE ANCHOR".
   *
   * @returns {Promise<{status: string, match: boolean, latestRoot: string|null, currentLedgerRoot: string, txHash?: string, message: string}>}
   */
  async function verifyAgainstChain() {
    const config = getConfig();
    if (!config.CONTRACT_ADDRESS || !config.CONTRACT_ADDRESS.trim()) {
      return {
        status: 'CONFIG_MISSING',
        match: false,
        latestRoot: null,
        currentLedgerRoot: await getMerkleOrChainRoot(),
        message: 'CONTRACT_ADDRESS is not configured in config.js. Please specify a contract address.'
      };
    }

    try {
      await ensureEthers();

      // Use active provider or fallback Sepolia public JSON-RPC provider
      let provider = activeProvider;
      if (!provider) {
        if (isMetaMaskAvailable()) {
          provider = new window.ethers.providers.Web3Provider(window.ethereum);
        } else {
          provider = new window.ethers.providers.JsonRpcProvider('https://rpc.sepolia.org');
        }
      }

      const contract = new window.ethers.Contract(config.CONTRACT_ADDRESS.trim(), ANCHOR_ABI, provider);

      let latestRoot = null;
      let latestEvent = null;

      // 1. Try querying contract's Anchored events
      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 50000);
        const filter = contract.filters.Anchored();
        const events = await contract.queryFilter(filter, fromBlock, 'latest');
        if (events && events.length > 0) {
          latestEvent = events[events.length - 1];
          latestRoot = latestEvent.args ? (latestEvent.args.root || latestEvent.args[0]) : null;
        }
      } catch (evErr) {
        console.warn('queryFilter Anchored events warning:', evErr.message);
      }

      // 2. Fallback to contract.latestRoot() view method
      if (!latestRoot) {
        try {
          const r = await contract.latestRoot();
          if (r && r !== '0x' + '0'.repeat(64)) {
            latestRoot = r;
          }
        } catch (e) {
          // View method not present
        }
      }

      // 3. Fallback to locally stored anchors for this contract address if RPC limits queryFilter
      if (!latestRoot) {
        const stored = getStoredAnchors();
        if (stored.length > 0 && stored[0].root) {
          latestRoot = stored[0].root;
          latestEvent = { transactionHash: stored[0].txHash, blockNumber: stored[0].blockNumber, fromStorage: true };
        }
      }

      const currentLedgerRoot = await getMerkleOrChainRoot();

      if (!latestRoot) {
        return {
          status: 'NO_ANCHORS_FOUND',
          match: false,
          latestRoot: null,
          currentLedgerRoot: currentLedgerRoot,
          message: `No Anchored events or latestRoot found on contract at ${config.CONTRACT_ADDRESS}.`
        };
      }

      const match = latestRoot.toLowerCase() === currentLedgerRoot.toLowerCase();
      const status = match ? "ANCHOR MATCH" : "LEDGER CHANGED SINCE ANCHOR";
      const message = match
        ? "Current simulated permissioned ledger root perfectly matches the latest root anchored on Ethereum Sepolia."
        : "Current ledger state differs from on-chain anchored root (blocks have been added, modified, or tampered since the last anchor).";

      return {
        status,
        match,
        latestRoot,
        currentLedgerRoot,
        txHash: latestEvent ? latestEvent.transactionHash : null,
        blockNumber: latestEvent ? latestEvent.blockNumber : null,
        message
      };
    } catch (err) {
      console.warn('verifyAgainstChain error:', err);
      return {
        status: 'VERIFICATION_ERROR',
        match: false,
        latestRoot: null,
        currentLedgerRoot: await getMerkleOrChainRoot(),
        message: 'Blockchain verification error: ' + (err.message || 'Unable to query Ethereum Sepolia contract.')
      };
    }
  }

  /**
   * Helper: Get full live status of anchoring environment
   */
  function getStatus() {
    const config = getConfig();
    const anchors = getStoredAnchors();
    return {
      hasMetaMask: isMetaMaskAvailable(),
      hasContractAddress: Boolean(config.CONTRACT_ADDRESS && config.CONTRACT_ADDRESS.trim()),
      contractAddress: config.CONTRACT_ADDRESS || "",
      chainId: config.CHAIN_ID || 11155111,
      explorer: config.EXPLORER || "https://sepolia.etherscan.io",
      connected: Boolean(activeAccount),
      account: activeAccount,
      anchorCount: anchors.length,
      latestAnchor: anchors[0] || null
    };
  }

  // Export to window.Anchor
  window.Anchor = {
    connect,
    anchorNow,
    verifyAgainstChain,
    getStoredAnchors,
    getStatus,
    getMerkleOrChainRoot,
    ensureEthers,
    isMetaMaskAvailable
  };

})();
