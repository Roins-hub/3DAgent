from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CadScript:
    title: str
    geometry_type: str
    source: str
    parameters: dict[str, float]
