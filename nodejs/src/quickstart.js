#!/usr/bin/env node
/**
 * CLI utility to create an enrichment job, poll for completion, and print results.
 */

import { randomUUID } from 'node:crypto';
import { MasLeadsClient, MasLeadsError } from './masleads-client.js';

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const linkedin = getArg('linkedin');
const field = getArg('field');
const externalId = getArg('external-id');
const idempotencyKey = getArg('idempotency-key') || `node-${randomUUID()}`;

if (!linkedin || !['email', 'phone'].includes(field)) {
  console.error('Usage: npm run enrich -- --linkedin <URL> --field <email|phone> [--external-id <ID>] [--idempotency-key <KEY>]');
  process.exit(1);
}

const apiKey = process.env.MASLEADS_API_KEY?.trim();
if (!apiKey) {
  console.error('Error: MASLEADS_API_KEY environment variable is missing or empty.');
  process.exit(1);
}

const client = new MasLeadsClient(apiKey);

try {
  const usage = await client.usage();
  console.log(`Account: ${usage.plan_name ?? 'Standard'} | Credits remaining: ${usage.credits_available ?? 'unknown'}`);
  console.log(`Submitting job with Idempotency-Key: ${idempotencyKey} ...`);

  const created = await client.createJob(linkedin, field, idempotencyKey, externalId);
  const jobId = created.job_id;
  console.log(`Job created successfully: ${jobId}`);

  const finalJob = await client.wait(jobId, { pollIntervalMs: 15000 });

  if (finalJob.status === 'completed') {
    console.log('\nEnrichment results:');
    const results = await client.results(jobId);
    console.log(JSON.stringify(results, null, 2));
  } else if (finalJob.status === 'blocked') {
    const blocker = finalJob.blocker || {};
    const reason = blocker.message || blocker.code || 'Job blocked';
    console.error(`Job was blocked by MasLeads: ${reason}`);
    process.exit(1);
  } else {
    console.error(`Job finished with unexpected terminal status: ${finalJob.status}`);
    process.exit(1);
  }
} catch (err) {
  if (err instanceof MasLeadsError) {
    console.error(`API Error: ${err.message}`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
}
