from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

import requests

from .generator_types import CadScript


DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-pro"
DEFAULT_TIMEOUT_SECONDS = 420
DEFAULT_MAX_TOKENS = 16000

SYSTEM_PROMPT = """You generate production-ready build123d Python for industrial CAD.
Return one JSON object with title, geometryType, parameters, source.
Do not return Markdown, code fences, comments outside JSON, explanations, or multiple JSON objects.
The source must import build123d, define gen_step(), and return a closed positive-volume solid or compound.
Use millimeters. Keep dimensions as named variables. Avoid file IO, subprocesses, networking, eval, and exec.
Prefer STEP-ready mechanical features: holes, counterbores, bosses, ribs, chamfers, fillets, slots, pockets, flanges, brackets, shafts, enclosures.
"""

DISALLOWED_SOURCE_PATTERNS = (
    r"\bopen\s*\(",
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\bcompile\s*\(",
    r"\b__import__\s*\(",
    r"\bsubprocess\b",
    r"\bsocket\b",
    r"\brequests\b",
    r"\burllib\b",
    r"\bpathlib\b",
    r"\bos\.",
    r"\bsys\.",
    r"\bshutil\b",
    r"\bwrite_text\s*\(",
    r"\bwrite_bytes\s*\(",
)


@dataclass(frozen=True)
class LlmCadScript(CadScript):
    model: str = DEFAULT_MODEL


def generate_llm_build123d_source(prompt: str) -> LlmCadScript:
    api_key = _setting("CAD_SCRIPT_API_KEY") or _setting("DEEPSEEK_API_KEY") or _setting("CADAM_DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("CAD_SCRIPT_API_KEY or DEEPSEEK_API_KEY is required for CAD_SCRIPT_GENERATOR=llm")

    base_url = (_setting("CAD_SCRIPT_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    model = _setting("CAD_SCRIPT_MODEL") or DEFAULT_MODEL
    timeout = _timeout_seconds()
    max_tokens = _max_tokens()
    first_payload = _post_chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(prompt),
        max_tokens=max_tokens,
        timeout=timeout,
    )
    content = _choice_content(first_payload)
    try:
        result = parse_llm_cad_script(content)
    except ValueError as exc:
        retry_payload = _post_chat_completion(
            base_url=base_url,
            api_key=api_key,
            model=model,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=_build_simplified_user_prompt(prompt, str(exc)),
            max_tokens=max_tokens,
            timeout=timeout,
        )
        result = parse_llm_cad_script(_choice_content(retry_payload))
    return LlmCadScript(
        title=result.title,
        geometry_type=result.geometry_type,
        source=result.source,
        parameters=result.parameters,
        model=model,
    )


def _post_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    timeout: int,
) -> dict[str, Any]:
    response = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.05,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        },
        timeout=timeout,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"CAD script LLM request failed: HTTP {response.status_code} {response.text[:800]}")
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("CAD script LLM response was not a JSON object")
    return payload


def parse_llm_cad_script(content: str) -> CadScript:
    payload = _extract_json_object(content)
    title = _string_value(payload, "title", "Generated CAD Part")
    geometry_type = _string_value(payload, "geometryType", _string_value(payload, "geometry_type", "custom"))
    source = _string_value(payload, "source", "")
    validate_generated_source(source)
    parameters = _numeric_parameters(payload.get("parameters"))
    return CadScript(title=title, geometry_type=geometry_type, source=source, parameters=parameters)


def validate_generated_source(source: str) -> None:
    if "def gen_step" not in source:
        raise ValueError("generated source must define gen_step()")
    if "build123d" not in source:
        raise ValueError("generated source must import build123d")
    for pattern in DISALLOWED_SOURCE_PATTERNS:
        if re.search(pattern, source):
            raise ValueError(f"generated source contains disallowed operation: {pattern}")


def build_repair_prompt(original_prompt: str, source: str, failure: str) -> str:
    return (
        "Repair this build123d CAD generator. Return the same JSON object shape: "
        "title, geometryType, parameters, source.\n\n"
        f"Original user prompt:\n{original_prompt}\n\n"
        f"Failure:\n{failure}\n\n"
        f"Current source:\n```python\n{source}\n```\n"
    )


def generate_repaired_llm_source(original_prompt: str, source: str, failure: str) -> str:
    repaired = generate_llm_build123d_source(build_repair_prompt(original_prompt, source, failure))
    return repaired.source


def _build_user_prompt(prompt: str) -> str:
    return (
        "Create a build123d CAD generator for this requirement. "
        "Return exactly one JSON object and no other text. "
        "The JSON object must have string fields title, geometryType, source and an object field parameters. "
        "The Python source must define gen_step() and not write files.\n\n"
        f"Requirement:\n{prompt}"
    )


def _build_simplified_user_prompt(prompt: str, failure: str) -> str:
    return (
        "The previous response failed because it did not provide parseable JSON. "
        "Now create a simplified but valid build123d CAD model. Return exactly one JSON object and no other text. "
        "Prioritize a closed STEP-exportable solid over perfect detail. Use simple Box, Cylinder, boolean subtract, "
        "and a small number of chamfers/fillets only when robust. Avoid fragile selectors and complex sketches. "
        "The source must define gen_step().\n\n"
        f"Failure:\n{failure}\n\n"
        f"Requirement:\n{prompt}"
    )


def _extract_json_object(content: str) -> dict[str, Any]:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        candidate = _first_balanced_json_object(stripped)
        if candidate is None:
            raise ValueError("LLM response did not contain a JSON object")
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise ValueError(f"LLM response JSON is invalid: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise ValueError("LLM response JSON must be an object")
    return payload


def _first_balanced_json_object(text: str) -> str | None:
    start = text.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escape = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : index + 1]
        start = text.find("{", start + 1)
    return None


def _choice_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("CAD script LLM response did not contain choices")
    first = choices[0]
    if not isinstance(first, dict):
        raise RuntimeError("CAD script LLM response choice is invalid")
    message = first.get("message")
    if not isinstance(message, dict) or not isinstance(message.get("content"), str):
        raise RuntimeError("CAD script LLM response did not contain message.content")
    return message["content"]


def _numeric_parameters(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): float(raw)
        for key, raw in value.items()
        if isinstance(raw, (int, float)) and not isinstance(raw, bool)
    }


def _string_value(payload: dict[str, Any], key: str, default: str) -> str:
    value = payload.get(key)
    return value if isinstance(value, str) and value.strip() else default


def _setting(name: str) -> str:
    return os.getenv(name, "").strip()


def _timeout_seconds() -> int:
    raw = _setting("CAD_SCRIPT_TIMEOUT_SECONDS")
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS
    return max(30, min(value, 900))


def _max_tokens() -> int:
    raw = _setting("CAD_SCRIPT_MAX_TOKENS")
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_TOKENS
    return max(3000, min(value, 32000))
