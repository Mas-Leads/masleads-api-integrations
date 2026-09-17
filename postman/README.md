# MasLeads API — Postman Collection & Environment

[![Run in Postman](https://run.pstmn.io/button.svg)](https://www.postman.com/winter-eclipse-621757/masleads-official-api/overview)
[![Postman Workspace](https://img.shields.io/badge/Postman-Public_Workspace-FF6C37?logo=postman&logoColor=white)](https://www.postman.com/winter-eclipse-621757/masleads-official-api/overview)
[![API Version](https://img.shields.io/badge/API-v1-orange.svg)](https://apidocs.masleads.es)

Official Postman Quickstart collection and environment for the **MasLeads B2B Lead Enrichment API** (`https://api.masleads.es/api/v1`).

---

## What's Included

- **`MasLeads_API_Quickstart.postman_collection.json`**: Pre-configured collection covering the complete enrichment lifecycle:
  1. **Check Account Quota & Credits** (`GET /api/v1/usage`) — verify remaining credits and plan details.
  2. **Create Enrichment Job** (`POST /api/v1/enrich/leads`) — submit a LinkedIn profile for asynchronous email or phone discovery.
  3. **Check Job Status** (`GET /api/v1/jobs/{{job_id}}`) — poll until status changes from `in_progress` to `completed`.
  4. **Retrieve Verified Results** (`GET /api/v1/jobs/{{job_id}}/results`) — download verified lead contact data with fair-billing guarantee (0 credits consumed if not found).
- **`MasLeads_API.postman_environment.json`**: Environment containing variables (`base_url`, `api_key`, `linkedin_url`, `external_id`, `job_id`).

---

## 🚀 Option 1: Official Postman Public Workspace (Recommended)

You can explore, test, and fork the collection directly without downloading any files:

1. Click the button below to open the workspace:
   
   [![Run in Postman](https://run.pstmn.io/button.svg)](https://www.postman.com/winter-eclipse-621757/masleads-official-api/overview)

2. Click **Fork Collection** to add it to your personal or team Postman workspace.
3. Select the **MasLeads API - Tu cuenta** environment and set your `api_key` (`sk_live_...`).

---

## 💻 Option 2: Import Files into Postman Locally

1. Open Postman Desktop or Web.
2. Click **Import** (top left) and select both files:
   - `MasLeads_API_Quickstart.postman_collection.json`
   - `MasLeads_API.postman_environment.json`
3. In the environment selector (top right), choose **MasLeads API - Tu cuenta**.
4. Edit the environment and enter your API key in the `api_key` variable value.
5. Send **1. Comprobar cuenta y saldo** to test your connection.

---

## 🤖 Option 3: Automated Testing via Newman (CLI / CI/CD)

Run the collection from your terminal or CI pipeline using [Newman](https://www.npmjs.com/package/newman):

```bash
npx newman run MasLeads_API_Quickstart.postman_collection.json \
  -e MasLeads_API.postman_environment.json \
  --env-var "api_key=sk_live_your_actual_key"
```

---

## Environment Variables Reference

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `base_url` | `https://api.masleads.es/api/v1` | Production API endpoint base URL |
| `api_key` | *(Secret)* | Your MasLeads secret API key (`sk_live_...` from [app.masleads.es](https://app.masleads.es)) |
| `linkedin_url` | `https://www.linkedin.com/in/...` | LinkedIn profile URL of the contact to enrich |
| `external_id` | `CRM-123` | Your internal CRM or database lead identifier |
| `job_id` | *(Dynamic)* | Automatically saved by step 2 and used by steps 3 and 4 |

---

## Documentation & Support

- **Interactive API Docs:** [apidocs.masleads.es](https://apidocs.masleads.es)
- **Developer Portal:** [developers.masleads.es](https://developers.masleads.es)
- **Get API Keys:** [app.masleads.es](https://app.masleads.es)
- **Issues & Support:** Open an issue in this repository or email `support@masleads.es`.
