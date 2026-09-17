#!/usr/bin/env node
/**
 * Reference Express webhook receiver with HMAC-SHA256 signature verification.
 */

import crypto from 'node:crypto';
import express from 'express';
import { MasLeadsClient } from './masleads-client.js';

const app = express();
const processedEvents = new Set();

/**
 * Serialize an object into deterministic canonical JSON (sorted keys, compact separators).
 * Matches the canonical serialization expected by MasLeads webhooks.
 * @param {any} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${pairs.join(',')}}`;
}

/**
 * Cryptographically verify the MasLeads HMAC-SHA256 signature.
 * @param {object} payload
 * @param {string} signature
 * @param {string} secret
 * @returns {boolean}
 */
function verifySignature(payload, signature, secret) {
  const canonical = canonicalJson(payload);
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  const received = signature.replace(/^sha256=/, '');

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

app.post('/masleads-webhook', express.json(), async (req, res) => {
  const signature = req.get('X-Webhook-Signature') || '';
  const secret = process.env.MASLEADS_WEBHOOK_SECRET || '';
  const event = req.body;

  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'invalid_delivery', message: 'Expected JSON payload' });
  }

  if (!secret) {
    console.error('[Error] MASLEADS_WEBHOOK_SECRET environment variable is not set');
    return res.status(500).json({ error: 'server_misconfiguration', message: 'Webhook secret not set' });
  }

  if (!signature || !verifySignature(event, signature, secret)) {
    console.warn('[Warning] Webhook signature verification failed');
    return res.status(401).json({ error: 'invalid_signature', message: 'HMAC signature verification failed' });
  }

  const { event_type, job_id } = event;
  if (!event_type || !job_id) {
    return res.status(400).json({ error: 'invalid_event', message: 'Missing event_type or job_id' });
  }

  // Idempotency / deduplication check
  const eventKey = `${event_type}:${job_id}`;
  if (processedEvents.has(eventKey)) {
    console.log(`[Info] Duplicate event ignored: ${eventKey}`);
    return res.json({ status: 'already_processed' });
  }

  console.log(`[Info] Received verified webhook event: ${event_type} for job: ${job_id}`);

  if (event_type === 'job.completed') {
    const apiKey = process.env.MASLEADS_API_KEY;
    if (apiKey) {
      try {
        const client = new MasLeadsClient(apiKey);
        const results = await client.results(job_id);
        console.log(`[Info] Retrieved ${results.leads?.length || 0} enriched lead(s) for job ${job_id}`);
        // Synchronize with your CRM, queue, or database here
      } catch (err) {
        console.error(`[Error] Failed to fetch job results for ${job_id}:`, err.message);
      }
    }
  }

  processedEvents.add(eventKey);
  return res.json({ status: 'accepted' });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`MasLeads webhook listener running on http://127.0.0.1:${PORT}/masleads-webhook`);
});
