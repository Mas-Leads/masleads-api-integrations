/**
 * Production-ready reference client for the MasLeads public REST API.
 * Built for Node.js 18+ using native fetch and standard ES modules.
 */

const BASE_URL = 'https://api.masleads.es/api/v1';
const TERMINAL_STATUSES = new Set(['completed', 'blocked', 'failed']);

export class MasLeadsError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string|null} [retryAfter]
   */
  constructor(status, message, retryAfter = null) {
    const suffix = retryAfter ? `. Retry after ${retryAfter}s` : '';
    super(`MasLeads [${status}]: ${message}${suffix}`);
    this.name = 'MasLeadsError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class MasLeadsClient {
  /**
   * @param {string} apiKey
   * @param {object} [options]
   * @param {number} [options.timeoutMs=30000]
   */
  constructor(apiKey, { timeoutMs = 30000 } = {}) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('MASLEADS_API_KEY cannot be empty');
    }
    this.apiKey = apiKey.trim();
    this.timeoutMs = timeoutMs;
  }

  /**
   * Internal request helper wrapping native fetch.
   * @param {string} path
   * @param {RequestInit} [options]
   * @returns {Promise<any>}
   */
  async request(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'masleads-nodejs-integration/1.0',
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = typeof body.error === 'object' && body.error !== null ? body.error : {};
      const message = error.message || error.code || body.message || body.error || 'Request failed';
      throw new MasLeadsError(
        response.status,
        message,
        response.headers.get('Retry-After')
      );
    }

    return body;
  }

  /**
   * Check account quota, plan tier, and remaining credits.
   * @returns {Promise<{ plan_name: string, credits_available: number, credits_used: number }>}
   */
  usage() {
    return this.request('/usage');
  }

  /**
   * Submit an enrichment job for a single lead.
   * @param {string} linkedinUrl
   * @param {'email'|'phone'} field
   * @param {string} idempotencyKey
   * @param {string} [externalId]
   * @returns {Promise<{ job_id: string, status: string, field: string }>}
   */
  createJob(linkedinUrl, field, idempotencyKey, externalId) {
    if (!['email', 'phone'].includes(field)) {
      throw new Error("field must be 'email' or 'phone'");
    }
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new Error('idempotencyKey cannot be empty');
    }

    const lead = { linkedin_url: linkedinUrl };
    if (externalId) lead.external_id = externalId;

    return this.request('/enrich/leads', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey.trim() },
      body: JSON.stringify({ field, leads: [lead] })
    });
  }

  /**
   * Submit an enrichment job for a batch of leads (up to 100).
   * @param {Array<{ linkedin_url: string, external_id?: string }>} leads
   * @param {'email'|'phone'} field
   * @param {string} idempotencyKey
   * @returns {Promise<{ job_id: string, status: string, total_leads: number }>}
   */
  createBatchJob(leads, field, idempotencyKey) {
    if (!['email', 'phone'].includes(field)) {
      throw new Error("field must be 'email' or 'phone'");
    }
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new Error('idempotencyKey cannot be empty');
    }
    if (!Array.isArray(leads) || leads.length === 0 || leads.length > 100) {
      throw new Error('leads must be an array of 1 to 100 items');
    }

    return this.request('/enrich/leads', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey.trim() },
      body: JSON.stringify({ field, leads })
    });
  }

  /**
   * Retrieve current status and progress of a job.
   * @param {string} jobId
   * @returns {Promise<any>}
   */
  job(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}`);
  }

  /**
   * Retrieve paginated results of a completed job.
   * @param {string} jobId
   * @param {number} [page=1]
   * @param {number} [perPage=50]
   * @returns {Promise<any>}
   */
  results(jobId, page = 1, perPage = 50) {
    return this.request(
      `/jobs/${encodeURIComponent(jobId)}/results?page=${page}&per_page=${perPage}`
    );
  }

  /**
   * Paginate through all results and collect all enriched lead records.
   * @param {string} jobId
   * @returns {Promise<Array<any>>}
   */
  async allResults(jobId) {
    const leads = [];
    let page = 1;
    while (true) {
      const response = await this.results(jobId, page);
      if (Array.isArray(response.leads)) {
        leads.push(...response.leads);
      }
      const totalPages = response.pagination?.total_pages ?? 1;
      if (page >= totalPages) break;
      page += 1;
    }
    return leads;
  }

  /**
   * Poll the job endpoint until it reaches a terminal status or timeout occurs.
   * @param {string} jobId
   * @param {object} [options]
   * @param {number} [options.pollIntervalMs=15000]
   * @param {number} [options.maxWaitMs=900000]
   * @returns {Promise<any>}
   */
  async wait(jobId, { pollIntervalMs = 15000, maxWaitMs = 900000 } = {}) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const currentJob = await this.job(jobId);
      console.log(`Polling job ${jobId}: status=${currentJob.status}`);
      if (TERMINAL_STATUSES.has(currentJob.status)) {
        return currentJob;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
  }
}
