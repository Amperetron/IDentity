/**
 * api/blocks.js - Multi-Node Permissioned Blockchain Serverless Endpoint
 *
 * Handles:
 * - GET ?room=<id> -> Returns room's blocks ordered by idx
 * - POST { room, block } -> Validates shape, size, idx sequence, prevHash, Merkle root,
 *                           block hash, and verifies >=2 of 3 validator ECDSA P-256 signatures.
 *                           Atomically inserts into Supabase using service role key.
 * - Rate limits per client IP in-memory
 * - Returns 409 on index conflict, 400 on malformed input
 *
 * Secrets: Reads process.env.SUPABASE_URL and process.env.SUPABASE_SERVICE_KEY (never logged).
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// WebCrypto subtle for fast ECDSA P-256 verification
const subtle = crypto.webcrypto?.subtle || globalThis.crypto?.subtle;

// In-Memory Rate Limiting Map per IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests/minute per IP
const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB limit

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Initialize Supabase client using Service Role Key
 * Secrets read strictly from process.env and never logged.
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_CONFIG_MISSING');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * SHA-256 Hex Digest Helper
 */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Merkle Tree Root calculation across items
 * Must exactly match the canonical algorithm in ledger.js
 */
function computeMerkleTreeRoot(items) {
  if (!items || items.length === 0) {
    return sha256("EMPTY_TREE");
  }

  let leaves = items.map(item => {
    if (typeof item === "string" && item.length === 64 && /^[0-9a-fA-F]+$/.test(item)) {
      return item.toLowerCase();
    }
    const str = typeof item === "string" ? item : JSON.stringify(item);
    return sha256(str);
  });

  while (leaves.length > 1) {
    if (leaves.length % 2 !== 0) {
      leaves.push(leaves[leaves.length - 1]); // Duplicate last node if odd
    }
    const nextLevel = [];
    for (let i = 0; i < leaves.length; i += 2) {
      nextLevel.push(sha256(leaves[i] + leaves[i + 1]));
    }
    leaves = nextLevel;
  }

  return leaves[0];
}

/**
 * Compute Merkle root for block data payload
 */
function computeBlockDataMerkleRoot(data) {
  if (data === null || data === undefined) {
    return sha256("null");
  }
  if (Array.isArray(data)) {
    return computeMerkleTreeRoot(data.map(item => JSON.stringify(item)));
  }
  if (typeof data === "object") {
    const leaves = Object.keys(data).sort().map(k => k + ":" + JSON.stringify(data[k]));
    return computeMerkleTreeRoot(leaves);
  }
  return computeMerkleTreeRoot([String(data)]);
}

/**
 * Deterministic canonical string representation of block contents for SHA-256 header hashing
 */
function getBlockPayloadString(block) {
  const proposerId = block.proposer ? (block.proposer.id || block.proposer) : "genesis";
  return block.index + "|" + block.timestamp + "|" + block.type + "|" + block.merkleRoot + "|" + block.prevHash + "|" + proposerId;
}

/**
 * Verify ECDSA P-256 signature using WebCrypto or Node.js crypto
 * Supports JWK, SPKI, and PEM formats
 */
async function verifyECDSASignature(publicKey, message, sigHex) {
  if (!publicKey || !message || !sigHex || typeof sigHex !== 'string') {
    return false;
  }
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const sigBytes = Buffer.from(sigHex, 'hex');

    let parsed = publicKey;
    if (typeof publicKey === 'string') {
      try {
        parsed = JSON.parse(publicKey);
      } catch (e) {
        // String might be PEM or base64 SPKI
      }
    }

    if (typeof parsed === 'object' && parsed !== null && parsed.kty === 'EC') {
      if (subtle) {
        const key = await subtle.importKey(
          'jwk',
          parsed,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );
        return await subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          key,
          sigBytes,
          data
        );
      }
    }

    // Node.js crypto fallback
    const keyObj = crypto.createPublicKey(publicKey);
    const isDer = sigBytes[0] === 0x30;
    return crypto.verify(
      'SHA256',
      data,
      { key: keyObj, dsaEncoding: isDer ? 'der' : 'ieee-p1363' },
      sigBytes
    );
  } catch (err) {
    return false;
  }
}

/**
 * Find public key for a validator signature from block metadata
 */
function findPublicKeyForValidator(block, sig) {
  const nodeId = sig.nodeId || sig.nodeName;

  // 1. In signature object directly
  if (sig.publicKey) return sig.publicKey;
  if (sig.pubJwk) return sig.pubJwk;
  if (sig.key) return sig.key;

  // 2. In block.publicKeys (object or array)
  if (block.publicKeys) {
    if (typeof block.publicKeys === 'object' && !Array.isArray(block.publicKeys)) {
      if (block.publicKeys[nodeId]) return block.publicKeys[nodeId];
      if (sig.nodeId && block.publicKeys[sig.nodeId]) return block.publicKeys[sig.nodeId];
      if (sig.nodeName && block.publicKeys[sig.nodeName]) return block.publicKeys[sig.nodeName];
    } else if (Array.isArray(block.publicKeys)) {
      const found = block.publicKeys.find(k => k.id === nodeId || k.nodeId === nodeId || k.name === nodeId);
      if (found && (found.publicKey || found.pubJwk || found.key)) {
        return found.publicKey || found.pubJwk || found.key;
      }
    }
  }

  // 3. In block.validators (array)
  if (Array.isArray(block.validators)) {
    const v = block.validators.find(val => val.id === nodeId || val.nodeId === nodeId || val.name === nodeId);
    if (v && (v.publicKey || v.pubJwk || v.key)) {
      return v.publicKey || v.pubJwk || v.key;
    }
  }

  // 4. In block.data.validators
  if (block.data && Array.isArray(block.data.validators)) {
    const v = block.data.validators.find(val => val.id === nodeId || val.nodeId === nodeId || val.name === nodeId);
    if (v && (v.publicKey || v.pubJwk || v.key)) {
      return v.publicKey || v.pubJwk || v.key;
    }
  }

  return null;
}

module.exports = async (req, res) => {
  // Set CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Rate Limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
  }

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (err) {
    return res.status(500).json({ error: 'Server database configuration is incomplete' });
  }

  // =========================================================================
  // 1. GET /api/blocks?room=<id>
  // =========================================================================
  if (req.method === 'GET') {
    const roomParam = req.query && req.query.room;
    if (!roomParam || typeof roomParam !== 'string' || !roomParam.trim()) {
      return res.status(400).json({ error: 'Missing or empty query parameter: room' });
    }

    const room = roomParam.trim();
    if (room.length > 100 || !/^[a-zA-Z0-9_\-\.]+$/.test(room)) {
      return res.status(400).json({ error: 'Invalid room identifier format' });
    }

    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('idx, block')
        .eq('room', room)
        .order('idx', { ascending: true });

      if (error) {
        return res.status(500).json({ error: 'Failed to query room blocks from database' });
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(data ? data.map(r => r.block) : []);
    } catch (err) {
      return res.status(500).json({ error: 'Unexpected error retrieving blocks' });
    }
  }

  // =========================================================================
  // 2. POST /api/blocks { room, block }
  // =========================================================================
  if (req.method === 'POST') {
    // Validate request size
    let rawBody = req.body;
    let bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    if (!bodyStr || bodyStr.length > MAX_PAYLOAD_BYTES) {
      return res.status(400).json({ error: 'Payload exceeds maximum allowed size (1 MB)' });
    }

    // Parse Body
    let body = rawBody;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Malformed JSON payload' });
      }
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Body must be a JSON object containing { room, block }' });
    }

    // Validate room
    const room = typeof body.room === 'string' ? body.room.trim() : null;
    if (!room || room.length > 100 || !/^[a-zA-Z0-9_\-\.]+$/.test(room)) {
      return res.status(400).json({ error: 'Invalid or missing room parameter' });
    }

    // Validate block shape
    const block = body.block;
    if (!block || typeof block !== 'object') {
      return res.status(400).json({ error: 'Missing or malformed block object' });
    }

    if (typeof block.index !== 'number' || !Number.isInteger(block.index) || block.index < 0) {
      return res.status(400).json({ error: 'Invalid block.index (must be integer >= 0)' });
    }

    if (!block.timestamp || typeof block.timestamp !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing block.timestamp' });
    }

    if (!block.type || typeof block.type !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing block.type' });
    }

    if (!block.prevHash || typeof block.prevHash !== 'string' || block.prevHash.length !== 64) {
      return res.status(400).json({ error: 'Invalid block.prevHash (must be 64-char hex)' });
    }

    if (!block.hash || typeof block.hash !== 'string' || block.hash.length !== 64) {
      return res.status(400).json({ error: 'Invalid block.hash (must be 64-char hex)' });
    }

    if (!block.merkleRoot || typeof block.merkleRoot !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing block.merkleRoot' });
    }

    if (!Array.isArray(block.signatures) || block.signatures.length < 2) {
      return res.status(400).json({ error: 'Block must contain at least 2 validator signatures' });
    }

    try {
      // 1. Check idx sequence and prevHash against stored last block
      const { data: lastRows, error: fetchErr } = await supabase
        .from('blocks')
        .select('idx, block')
        .eq('room', room)
        .order('idx', { ascending: false })
        .limit(1);

      if (fetchErr) {
        return res.status(500).json({ error: 'Failed to inspect current chain state' });
      }

      if (!lastRows || lastRows.length === 0) {
        // Room has no blocks yet: Must be Genesis block (index 0)
        if (block.index !== 0) {
          return res.status(400).json({ error: 'First block in room must have index=0' });
        }
        if (block.prevHash !== '0'.repeat(64)) {
          return res.status(400).json({ error: 'Genesis block prevHash must be 64 zeros' });
        }
      } else {
        const last = lastRows[0];
        const lastIdx = Number(last.idx);
        const lastHash = last.block && last.block.hash;

        // Check for index conflict (idx <= lastIdx)
        if (block.index <= lastIdx) {
          return res.status(409).json({
            error: `Index conflict: block #${block.index} already exists on chain`,
            lastIdx: lastIdx,
            attemptedIdx: block.index
          });
        }

        // Check idx is exactly last + 1
        if (block.index !== lastIdx + 1) {
          return res.status(400).json({
            error: `Block index sequence error: expected idx=${lastIdx + 1}, received ${block.index}`
          });
        }

        // Check prevHash matches the stored last block's hash
        if (block.prevHash !== lastHash) {
          return res.status(400).json({
            error: `prevHash mismatch: block #${block.index} prevHash (${block.prevHash}) does not match last block #${lastIdx} hash (${lastHash})`
          });
        }
      }

      // 2. Recompute Merkle root of block data items
      const expectedMerkleRoot = computeBlockDataMerkleRoot(block.data);
      if (block.merkleRoot !== expectedMerkleRoot) {
        return res.status(400).json({
          error: 'Data integrity violation: recomputed Merkle root does not match block.merkleRoot',
          expected: expectedMerkleRoot,
          received: block.merkleRoot
        });
      }

      // 3. Recompute Block Header SHA-256 Hash
      const expectedHash = sha256(getBlockPayloadString(block));
      if (block.hash !== expectedHash) {
        return res.status(400).json({
          error: 'Header hash mismatch: recomputed SHA-256 does not match block.hash',
          expected: expectedHash,
          received: block.hash
        });
      }

      // 4. Verify >=2 of 3 validator ECDSA P-256 signatures against public keys listed in block
      const verifiedNodeIds = new Set();
      for (const sig of block.signatures) {
        const nodeId = sig.nodeId || sig.nodeName;
        if (!nodeId || verifiedNodeIds.has(nodeId)) continue;

        const pubKey = findPublicKeyForValidator(block, sig);
        if (!pubKey) continue;

        const isValid = await verifyECDSASignature(pubKey, block.hash, sig.signature);
        if (isValid) {
          verifiedNodeIds.add(nodeId);
        }
      }

      if (verifiedNodeIds.size < 2) {
        return res.status(400).json({
          error: `BFT Consensus Failure: Block #${block.index} verified only ${verifiedNodeIds.size}/3 validator signatures against listed public keys (minimum 2 required)`,
          verifiedSignaturesCount: verifiedNodeIds.size
        });
      }

      // 5. Insert block into database using Service Key
      const { error: insertErr, status: insertStatus } = await supabase
        .from('blocks')
        .insert({
          room: room,
          idx: block.index,
          block: block
        });

      if (insertErr) {
        if (insertErr.code === '23505' || insertStatus === 409 || insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
          return res.status(409).json({
            error: `Index conflict: block #${block.index} was concurrently committed`,
            idx: block.index
          });
        }
        return res.status(500).json({ error: 'Failed to insert block into database' });
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(201).json({
        success: true,
        room,
        idx: block.index,
        hash: block.hash,
        verifiedSignaturesCount: verifiedNodeIds.size
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal processing error while appending block' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
