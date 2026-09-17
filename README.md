# MasLeads API Integrations

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](python/)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](nodejs/)
[![API Version](https://img.shields.io/badge/API-v1-orange.svg)](https://apidocs.masleads.es)
[![Postman](https://img.shields.io/badge/Postman-Workspace-FF6C37?logo=postman&logoColor=white)](https://www.postman.com/winter-eclipse-621757/masleads-official-api/overview)

Official reference integration kits and production starter templates for the **MasLeads B2B Lead Enrichment API**.

MasLeads provides high-accuracy, real-time B2B contact enrichment (verified business emails and direct mobile phones) for LinkedIn profiles and sales prospecting workflows.

---

## Available Integration Kits

| Language | Directory | Runtime | Dependencies | Key Features |
| :--- | :--- | :--- | :--- | :--- |
| **Python** | [`/python`](python/) | Python 3.10+ | `requests`, `flask` | HTTP client with automatic polling, CLI runner, Flask HMAC webhook receiver |
| **Node.js** | [`/nodejs`](nodejs/) | Node.js 18+ | `express` (zero HTTP deps) | Native ESM client using `fetch`, CLI runner, Express HMAC webhook receiver |
| **Postman** | [`/postman`](postman/) | Postman Desktop / Web / Newman | Pre-configured environment | Official collection with polling workflow, usage query, and Newman CLI support |

---

## Architectural Principles

The MasLeads API is built for scale, resilience, and fair billing:

### 1. Asynchronous Job Processing
Enrichment jobs run asynchronously across multi-source verification engines. 
1. `POST /api/v1/enrich/leads` accepts up to **100 leads per batch** and immediately returns `202 Accepted` with a `job_id`.
2. You can retrieve results using **Polling** (`GET /api/v1/jobs/{job_id}/results`) or via **Webhooks** (`job.completed` event).

```
Client                      MasLeads API
  │                              │
  ├─── POST /enrich/leads ──────►│ (Validates, reserves quota)
  │◄── 202 Accepted (job_id) ────┤
  │                              │
  ├─[Option A: Polling]──────────┤
  │    GET /jobs/{job_id} ──────►│
  │◄── 200 OK (in_progress) ─────┤
  │    GET /jobs/{job_id} ──────►│
  │◄── 200 OK (completed) ───────┤
  │    GET /jobs/{id}/results ──►│
  │◄── 200 OK (leads payload) ───┤
  │                              │
  └─[Option B: Webhook]──────────┤
       (Instant notification)   │
  │◄── POST /your-webhook ───────┤ (HMAC-SHA256 signature)
  │    200 OK (status: accepted)─►│
```

### 2. Fair Billing Guarantee
- **Credits are only consumed when contact data is successfully discovered and verified.**
- If a lead profile is not found, private, blocked by privacy rules, or verification fails, **0 credits are charged**.
- You can inspect real-time credit consumption using `GET /api/v1/usage`.

### 3. Idempotency Protection
- All mutation endpoints support or require the `Idempotency-Key: <UUID>` header.
- Repeated requests with the same idempotency key return the original response without re-triggering jobs or risking double credit deductions.

### 4. Secure Webhooks
- Webhook payloads include the `X-Webhook-Signature` header containing a SHA-256 HMAC digest of the canonical JSON payload (`sha256=<hex>`).
- Both Python and Node.js starter kits include cryptographic verification helpers using timing-safe comparisons.

---

## Quick Comparison

### Python
```python
from masleads_client import MasLeadsClient

client = MasLeadsClient(api_key="ml_live_...")

# 1. Check account quota
usage = client.usage()
print(f"Credits remaining: {usage['credits_available']}")

# 2. Submit enrichment job
job = client.create_job(
    linkedin_url="https://www.linkedin.com/in/satyanadella",
    field="email",
    idempotency_key="job-satya-001"
)

# 3. Poll until completed & fetch verified results
client.wait(job["job_id"], poll_interval=15)
results = client.results(job["job_id"])
print(results)
```

### Postman

[![Run in Postman](https://run.pstmn.io/button.svg)](https://www.postman.com/winter-eclipse-621757/masleads-official-api/overview)

Fork directly into your Postman workspace or run locally using [Newman](https://www.npmjs.com/package/newman):

```bash
npx newman run postman/MasLeads_API_Quickstart.postman_collection.json \
  -e postman/MasLeads_API.postman_environment.json \
  --env-var "api_key=sk_live_..."
```

### Node.js
```javascript
import { MasLeadsClient } from './src/masleads-client.js';

const client = new MasLeadsClient(process.env.MASLEADS_API_KEY);

// 1. Check account quota
const usage = await client.usage();
console.log(`Credits remaining: ${usage.credits_available}`);

// 2. Submit enrichment job
const job = await client.createJob(
  'https://www.linkedin.com/in/satyanadella',
  'email',
  'job-satya-001'
);

// 3. Poll until completed & fetch verified results
await client.wait(job.job_id, { pollIntervalMs: 15000 });
const results = await client.results(job.job_id);
console.log(results);
```

---

## Documentation & Support

- **Interactive API Documentation:** [apidocs.masleads.es](https://apidocs.masleads.es)
- **API Reference & OpenAPI Specification:** [apidocs.masleads.es/reference/](https://apidocs.masleads.es/reference/)
- **Webhook Delivery Guide:** [apidocs.masleads.es/guides/webhooks.html](https://apidocs.masleads.es/guides/webhooks.html)
- **Platform & API Keys:** [app.masleads.es](https://app.masleads.es)
- **Support & Issues:** Open an issue in this repository or contact `support@masleads.es`.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
