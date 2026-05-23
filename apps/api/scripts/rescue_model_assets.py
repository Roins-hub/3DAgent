from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import requests

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from apps.api import main as api  # noqa: E402


def model_rows(limit: int, job_id: str | None) -> list[dict[str, Any]]:
    filters = [
        "select=id,prompt,status,result_url,target_format,created_at,updated_at",
        "kind=eq.3d",
        "status=eq.completed",
        "order=created_at.desc",
        f"limit={limit}",
    ]
    if job_id:
        filters.append(f"id=eq.{job_id}")
    response = api.supabase_admin_request("GET", f"generation_jobs?{'&'.join(filters)}")
    data = response.json()
    return data if isinstance(data, list) else []


def remote_url_available(url: str) -> tuple[bool, str]:
    try:
        response = requests.get(url, headers={"Range": "bytes=0-15"}, stream=True, timeout=30)
        try:
            if response.status_code in {200, 206}:
                return True, f"HTTP {response.status_code}"
            return False, f"HTTP {response.status_code}"
        finally:
            response.close()
    except requests.RequestException as exc:
        return False, str(exc)


def rescue_row(row: dict[str, Any], apply: bool) -> str:
    job_id = str(row["id"])
    result_url = str(row.get("result_url") or "")
    target_format = api.infer_model_format(result_url, row.get("target_format") or "glb")

    if not result_url:
        return f"{job_id} skipped: no result_url"
    if api.parse_storage_url(result_url):
        return f"{job_id} skipped: already in Supabase Storage"
    if not result_url.startswith(("http://", "https://")):
        return f"{job_id} skipped: unsupported URL"

    available, status = remote_url_available(result_url)
    if not available:
        return f"{job_id} expired/unavailable: {status}"
    if not apply:
        return f"{job_id} can rescue: {status}"

    stored_url = api.persist_remote_model_to_storage(job_id, result_url, target_format)
    api.supabase_admin_request(
        "PATCH",
        f"generation_jobs?id=eq.{job_id}",
        json_body={"result_url": stored_url},
        prefer="return=minimal",
    )
    return f"{job_id} rescued: {stored_url}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy still-downloadable generated 3D model files into Supabase Storage."
    )
    parser.add_argument("--apply", action="store_true", help="Download, upload, and update rows.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum completed 3D rows to inspect.")
    parser.add_argument("--job-id", help="Only inspect/rescue one job id.")
    args = parser.parse_args()

    rows = model_rows(args.limit, args.job_id)
    for row in rows:
        print(rescue_row(row, args.apply))
    if not rows:
        print("No completed 3D rows matched.")
    if not args.apply:
        print("Dry run only. Re-run with --apply to upload available models and update history rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
