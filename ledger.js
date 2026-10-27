/**
 * ledger.js - Simulated Permissioned Ledger for AICTE-APAAR Platform
 * Shared Contract:
 * window.Ledger = {
 *   async addBlock(type, data) -> block {index, timestamp, type, data, prevHash, hash},
 *   getChain() -> array,
 *   async verifyChain() -> {valid, brokenIndex, reason?},
 *   tamper(index) -> mutates a block's data (for demo),
 *   reset() -> clears chain
 * }
 * 
 * Block types: "ADMISSION", "CANCELLATION", "CERTIFICATE", "FLAG"
 * Storage: localStorage ('aicte_apaar_ledger_chain')
 * Hashing: SHA-256 via crypto.subtle (with reliable JS fallback)
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'aicte_apaar_ledger_chain';
  const GENESIS_PREV_HASH = '0'.repeat(64);

  // Pure JS SHA-256 Fallback to guarantee execution in all runtimes (file://, Node, non-HTTPS)
  function jsSha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    ascii += '\x80';
    while ((ascii.length % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength | 0;
    for (j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash.slice(0);
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
        const t2 = (s0 + maj) | 0;
        const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & hash[5]) ^ (~e & hash[6]);
        const t1 = (hash[7] + s1 + ch + k[i] + (w[i] = (i < 16) ? (w[i] | 0) : (
          w[i - 16] +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          w[i - 7] +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
        ) | 0)) | 0;
        hash = [(t1 + t2) | 0, a, hash[1], hash[2], (hash[3] + t1) | 0, hash[4], hash[5], hash[6]];
      }
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j >= 0; j--) {
        const b = (hash[i] >> (8 * j)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  // SHA-256 Digest using crypto.subtle with fallback
  async function sha256(message) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        return jsSha256(message);
      }
    }
    return jsSha256(message);
  }

  // Deterministic string representation of block data for hashing
  function getBlockPayloadString(block) {
    return `${block.index}|${block.timestamp}|${block.type}|${JSON.stringify(block.data)}|${block.prevHash}`;
  }

  // Compute block hash
  async function computeBlockHash(block) {
    const payload = getBlockPayloadString(block);
    return await sha256(payload);
  }

  // Storage Helpers
  function readStorage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("Ledger: localStorage read failed, falling back to in-memory store", e);
      return null;
    }
  }

  function writeStorage(chain) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
      }
    } catch (e) {
      console.warn("Ledger: localStorage write failed", e);
    }
  }

  let memoryChain = null;

  function getRawChain() {
    const stored = readStorage();
    if (stored && Array.isArray(stored) && stored.length > 0) {
      memoryChain = stored;
      return stored;
    }
    if (memoryChain && memoryChain.length > 0) {
      return memoryChain;
    }
    return null;
  }

  // Create Genesis block synchronously or async
  async function createGenesisBlock() {
    const genesis = {
      index: 0,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "GENESIS",
      data: {
        platform: "AICTE-APAAR",
        title: "National Student Admission & Credential Ledger",
        network: "Simulated Permissioned Ledger",
        description: "Append-only SHA-256 verified audit ledger for AICTE higher education seats"
      },
      prevHash: GENESIS_PREV_HASH,
      hash: ""
    };
    genesis.hash = await computeBlockHash(genesis);
    return genesis;
  }

  // Synchronous init for fallback
  function createGenesisBlockSync() {
    const genesis = {
      index: 0,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "GENESIS",
      data: {
        platform: "AICTE-APAAR",
        title: "National Student Admission & Credential Ledger",
        network: "Simulated Permissioned Ledger",
        description: "Append-only SHA-256 verified audit ledger for AICTE higher education seats"
      },
      prevHash: GENESIS_PREV_HASH,
      hash: ""
    };
    genesis.hash = jsSha256(getBlockPayloadString(genesis));
    return genesis;
  }

  function ensureChain() {
    let chain = getRawChain();
    if (!chain || chain.length === 0) {
      const genesis = createGenesisBlockSync();
      chain = [genesis];
      writeStorage(chain);
      memoryChain = chain;
    }
    return chain;
  }

  // Ledger Public Interface
  const Ledger = {
    /**
     * Appends a new block to the hash chain.
     * @param {string} type - "ADMISSION", "CANCELLATION", "CERTIFICATE", "FLAG"
     * @param {object|any} data - payload
     * @returns {Promise<object>} newly created and hashed block
     */
    async addBlock(type, data) {
      const chain = ensureChain();
      const prevBlock = chain[chain.length - 1];
      
      const newBlock = {
        index: chain.length,
        timestamp: new Date().toISOString(),
        type: String(type || "RECORD").toUpperCase(),
        data: data,
        prevHash: prevBlock ? prevBlock.hash : GENESIS_PREV_HASH,
        hash: ""
      };

      newBlock.hash = await computeBlockHash(newBlock);
      chain.push(newBlock);
      writeStorage(chain);
      memoryChain = chain;

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('ledger:block-added', { detail: { block: newBlock } }));
        window.dispatchEvent(new CustomEvent('ledger:updated', { detail: { chainLength: chain.length } }));
      }

      return newBlock;
    },

    /**
     * Returns a copy of the current chain.
     * @returns {Array<object>}
     */
    getChain() {
      const chain = ensureChain();
      // Return deep clone so caller cannot mutate accidentally without tamper()
      return JSON.parse(JSON.stringify(chain));
    },

    /**
     * Cryptographically verifies the whole chain from genesis to tip.
     * @returns {Promise<{valid: boolean, brokenIndex: number, reason?: string}>}
     */
    async verifyChain() {
      const chain = ensureChain();
      if (!chain || chain.length === 0) {
        return { valid: true, brokenIndex: -1 };
      }

      for (let i = 0; i < chain.length; i++) {
        const block = chain[i];

        // Check index consistency
        if (block.index !== i) {
          return {
            valid: false,
            brokenIndex: i,
            reason: `Index mismatch at block ${i} (found ${block.index})`
          };
        }

        // Check previous hash link
        if (i > 0) {
          const prevBlock = chain[i - 1];
          if (block.prevHash !== prevBlock.hash) {
            return {
              valid: false,
              brokenIndex: i,
              reason: `Chain broken: Block #${i} prevHash does not match Block #${i - 1} hash`
            };
          }
        } else {
          if (block.prevHash !== GENESIS_PREV_HASH) {
            return {
              valid: false,
              brokenIndex: 0,
              reason: `Genesis block prevHash corrupted`
            };
          }
        }

        // Recompute and verify cryptographic hash
        const expectedHash = await computeBlockHash(block);
        if (block.hash !== expectedHash) {
          return {
            valid: false,
            brokenIndex: i,
            reason: `Hash mismatch at block #${i}: Data payload was mutated/tampered`
          };
        }
      }

      return { valid: true, brokenIndex: -1 };
    },

    /**
     * Mutates a block's data for demo verification of cryptographic tamper detection.
     * @param {number} index - Index of block to tamper
     * @returns {boolean}
     */
    tamper(index) {
      const chain = ensureChain();
      if (typeof index !== 'number' || index < 0 || index >= chain.length) {
        console.warn(`Ledger.tamper: Invalid index ${index}`);
        return false;
      }

      const target = chain[index];
      if (typeof target.data === 'object' && target.data !== null) {
        target.data = {
          ...target.data,
          __tampered: true,
          _fraudAlert: "UNAUTHORIZED_RETROACTIVE_MUTATION",
          tamperedAt: new Date().toISOString()
        };
        if (target.data.name) {
          target.data.name = target.data.name + " [FRAUDULENT]";
        }
        if (target.data.rollNo) {
          target.data.rollNo = "TAMPERED-ROLL-999";
        }
      } else {
        target.data = "TAMPERED_DATA_" + String(target.data);
      }

      writeStorage(chain);
      memoryChain = chain;

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('ledger:tampered', { detail: { index } }));
        window.dispatchEvent(new CustomEvent('ledger:updated'));
      }

      return true;
    },

    /**
     * Clears the ledger and re-initializes genesis.
     */
    reset() {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      memoryChain = null;
      ensureChain();

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('ledger:reset'));
        window.dispatchEvent(new CustomEvent('ledger:updated'));
      }
    },

    /**
     * Compute hash helper for external callers (e.g. certs)
     */
    async hash(stringOrObj) {
      const str = typeof stringOrObj === 'string' ? stringOrObj : JSON.stringify(stringOrObj);
      return await sha256(str);
    }
  };

  // Export to window
  window.Ledger = Ledger;

  // Initial genesis check
  ensureChain();
})();
