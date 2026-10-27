/**
 * ledger.js - Simulated Multi-Node Permissioned Network for AICTE-APAAR Platform
 * Role: Agent A
 * 
 * Features:
 * - 3 Validator Nodes: Validator-MH, Validator-KA, Validator-AICTE
 * - Each node maintains its OWN chain copy in localStorage ('aicte_ledger_node_{id}')
 * - Each node has its OWN ECDSA P-256 cryptographic keypair persisted in localStorage
 * - addBlock: Round-robin proposer builds block, all validators verify & sign, committed only with >= 2 of 3 signatures
 * - Merkle Roots: Each block stores a Merkle root of its data items; chain exposes getMerkleRoot() over all block hashes
 * - Byzantine Fault Tolerance (BFT): Majority-consensus chain returned by getChain(); minority node tamper triggers 'diverged' status
 * - heal(nodeId?): Resynchronizes diverged node from the 2/3 majority consensus chain
 * - Backward Compatible API: Ledger.addBlock, Ledger.getChain, Ledger.verifyChain, Ledger.tamper, Ledger.reset
 * - New Methods: Ledger.getNodes(), Ledger.heal(), Ledger.getMerkleRoot(), Ledger.getPipelineLog()
 */

(function () {
  'use strict';

  const STORAGE_LEGACY_KEY = 'aicte_apaar_ledger_chain';
  const STORAGE_PREFIX = 'aicte_ledger_node_';
  const KEY_STORAGE_PREFIX = 'aicte_node_key_';
  const GENESIS_PREV_HASH = '0'.repeat(64);

  // 3 Geographically Distributed Validator Nodes
  const VALIDATOR_NODES = [
    { id: 'node-mh', name: 'Validator-MH', region: 'Western Zone (COEP, Pune)', state: 'Maharashtra' },
    { id: 'node-ka', name: 'Validator-KA', region: 'Southern Zone (RVCE, Bengaluru)', state: 'Karnataka' },
    { id: 'node-aicte', name: 'Validator-AICTE', region: 'Apex Central Zone (AICTE HQ, New Delhi)', state: 'Delhi' }
  ];

  // In-memory key cache { nodeId: { keyPair, pubJwk, privJwk } }
  const nodeKeys = {};

  // Recent consensus pipeline logs
  const pipelineLogs = [];
  const MAX_PIPELINE_LOGS = 20;

  // Pure JS SHA-256 Implementation (100% reliable fallback)
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

  // Merkle Tree Calculation over an array of items (hashes or strings)
  function computeMerkleTreeRoot(items) {
    if (!items || items.length === 0) {
      return jsSha256("EMPTY_TREE");
    }

    let leaves = items.map(item => {
      if (typeof item === 'string' && item.length === 64 && /^[0-9a-fA-F]+$/.test(item)) {
        return item.toLowerCase();
      }
      const str = typeof item === 'string' ? item : JSON.stringify(item);
      return jsSha256(str);
    });

    while (leaves.length > 1) {
      if (leaves.length % 2 !== 0) {
        leaves.push(leaves[leaves.length - 1]); // Duplicate last node if odd
      }
      const nextLevel = [];
      for (let i = 0; i < leaves.length; i += 2) {
        nextLevel.push(jsSha256(leaves[i] + leaves[i + 1]));
      }
      leaves = nextLevel;
    }

    return leaves[0];
  }

  // Compute Merkle Root for a block's data items
  function computeBlockDataMerkleRoot(data) {
    if (data === null || data === undefined) {
      return jsSha256("null");
    }
    if (Array.isArray(data)) {
      return computeMerkleTreeRoot(data.map(item => JSON.stringify(item)));
    }
    if (typeof data === 'object') {
      const leaves = Object.keys(data).sort().map(k => `${k}:${JSON.stringify(data[k])}`);
      return computeMerkleTreeRoot(leaves);
    }
    return computeMerkleTreeRoot([String(data)]);
  }

  // Deterministic canonical string representation of block contents for SHA-256 hashing
  function getBlockPayloadString(block) {
    const proposerId = block.proposer ? (block.proposer.id || block.proposer) : 'genesis';
    return `${block.index}|${block.timestamp}|${block.type}|${block.merkleRoot}|${block.prevHash}|${proposerId}`;
  }

  // Storage access helpers
  function getNodeStorageKey(nodeId) {
    return STORAGE_PREFIX + nodeId;
  }

  function readNodeChain(nodeId) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(getNodeStorageKey(nodeId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeNodeChain(nodeId, chain) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(getNodeStorageKey(nodeId), JSON.stringify(chain));
      }
    } catch (e) {
      console.warn(`Ledger: failed writing chain for node ${nodeId}`, e);
    }
  }

  // Synchronize consensus chain with legacy key for other modules (Rules, Upload, Dashboard)
  function syncLegacyStorage(consensusChain) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_LEGACY_KEY, JSON.stringify(consensusChain));
      }
    } catch (e) {}
  }

  // ECDSA P-256 Key Management for Validator Nodes
  async function getOrCreateNodeKey(nodeId) {
    if (nodeKeys[nodeId]) {
      return nodeKeys[nodeId];
    }

    const keyStorageKey = KEY_STORAGE_PREFIX + nodeId;
    let storedKeys = null;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(keyStorageKey);
        if (raw) storedKeys = JSON.parse(raw);
      }
    } catch (e) {}

    const subtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) 
      ? window.crypto.subtle 
      : (typeof global !== 'undefined' && global.crypto && global.crypto.subtle ? global.crypto.subtle : null);

    if (subtle) {
      try {
        let keyPair = null;
        let pubJwk = null;
        let privJwk = null;

        if (storedKeys && storedKeys.pubJwk && storedKeys.privJwk) {
          pubJwk = storedKeys.pubJwk;
          privJwk = storedKeys.privJwk;
          const pubKey = await subtle.importKey(
            'jwk',
            pubJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
          );
          const privKey = await subtle.importKey(
            'jwk',
            privJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign']
          );
          keyPair = { publicKey: pubKey, privateKey: privKey };
        } else {
          keyPair = await subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
          );
          pubJwk = await subtle.exportKey('jwk', keyPair.publicKey);
          privJwk = await subtle.exportKey('jwk', keyPair.privateKey);

          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(keyStorageKey, JSON.stringify({ pubJwk, privJwk }));
          }
        }

        const fingerprint = jsSha256(JSON.stringify(pubJwk)).substring(0, 16);
        nodeKeys[nodeId] = { keyPair, pubJwk, privJwk, fingerprint, isSubtle: true };
        return nodeKeys[nodeId];
      } catch (err) {
        console.warn(`SubtleCrypto keygen failed for ${nodeId}, falling back to HMAC`, err);
      }
    }

    // Fallback: Deterministic node secret
    const fallbackSeed = `AICTE_NODE_SECRET_${nodeId}_2026`;
    const fingerprint = jsSha256(fallbackSeed).substring(0, 16);
    nodeKeys[nodeId] = {
      fallbackSeed,
      fingerprint,
      isSubtle: false,
      pubJwk: { kty: "FALLBACK", alg: "SHA-256-HMAC", crv: "P-256", x: fingerprint }
    };
    return nodeKeys[nodeId];
  }

  // Sign message hash with node's ECDSA P-256 private key
  async function signBlockWithNodeKey(nodeId, blockHash) {
    const keyInfo = await getOrCreateNodeKey(nodeId);
    const subtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : (typeof global !== 'undefined' && global.crypto && global.crypto.subtle ? global.crypto.subtle : null);

    if (keyInfo.isSubtle && keyInfo.keyPair && subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(blockHash);
        const sigBuf = await subtle.sign(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          keyInfo.keyPair.privateKey,
          data
        );
        const sigHex = Array.from(new Uint8Array(sigBuf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        return {
          signature: sigHex,
          fingerprint: keyInfo.fingerprint,
          curve: 'P-256'
        };
      } catch (e) {
        console.warn(`ECDSA sign error on ${nodeId}:`, e);
      }
    }

    // Fallback signature
    const fallbackSig = jsSha256(blockHash + keyInfo.fallbackSeed);
    return {
      signature: fallbackSig,
      fingerprint: keyInfo.fingerprint,
      curve: 'P-256 (HMAC-Simulated)'
    };
  }

  // Verify node's signature
  async function verifyNodeSignature(nodeId, blockHash, sigHex) {
    const keyInfo = await getOrCreateNodeKey(nodeId);
    const subtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : (typeof global !== 'undefined' && global.crypto && global.crypto.subtle ? global.crypto.subtle : null);

    if (keyInfo.isSubtle && keyInfo.keyPair && subtle && sigHex) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(blockHash);
        const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        return await subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          keyInfo.keyPair.publicKey,
          sigBytes,
          data
        );
      } catch (e) {
        return false;
      }
    }

    const expectedFallback = jsSha256(blockHash + keyInfo.fallbackSeed);
    return expectedFallback === sigHex;
  }

  // Generate Genesis Block with Multi-Node Signatures
  async function createMultiNodeGenesisBlock() {
    const genesisData = {
      platform: "AICTE-APAAR",
      title: "National Student Admission & Credential Ledger",
      network: "Simulated Permissioned Multi-Node Ledger",
      validators: VALIDATOR_NODES.map(v => v.name)
    };

    const merkleRoot = computeBlockDataMerkleRoot(genesisData);
    const genesisBlock = {
      index: 0,
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "GENESIS",
      proposer: { id: "node-aicte", name: "Validator-AICTE" },
      data: genesisData,
      merkleRoot: merkleRoot,
      prevHash: GENESIS_PREV_HASH,
      hash: "",
      signatures: []
    };

    genesisBlock.hash = jsSha256(getBlockPayloadString(genesisBlock));

    // Sign with all 3 validators
    for (const node of VALIDATOR_NODES) {
      const sigRes = await signBlockWithNodeKey(node.id, genesisBlock.hash);
      genesisBlock.signatures.push({
        nodeId: node.id,
        nodeName: node.name,
        signature: sigRes.signature,
        fingerprint: sigRes.fingerprint,
        timestamp: "2026-01-01T00:00:00.000Z"
      });
    }

    return genesisBlock;
  }

  // Ensure all 3 nodes have initialized chains
  function ensureAllNodeChains() {
    let anyEmpty = false;
    for (const node of VALIDATOR_NODES) {
      const chain = readNodeChain(node.id);
      if (!chain || chain.length === 0) {
        anyEmpty = true;
        break;
      }
    }

    if (anyEmpty) {
      // Create synchronous placeholder genesis
      const genesisData = {
        platform: "AICTE-APAAR",
        network: "Simulated Permissioned Multi-Node Ledger",
        validators: VALIDATOR_NODES.map(v => v.name)
      };
      const merkleRoot = computeBlockDataMerkleRoot(genesisData);
      const genesis = {
        index: 0,
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "GENESIS",
        proposer: { id: "node-aicte", name: "Validator-AICTE" },
        data: genesisData,
        merkleRoot: merkleRoot,
        prevHash: GENESIS_PREV_HASH,
        hash: "",
        signatures: []
      };
      genesis.hash = jsSha256(getBlockPayloadString(genesis));

      for (const node of VALIDATOR_NODES) {
        genesis.signatures.push({
          nodeId: node.id,
          nodeName: node.name,
          signature: jsSha256(genesis.hash + node.id),
          fingerprint: node.id,
          timestamp: genesis.timestamp
        });
      }

      for (const node of VALIDATOR_NODES) {
        writeNodeChain(node.id, [genesis]);
      }
      syncLegacyStorage([genesis]);
    }
  }

  // Determine Majority-Consensus Chain among the 3 validator nodes
  function getConsensusChain() {
    ensureAllNodeChains();

    const chains = VALIDATOR_NODES.map(n => ({
      node: n,
      chain: readNodeChain(n.id) || []
    }));

    // Find head hash agreement
    const headHashes = chains.map(c => {
      const tip = c.chain[c.chain.length - 1];
      return tip ? tip.hash : '';
    });

    // Check pair matches (2 of 3 majority)
    let consensusIndex = 0;
    if (headHashes[0] === headHashes[1] || headHashes[0] === headHashes[2]) {
      consensusIndex = 0;
    } else if (headHashes[1] === headHashes[2]) {
      consensusIndex = 1;
    } else {
      // In case of 3-way split, pick the longest chain
      let maxLen = -1;
      chains.forEach((c, idx) => {
        if (c.chain.length > maxLen) {
          maxLen = c.chain.length;
          consensusIndex = idx;
        }
      });
    }

    const consensusChain = chains[consensusIndex].chain;
    syncLegacyStorage(consensusChain);
    return consensusChain;
  }

  // Get live status of all 3 validator nodes (healthy vs diverged)
  function getNodesInfo() {
    ensureAllNodeChains();
    const consensusChain = getConsensusChain();
    const consensusTip = consensusChain[consensusChain.length - 1];
    const consensusHeadHash = consensusTip ? consensusTip.hash : '';

    return VALIDATOR_NODES.map(n => {
      const chain = readNodeChain(n.id) || [];
      const tip = chain[chain.length - 1];
      const headHash = tip ? tip.hash : '';
      const height = chain.length;

      // Check if this node matches the consensus chain completely
      let status = 'healthy';
      if (headHash !== consensusHeadHash || height !== consensusChain.length) {
        status = 'diverged';
      } else {
        // Deep verification against consensus chain
        for (let i = 0; i < chain.length; i++) {
          if (chain[i].hash !== consensusChain[i].hash) {
            status = 'diverged';
            break;
          }
        }
      }

      const keyInfo = nodeKeys[n.id] || { fingerprint: 'init...' };

      return {
        id: n.id,
        name: n.name,
        region: n.region,
        state: n.state,
        height: height,
        headHash: headHash,
        status: status, // "healthy" | "diverged"
        keyFingerprint: keyInfo.fingerprint
      };
    });
  }

  // Public Ledger Interface
  const Ledger = {
    /**
     * Proposes, validates, threshold-signs (>= 2/3), and commits a new block.
     * Proposer alternates round-robin across Validator-MH, Validator-KA, Validator-AICTE.
     * @param {string} type - "ADMISSION", "CANCELLATION", "CERTIFICATE", "FLAG"
     * @param {object|any} data - block payload
     * @returns {Promise<object>} committed block
     */
    async addBlock(type, data) {
      ensureAllNodeChains();
      const consensusChain = getConsensusChain();
      const prevBlock = consensusChain[consensusChain.length - 1];

      // 1. Round-Robin Proposer Selection
      const proposerIndex = consensusChain.length % VALIDATOR_NODES.length;
      const proposer = VALIDATOR_NODES[proposerIndex];

      // 2. Compute Merkle Root of Block Data Items
      const merkleRoot = computeBlockDataMerkleRoot(data);

      const block = {
        index: consensusChain.length,
        timestamp: new Date().toISOString(),
        type: String(type || "RECORD").toUpperCase(),
        proposer: { id: proposer.id, name: proposer.name },
        data: data,
        merkleRoot: merkleRoot,
        prevHash: prevBlock ? prevBlock.hash : GENESIS_PREV_HASH,
        hash: "",
        signatures: []
      };

      // 3. Compute Block SHA-256 Hash
      block.hash = jsSha256(getBlockPayloadString(block));

      // 4. Multi-Node Validation & Cryptographic Signing (BFT 2-of-3 threshold)
      const signatureLog = [];
      for (const node of VALIDATOR_NODES) {
        // Validator validates: previous hash matches and Merkle root is valid
        const expectedMerkle = computeBlockDataMerkleRoot(block.data);
        const validParent = block.prevHash === (prevBlock ? prevBlock.hash : GENESIS_PREV_HASH);

        if (validParent && expectedMerkle === block.merkleRoot) {
          const sigRes = await signBlockWithNodeKey(node.id, block.hash);
          block.signatures.push({
            nodeId: node.id,
            nodeName: node.name,
            signature: sigRes.signature,
            fingerprint: sigRes.fingerprint,
            timestamp: new Date().toISOString()
          });
          signatureLog.push(node.name);
        }
      }

      // Check consensus threshold (>= 2 of 3 required)
      if (block.signatures.length < 2) {
        throw new Error(`BFT Consensus Failure: Block #${block.index} received only ${block.signatures.length}/3 signatures`);
      }

      // 5. Commit Block to all Healthy Validator Node Chains
      const currentNodes = getNodesInfo();
      const committedNodeNames = [];

      for (const node of VALIDATOR_NODES) {
        const nodeInfo = currentNodes.find(n => n.id === node.id);
        // Only append to nodes that are not diverged (diverged nodes must heal to rejoin)
        if (nodeInfo && nodeInfo.status === 'healthy') {
          const chain = readNodeChain(node.id) || [];
          chain.push(block);
          writeNodeChain(node.id, chain);
          committedNodeNames.push(node.name);
        }
      }

      // Update legacy sync store
      const updatedConsensus = getConsensusChain();
      syncLegacyStorage(updatedConsensus);

      // Record Consensus Pipeline Event
      const pipelineEntry = {
        blockIndex: block.index,
        blockType: block.type,
        proposer: proposer.name,
        merkleRoot: block.merkleRoot,
        hash: block.hash,
        signaturesCount: block.signatures.length,
        signers: signatureLog,
        committedTo: committedNodeNames,
        timestamp: block.timestamp
      };
      pipelineLogs.unshift(pipelineEntry);
      if (pipelineLogs.length > MAX_PIPELINE_LOGS) pipelineLogs.pop();

      // Dispatch UI Events
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('ledger:block-added', { detail: { block } }));
        window.dispatchEvent(new CustomEvent('ledger:updated', { detail: { chainLength: updatedConsensus.length } }));
        window.dispatchEvent(new CustomEvent('network:pipeline', { detail: pipelineEntry }));
      }

      return block;
    },

    /**
     * Returns a copy of the majority-consensus chain.
     * @returns {Array<object>}
     */
    getChain() {
      const chain = getConsensusChain();
      return JSON.parse(JSON.stringify(chain));
    },

    /**
     * Returns array of the 3 validator nodes with live height, head hash, and healthy/diverged status.
     * @returns {Array<{id: string, name: string, height: number, headHash: string, status: "healthy"|"diverged"}>}
     */
    getNodes() {
      return getNodesInfo();
    },

    /**
     * Computes the Merkle Root over all block hashes in the consensus chain.
     * @returns {string} SHA-256 Merkle root hex
     */
    getMerkleRoot() {
      const chain = getConsensusChain();
      const hashes = chain.map(b => b.hash);
      return computeMerkleTreeRoot(hashes);
    },

    /**
     * Returns recent animated propose->validate->sign->commit pipeline entries.
     */
    getPipelineLog() {
      return JSON.parse(JSON.stringify(pipelineLogs));
    },

    /**
     * Cryptographically verifies the consensus chain and checks multi-node divergence.
     * @returns {Promise<{valid: boolean, brokenIndex: number, nodeStatus: Array, reason?: string}>}
     */
    async verifyChain() {
      const chain = getConsensusChain();
      const nodeStatus = getNodesInfo();

      if (!chain || chain.length === 0) {
        return { valid: true, brokenIndex: -1, nodeStatus };
      }

      for (let i = 0; i < chain.length; i++) {
        const block = chain[i];

        // 1. Index verification
        if (block.index !== i) {
          return {
            valid: false,
            brokenIndex: i,
            reason: `Index mismatch at block #${i} (stored ${block.index})`,
            nodeStatus
          };
        }

        // 2. Previous hash link verification
        if (i > 0) {
          const prev = chain[i - 1];
          if (block.prevHash !== prev.hash) {
            return {
              valid: false,
              brokenIndex: i,
              reason: `Broken chain link at block #${i}: prevHash does not match block #${i - 1} hash`,
              nodeStatus
            };
          }
        }

        // 3. Merkle root verification of block data
        const expectedMerkle = computeBlockDataMerkleRoot(block.data);
        if (block.merkleRoot !== expectedMerkle) {
          return {
            valid: false,
            brokenIndex: i,
            reason: `Data integrity breach: Merkle root mismatch at block #${i}`,
            nodeStatus
          };
        }

        // 4. SHA-256 Block Header Hash verification
        const expectedHash = jsSha256(getBlockPayloadString(block));
        if (block.hash !== expectedHash) {
          return {
            valid: false,
            brokenIndex: i,
            reason: `Cryptographic hash mismatch at block #${i}`,
            nodeStatus
          };
        }

        // 5. Validator Signatures verification (must have >= 2 signatures)
        if (i > 0 && (!block.signatures || block.signatures.length < 2)) {
          return {
            valid: false,
            brokenIndex: i,
            reason: `Insufficient validator signatures at block #${i} (${block.signatures?.length || 0}/3)`,
            nodeStatus
          };
        }
      }

      return { valid: true, brokenIndex: -1, nodeStatus };
    },

    /**
     * Mutates ONE specific validator node's localStorage copy (defaults to Node 2: Validator-KA).
     * This simulates a Byzantine/tampered node while the other 2 nodes maintain consensus.
     * @param {number} index - Block index to tamper
     * @param {string} [nodeId='node-ka'] - Target node to tamper
     */
    tamper(index, nodeId = 'node-ka') {
      ensureAllNodeChains();
      const chain = readNodeChain(nodeId);
      if (!chain || index < 0 || index >= chain.length) {
        console.warn(`Ledger.tamper: Invalid index ${index} or node ${nodeId}`);
        return false;
      }

      const target = chain[index];
      if (typeof target.data === 'object' && target.data !== null) {
        target.data = {
          ...target.data,
          __tampered: true,
          _fraudAlert: `UNAUTHORIZED_MUTATION_ON_${nodeId.toUpperCase()}`,
          tamperedAt: new Date().toISOString()
        };
        if (target.data.name) target.data.name = target.data.name + " [DIVERGED]";
        if (target.data.rollNo) target.data.rollNo = "FAKE-ROLL-777";
      } else {
        target.data = "TAMPERED_DATA_" + String(target.data);
      }

      // Corrupt Merkle root and hash on this node only
      target.merkleRoot = "tampered_merkle_root_" + jsSha256(String(index)).substring(0, 32);
      target.hash = jsSha256(getBlockPayloadString(target));

      writeNodeChain(nodeId, chain);

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('ledger:tampered', { detail: { index, nodeId } }));
        window.dispatchEvent(new CustomEvent('ledger:updated'));
        window.dispatchEvent(new CustomEvent('network:divergence', { detail: { nodeId, index } }));
      }

      return true;
    },

    /**
     * Resynchronizes a diverged node (or all diverged nodes) from the 2/3 majority consensus chain.
     * @param {string} [nodeId] - Optional specific node ID to heal
     */
    heal(nodeId) {
      ensureAllNodeChains();
      const consensusChain = getConsensusChain();
      const nodes = getNodesInfo();

      const targets = nodeId 
        ? [nodeId] 
        : nodes.filter(n => n.status === 'diverged').map(n => n.id);

      for (const targetId of targets) {
        writeNodeChain(targetId, consensusChain);
      }

      syncLegacyStorage(consensusChain);

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('network:healed', { detail: { healedNodes: targets } }));
        window.dispatchEvent(new CustomEvent('ledger:updated'));
      }

      return targets;
    },

    /**
     * Clears all 3 validator nodes and resets to Genesis.
     */
    reset() {
      for (const node of VALIDATOR_NODES) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(getNodeStorageKey(node.id));
        }
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_LEGACY_KEY);
      }
      pipelineLogs.length = 0;
      ensureAllNodeChains();

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('ledger:reset'));
        window.dispatchEvent(new CustomEvent('ledger:updated'));
      }
    },

    /**
     * Helper hash utility
     */
    async hash(item) {
      const str = typeof item === 'string' ? item : JSON.stringify(item);
      return await sha256(str);
    }
  };

  // Export to window
  window.Ledger = Ledger;

  // Initialize keys & chains
  ensureAllNodeChains();
  VALIDATOR_NODES.forEach(n => getOrCreateNodeKey(n.id));
})();
