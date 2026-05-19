from __future__ import annotations

import importlib.util
import re
from dataclasses import dataclass
from pathlib import Path

from .llm_generator import generate_repaired_llm_source


@dataclass(frozen=True)
class ExportResult:
    exported: bool
    attempts: int
    source: str
    error: str | None = None


def resolve_output_path(output_dir: Path, filename: str) -> Path:
    if not filename.lower().endswith(".step"):
        raise ValueError("output filename must end with .step")
    root = output_dir.expanduser().resolve()
    output = (root / filename).resolve()
    if root != output and root not in output.parents:
        raise ValueError("output path is outside output directory")
    return output


def write_source(output_dir: Path, stem: str, source: str) -> Path:
    root = output_dir.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    source_path = root / f"{stem}.py"
    source_path.write_text(normalize_build123d_source(source), encoding="utf-8")
    return source_path


def normalize_build123d_source(source: str) -> str:
    source = re.sub(
        r"\bchamfer\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^,\n\)]+)\s*,\s*length\s*=",
        r"chamfer(\2, length=",
        source,
    )
    source = re.sub(
        r"\bfillet\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^,\n\)]+)\s*,\s*radius\s*=",
        r"fillet(\2, radius=",
        source,
    )
    return source


def export_with_optional_repair(
    prompt: str,
    source_path: Path,
    output_path: Path,
    source: str,
    repair_enabled: bool,
) -> ExportResult:
    try:
        export_step_from_source(source_path, output_path)
        return ExportResult(exported=True, attempts=1, source=source)
    except Exception as exc:
        if not repair_enabled:
            return ExportResult(exported=False, attempts=1, source=source, error=str(exc))
        repaired_source = normalize_build123d_source(generate_repaired_llm_source(prompt, source, str(exc)))
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.write_text(repaired_source, encoding="utf-8")
        try:
            export_step_from_source(source_path, output_path)
            return ExportResult(exported=True, attempts=2, source=repaired_source)
        except Exception as repaired_exc:
            return ExportResult(exported=False, attempts=2, source=repaired_source, error=str(repaired_exc))


def export_step_from_source(source_path: Path, output_path: Path) -> None:
    try:
        from build123d import export_step
    except ImportError as exc:
        raise RuntimeError("build123d is not installed; install engines/cad-script-engine/requirements.txt") from exc

    spec = importlib.util.spec_from_file_location("generated_cad_part", source_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load generated CAD source: {source_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "gen_step"):
        raise RuntimeError("Generated CAD source must define gen_step()")
    shape = module.gen_step()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_step(shape, output_path)
