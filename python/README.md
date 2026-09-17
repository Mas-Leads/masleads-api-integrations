# MasLeads Python Integration Kit

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

Official reference client and integration toolkit for communicating with the **MasLeads B2B Lead Enrichment API** using Python.

This kit provides:
- **`MasLeadsClient`**: A lightweight, zero-boilerplate REST client built on `requests.Session`.
- **`quickstart.py`**: An interactive CLI tool to submit an enrichment job, poll for status, and display verified results.
- **`webhook_server.py`**: A production-grade Flask receiver with HMAC-SHA256 cryptographic signature verification and event deduplication.

---

## Prerequisites

- **Python 3.10** or higher
- A valid MasLeads API Key (`ml_live_...`) from [app.masleads.es](https://app.masleads.es)

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mas-Leads/masleads-api-integrations.git
   cd masleads-api-integrations/python
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual API key and webhook secret
   export MASLEADS_API_KEY="ml_live_your_actual_key_here"
   export MASLEADS_WEBHOOK_SECRET="whsec_your_webhook_secret_here"
   ```

---

## Quickstart CLI

Use `quickstart.py` to test an enrichment flow directly from your terminal:

```bash
# Enrich a LinkedIn profile to find a verified business email
python3 quickstart.py \
  --linkedin "https://www.linkedin.com/in/satyanadella" \
  --field "email"

# Enrich with a specific external ID and custom idempotency key
python3 quickstart.py \
  --linkedin "https://www.linkedin.com/in/satyanadella" \
  --field "phone" \
  --external-id "crm-lead-88912" \
  --idempotency-key "req-custom-id-998"
```

### CLI Output Example
```text
Account: Pro Scale | Credits remaining: 4850
Submitting job with Idempotency-Key: python-8c7e9d1a-... ...
Job created successfully: job_8a7f1bc3d2e4
Polling job job_8a7f1bc3d2e4: status=in_progress
Polling job job_8a7f1bc3d2e4: status=completed

Enrichment results:
{
  "job_id": "job_8a7f1bc3d2e4",
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

```python
import os
from masleads_client import MasLeadsClient, MasLeadsError

client = MasLeadsClient(
    api_key=os.environ["MASLEADS_API_KEY"],
    timeout=30  # Timeout per HTTP request in seconds
)
```

### 2. Checking Credit Balance & Quota

```python
usage = client.usage()
print(f"Plan: {usage['plan_name']}")
print(f"Credits Remaining: {usage['credits_available']}")
print(f"Credits Used This Period: {usage['credits_used']}")
```

### 3. Submitting an Enrichment Job (Single Lead)

```python
import uuid

job = client.create_job(
    linkedin_url="https://www.linkedin.com/in/williamhgates",
    field="email",  # "email" or "phone"
    idempotency_key=f"sync-{uuid.uuid4()}",
    external_id="lead_1001"  # Optional identifier for your CRM
)

job_id = job["job_id"]
print(f"Enrichment job initiated: {job_id}")
```

### 4. Submitting Batch Enrichment (Up to 100 Leads)

```python
batch_leads = [
    {"linkedin_url": "https://www.linkedin.com/in/lead-1", "external_id": "ext-1"},
    {"linkedin_url": "https://www.linkedin.com/in/lead-2", "external_id": "ext-2"},
]

batch_job = client.create_batch_job(
    leads=batch_leads,
    field="phone",
    idempotency_key=f"batch-{uuid.uuid4()}"
)
```

### 5. Polling for Completion & Fetching Results

```python
# Polls GET /jobs/{job_id} every 15s until terminal status (max 900s)
final_job = client.wait(job_id, poll_interval=15, max_wait=900)

if final_job["status"] == "completed":
    # Fetch all paginated leads
    all_leads = client.all_results(job_id)
    for lead in all_leads:
        if lead["status"] == "enriched":
            print(f"Found: {lead['data']}")
        elif lead["status"] == "not_found":
            print(f"No contact verified (0 credits charged): {lead['linkedin_url']}")
```

---

## Webhook Server & Signature Verification

For production environments, we recommend using webhooks instead of polling. When MasLeads finishes processing a job, it delivers an HTTP `POST` event to your configured endpoint with an `X-Webhook-Signature` header.

### Running the Webhook Server

```bash
export MASLEADS_API_KEY="ml_live_..."
export MASLEADS_WEBHOOK_SECRET="whsec_..."
python3 webhook_server.py
```

### How Signature Verification Works

1. Payload keys are canonically sorted without whitespace separators.
2. An HMAC is computed using SHA-256 and your `MASLEADS_WEBHOOK_SECRET`.
3. The expected digest is compared against the `X-Webhook-Signature` header using timing-safe comparison (`hmac.compare_digest`) to prevent timing attacks.

```python
def verify_signature(payload: dict, signature: str, secret: str) -> bool:
    canonical_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    expected_hex = hmac.new(secret.encode("utf-8"), canonical_bytes, hashlib.sha256).hexdigest()
    received_hex = signature.removeprefix("sha256=")
    return hmac.compare_digest(expected_hex, received_hex)
```

---

## Error Handling & Fair Billing

The client raises `MasLeadsError` for HTTP 4xx/5xx responses:

```python
from masleads_client import MasLeadsError

try:
    client.create_job(...)
except MasLeadsError as e:
    print(f"HTTP Status: {e.status_code}")
    if e.status_code == 429:
        print(f"Rate limited. Backoff for {e.retry_after} seconds.")
    elif e.status_code == 402:
        print("Insufficient credits. Please top up your balance.")
```

### Billing Safety Rules
- **No credit deduction on failure**: If a lead cannot be enriched, `credits_charged` is `0`.
- **Idempotency guaranteed**: If a network timeout occurs while calling `create_job`, you can safely retry using the same `idempotency_key`.

---

## License

This integration kit is open-source software licensed under the [MIT License](../LICENSE).
