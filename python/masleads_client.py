"""Production-ready reference client for the MasLeads public REST API."""

from __future__ import annotations

import time
from typing import Any, ClassVar

import requests


class MasLeadsError(RuntimeError):
    """Raised when the MasLeads API returns an HTTP error status code."""

    def __init__(self, status_code: int, message: str, retry_after: str | None = None):
        self.status_code = status_code
        self.retry_after = retry_after
        suffix = f" Retry after {retry_after}s." if retry_after else ""
        super().__init__(f"MasLeads [{status_code}]: {message}.{suffix}")


class MasLeadsClient:
    """Client for interacting with the MasLeads B2B Lead Enrichment API."""

    BASE_URL: str = "https://api.masleads.es/api/v1"
    TERMINAL_STATUSES: ClassVar[set[str]] = {"completed", "blocked", "failed"}

    def __init__(self, api_key: str, timeout: int = 30):
        if not api_key or not api_key.strip():
            raise ValueError("MASLEADS_API_KEY cannot be empty")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "X-API-Key": api_key.strip(),
                "Accept": "application/json",
                "User-Agent": "masleads-python-integration/1.0",
            }
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{self.BASE_URL}{path}"
        response = self.session.request(
            method,
            url,
            timeout=self.timeout,
            **kwargs,
        )
        try:
            body = response.json()
        except requests.JSONDecodeError:
            body = {}

        if not response.ok:
            error = body.get("error", {})
            if isinstance(error, dict):
                message = error.get("message") or error.get("code")
            else:
                message = str(error)
            raise MasLeadsError(
                response.status_code,
                message or body.get("message") or "Request failed",
                response.headers.get("Retry-After"),
            )
        return body

    def usage(self) -> dict[str, Any]:
        """Check credit balance and active subscription tier."""
        return self._request("GET", "/usage")

    def create_job(
        self,
        linkedin_url: str,
        field: str,
        idempotency_key: str,
        external_id: str | None = None,
    ) -> dict[str, Any]:
        """Submit an enrichment job for a single lead."""
        if field not in {"email", "phone"}:
            raise ValueError("field must be 'email' or 'phone'")
        if not idempotency_key or not idempotency_key.strip():
            raise ValueError("idempotency_key cannot be empty")

        lead: dict[str, Any] = {"linkedin_url": linkedin_url}
        if external_id:
            lead["external_id"] = external_id

        return self._request(
            "POST",
            "/enrich/leads",
            headers={"Idempotency-Key": idempotency_key.strip()},
            json={"field": field, "leads": [lead]},
        )

    def create_batch_job(
        self,
        leads: list[dict[str, Any]],
        field: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Submit an enrichment job for up to 100 leads."""
        if field not in {"email", "phone"}:
            raise ValueError("field must be 'email' or 'phone'")
        if not idempotency_key or not idempotency_key.strip():
            raise ValueError("idempotency_key cannot be empty")
        if not leads or len(leads) > 100:
            raise ValueError("leads must contain between 1 and 100 items")

        return self._request(
            "POST",
            "/enrich/leads",
            headers={"Idempotency-Key": idempotency_key.strip()},
            json={"field": field, "leads": leads},
        )

    def job(self, job_id: str) -> dict[str, Any]:
        """Retrieve metadata, current status, and progress counts for a job."""
        return self._request("GET", f"/jobs/{job_id}")

    def results(self, job_id: str, page: int = 1, per_page: int = 50) -> dict[str, Any]:
        """Retrieve paginated results for a completed job."""
        return self._request(
            "GET",
            f"/jobs/{job_id}/results",
            params={"page": page, "per_page": per_page},
        )

    def all_results(self, job_id: str) -> list[dict[str, Any]]:
        """Paginate through all results and collect all enriched lead records."""
        leads: list[dict[str, Any]] = []
        page = 1
        while True:
            response = self.results(job_id, page=page)
            leads.extend(response.get("leads", []))
            pagination = response.get("pagination", {})
            if page >= pagination.get("total_pages", 1):
                return leads
            page += 1

    def wait(
        self, job_id: str, poll_interval: int = 15, max_wait: int = 900
    ) -> dict[str, Any]:
        """Poll the job endpoint until it reaches a terminal status or times out."""
        deadline = time.monotonic() + max_wait
        while time.monotonic() < deadline:
            job = self.job(job_id)
            status = job.get("status", "unknown")
            print(f"Polling job {job_id}: status={status}")
            if status in self.TERMINAL_STATUSES:
                return job
            time.sleep(poll_interval)
        raise TimeoutError(f"Job {job_id} did not complete within {max_wait} seconds")
