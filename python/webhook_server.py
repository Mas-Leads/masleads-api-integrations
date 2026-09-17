#!/usr/bin/env python3
"""Reference Flask webhook receiver with HMAC-SHA256 signature verification."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import sys

from flask import Flask, Response, jsonify, request
from masleads_client import MasLeadsClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("masleads_webhook")

app = Flask(__name__)
PROCESSED_EVENTS: set[str] = set()


def verify_signature(payload: dict, signature: str, secret: str) -> bool:
    """Verify that the X-Webhook-Signature header matches the HMAC-SHA256 of the payload."""
    canonical_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    expected_hex = hmac.new(secret.encode("utf-8"), canonical_bytes, hashlib.sha256).hexdigest()
    received_hex = signature.removeprefix("sha256=")
    return hmac.compare_digest(expected_hex, received_hex)


@app.post("/masleads-webhook")
def receive_webhook() -> tuple[Response, int]:
    signature = request.headers.get("X-Webhook-Signature", "")
    secret = os.environ.get("MASLEADS_WEBHOOK_SECRET", "")
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        logger.warning("Rejected webhook: malformed JSON payload")
        return jsonify(error="invalid_delivery", message="Expected valid JSON payload"), 400

    if not secret:
        logger.error("MASLEADS_WEBHOOK_SECRET environment variable is not configured")
        return jsonify(error="server_misconfiguration", message="Webhook secret not configured on server"), 500

    if not signature or not verify_signature(payload, signature, secret):
        logger.warning("Rejected webhook: invalid or missing HMAC-SHA256 signature")
        return jsonify(error="invalid_signature", message="HMAC signature verification failed"), 401

    event_type = payload.get("event_type")
    job_id = payload.get("job_id")

    if not event_type or not job_id:
        return jsonify(error="invalid_event", message="Missing event_type or job_id in payload"), 400

    # Idempotency / deduplication check
    event_key = f"{event_type}:{job_id}"
    if event_key in PROCESSED_EVENTS:
        logger.info(f"Duplicate event ignored: {event_key}")
        return jsonify(status="already_processed"), 200

    logger.info(f"Received verified webhook event: {event_type} for job: {job_id}")

    # Process completed jobs
    if event_type == "job.completed":
        api_key = os.environ.get("MASLEADS_API_KEY", "")
        if api_key:
            client = MasLeadsClient(api_key)
            results = client.results(job_id)
            leads = results.get("leads", [])
            logger.info(f"Retrieved {len(leads)} enriched lead(s) for completed job {job_id}")
            # Here you would typically sync data to your CRM, database, or queue:
            # save_to_crm(leads)
        else:
            logger.warning("MASLEADS_API_KEY not configured; skipping automatic result retrieval")

    PROCESSED_EVENTS.add(event_key)
    return jsonify(status="accepted"), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting MasLeads webhook server on http://127.0.0.1:{port}/masleads-webhook")
    app.run(host="127.0.0.1", port=port)
