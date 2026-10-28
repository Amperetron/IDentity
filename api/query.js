/**
 * api/query.js - Groq LLM Query Proxy (Vercel Serverless Function)
 *
 * Translates natural language questions about Indian technical institutions into structured
 * JSON query filters: { filters: [{ field, op, value }], sort: { field, dir } }
 *
 * Secrets: Reads process.env.GROQ_API_KEY (never logged).
 */

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute per IP

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

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // Rate Limiting per IP
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
  }

  // Parse Body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Malformed JSON payload' });
    }
  }

  const question = String((body && body.question) || '').trim().slice(0, 300);
  if (!question) {
    return res.status(400).json({ error: 'Empty or missing question parameter' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured on server' });
  }

  const systemPrompt = `Convert questions about Indian engineering colleges into JSON only: {"filters":[{"field":"","op":"","value":0}],"sort":{"field":"","dir":"asc"}}. Fields: name,state,intake,admitted,nriAdmitted,nriQuota,utilization(0-100). Ops: > < >= <= = contains.`;

  try {
    const upstreamRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        temperature: 0.1
      })
    });

    if (!upstreamRes.ok) {
      return res.status(502).json({ error: 'Upstream Groq API failed', status: upstreamRes.status });
    }

    const groqData = await upstreamRes.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: 'Invalid response from Groq upstream' });
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to parse JSON response from LLM' });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(parsedContent);
  } catch (error) {
    // Note: Do not log secrets or sensitive headers
    return res.status(502).json({ error: 'Upstream connection failed' });
  }
};
