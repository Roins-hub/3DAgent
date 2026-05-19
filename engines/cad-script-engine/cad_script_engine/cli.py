from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re

from .generator import generate_build123d_source, generate_local_build123d_source
from .runner import export_with_optional_repair, resolve_output_path, write_source


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate build123d CAD source and STEP from a prompt.")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--filename", default=None)
    parser.add_argument("--source-only", action="store_true")
    parser.add_argument("--repair", action="store_true")
    args = parser.parse_args()

    try:
        fallback = None
        try:
            result = generate_build123d_source(args.prompt)
        except Exception as generate_exc:
            if not _llm_repair_enabled():
                raise
            result = generate_local_build123d_source(args.prompt)
            fallback = "local"
        output_dir = Path(args.output_dir)
        source_path, step_path, exported, attempts, error = _write_and_export(args, result, output_dir)
        if error is not None and _llm_repair_enabled():
            local_result = generate_local_build123d_source(args.prompt)
            local_source_path, local_step_path, local_exported, local_attempts, local_error = _write_and_export(
                args,
                local_result,
                output_dir,
            )
            if local_error is None:
                result = local_result
                source_path = local_source_path
                step_path = local_step_path
                exported = local_exported
                attempts += local_attempts
                error = None
                fallback = "local"

        print(json.dumps({
            "success": error is None,
            "title": result.title,
            "geometryType": result.geometry_type,
            "parameters": result.parameters,
            "sourceFile": str(source_path),
            "stepFile": str(step_path) if exported else None,
            "attempts": attempts,
            "fallback": fallback,
            "error": error,
        }, ensure_ascii=False))
        return 0 if error is None else 2
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "title": None,
            "geometryType": None,
            "parameters": {},
            "sourceFile": None,
            "stepFile": None,
            "attempts": 0,
            "fallback": None,
            "error": str(exc),
        }, ensure_ascii=False))
        return 2


def _write_and_export(args: argparse.Namespace, result, output_dir: Path):
    stem = _safe_stem(args.filename or result.title)
    source_path = write_source(output_dir, stem, result.source)
    step_path = resolve_output_path(output_dir, f"{stem}.step")
    exported = False
    error = None
    attempts = 0
    if not args.source_only:
        export_result = export_with_optional_repair(
            prompt=args.prompt,
            source_path=source_path,
            output_path=step_path,
            source=result.source,
            repair_enabled=args.repair or _llm_repair_enabled(),
        )
        exported = export_result.exported
        attempts = export_result.attempts
        error = export_result.error
    return source_path, step_path, exported, attempts, error


def _safe_stem(value: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip()).strip("_").lower()
    return stem or "cad_part"


def _llm_repair_enabled() -> bool:
    if os.getenv("CAD_SCRIPT_REPAIR", "").strip().lower() in {"0", "false", "no", "off"}:
        return False
    return os.getenv("CAD_SCRIPT_GENERATOR", "").strip().lower() == "llm"


if __name__ == "__main__":
    raise SystemExit(main())
