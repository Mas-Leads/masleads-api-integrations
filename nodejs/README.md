# MasLeads Node.js Integration Kit

[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Module: ESM](https://img.shields.io/badge/Module-ESM-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Official reference client and integration toolkit for interacting with the **MasLeads B2B Lead Enrichment API** using Node.js and TypeScript/JavaScript.

This kit provides:
- **`MasLeadsClient`**: Zero-dependency (uses native `fetch` and ES Modules) production-shaped API client.
- **`src/quickstart.js`**: Command-line tool to submit enrichment jobs, monitor progress, and retrieve results.
- **`src/webhook-server.js`**: An Express webhook listener with HMAC-SHA256 signature verification and timing-safe security.

---

## Prerequisites

- **Node.js 18.0.0** or higher (tested on Node.js 18, 20, and 22)
- A valid MasLeads API Key (`ml_live_...`) from [app.masleads.es](https://app.masleads.es)

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mas-Leads/masleads-api-integrations.git
   cd masleads-api-integrations/nodejs
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   export MASLEADS_API_KEY="ml_live_your_actual_key_here"
   export MASLEADS_WEBHOOK_SECRET="whsec_your_webhook_secret_here"
   ```

---

## Quickstart CLI

Run `quickstart.js` directly through npm:

```bash
# Enrich a LinkedIn profile to find a verified business email
npm run enrich -- \
  --linkedin "https://www.linkedin.com/in/satyanadella" \
  --field "email"

# Enrich to find a verified direct phone with external ID
npm run enrich -- \
  --linkedin "https://www.linkedin.com/in/satyanadella" \
  --field "phone" \
  --external-id "crm-lead-88912"
```

### CLI Output Example
```text
Account: Growth Scale | Credits remaining: 12400
Submitting job with Idempotency-Key: node-7f41a8... ...
Job created successfully: job_c491e0a82b3d
Polling job job_c491e0a82b3d: status=in_progress
Polling job job_c491e0a82b3d: status=completed

Enrichment results:
{
  "job_id": "job_c491e0a82b3d",
  "status": "completed",
  "field": "email",
  "leads": [
    {
      "linkedin_url": "https://www.linkedin.com/in/satyanadella",
      "external_id": "crm-lead-88912",
      "status": "enriched",
      "data": {
        "email": "satya@microsoft.com",
        "email_type": "work",
        "verification": "deliverable",
        "score": 98
      }
    }
  ],
  "credits_charged": 1
}
```

---

## Programmatic Usage

### 1. Initializing the Client

```javascript
import { MasLeadsClient, MasLeadsError } from './src/masleads-client.js';

const client = new MasLeadsClient(process.env.MASLEADS_API_KEY, {
  timeoutMs: 30000 // 30s timeout per request
});
```

### 2. Checking Credit Balance & Account Quota

```javascript
const usage = await client.usage();
console.log(`Plan: ${usage.plan_name}`);
console.log(`Credits Remaining: ${usage.credits_available}`);
console.log(`Credits Used: ${usage.credits_used}`);
```

### 3. Submitting an Enrichment Job (Single Lead)

```javascript
import { randomUUID } from 'node:crypto';

const job = await client.createJob(
  'https://www.linkedin.com/in/williamhgates',
  'email', // 'email' or 'phone'
  `sync-${randomUUID()}`,
  'crm_lead_104' // Optional tracking ID
);

console.log(`Job queued: ${job.job_id}`);
```

### 4. Submitting Batch Enrichment (Up to 100 Leads)

```javascript
import { randomUUID } from 'node:crypto';

const leads = [
  { linkedin_url: 'https://www.linkedin.com/in/lead-1', external_id: 'crm-1' },
  { linkedin_url: 'https://www.linkedin.com/in/lead-2', external_id: 'crm-2' }
];

const batchJob = await client.createBatchJob(
  leads,
  'email',
  `batch-${randomUUID()}`
);
```

### 5. Polling for Completion & Fetching Results

```javascript
// Polls every 15 seconds until terminal status (completed / blocked / failed)
const finalJob = await client.wait(job.job_id, {
  pollIntervalMs: 15000,
  maxWaitMs: 900000 // 15 minutes max
});

if (finalJob.status === 'completed') {
  // Collect all paginated lead records
  const allLeads = await client.allResults(job.job_id);
  for (const lead of allLeads) {
    if (lead.status === 'enriched') {
      console.log('Verified data:', lead.data);
    } else if (lead.status === 'not_found') {
      console.log('Not found (0 credits billed):', lead.linkedin_url);
    }
  }
}
```

---

## Webhook Server & Signature Verification

In high-throughput environments, use webhooks to receive push notifications upon job completion.

### Starting the Webhook Server

```bash
export MASLEADS_API_KEY="ml_live_..."
export MASLEADS_WEBHOOK_SECRET="whsec_..."
npm run webhook
```

### Cryptographic Verification Algorithm

The webhook signature is verified using HMAC-SHA256 over canonically serialized JSON:

```javascript
import crypto from 'node:crypto';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

function verifySignature(payload, signature, secret) {
  const canonical = canonicalJson(payload);
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  const received = signature.replace(/^sha256=/, '');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}
```

---

## Error Handling & Fair Billing

The client throws `MasLeadsError` on HTTP failures:

```javascript
try {
  await client.createJob(...);
} catch (err) {
  if (err instanceof MasLeadsError) {
    console.error(`Status: ${err.status} - ${err.message}`);
    if (err.status === 429) {
      console.warn(`Rate limited. Retry after ${err.retryAfter} seconds.`);
    }
  }
}
```

### Fair Billing Guarantee
- **No credit deduction on failure**: `credits_charged` is only incremented when contact data is successfully discovered and verified.
- **Idempotency guaranteed**: If a request drops, retrying with the same `idempotency_key` never risks double billing.

---

## License

This integration kit is open-source software licensed under the [MIT License](../LICENSE).
