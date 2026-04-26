from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
import requests

GenerationMode = Literal["text-to-3d", "image-to-3d"]
JobStatus = Literal["queued", "running", "postprocessing", "completed", "failed"]
TargetFormat = Literal["glb", "fbx", "obj"]
GenerationQuality = Literal["draft", "balanced", "production"]
ImageAspectRatio = Literal["1:1", "16:9", "9:16", "4:3", "3:4"]

MESHY_BASE_URL = "https://api.meshy.ai/openapi/v2/text-to-3d"
TENCENT_AI3D_HOST = "ai3d.tencentcloudapi.com"
TENCENT_AI3D_ENDPOINT = f"https://{TENCENT_AI3D_HOST}"
TENCENT_AI3D_SERVICE = "ai3d"
TENCENT_AI3D_VERSION = "2025-05-13"
TENCENT_HUNYUAN_INTL_HOST = "hunyuan.intl.tencentcloudapi.com"
TENCENT_HUNYUAN_INTL_SERVICE = "hunyuan"
TENCENT_HUNYUAN_INTL_VERSION = "2023-09-01"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


ROOT_DIR = Path(__file__).resolve().parents[2]
load_env_file(ROOT_DIR / ".env")
load_env_file(Path(__file__).resolve().parent / ".env")


class CreateJobRequest(BaseModel):
    prompt: str = Field(max_length=1200)
    mode: GenerationMode = "text-to-3d"
    quality: GenerationQuality = "balanced"
    style: str = Field(default="game-ready", max_length=80)
    targetFormat: TargetFormat = "glb"


class CreateImageJobRequest(BaseModel):
    prompt: str = Field(max_length=1200)
    aspectRatio: ImageAspectRatio = "1:1"


class JobMetadata(BaseModel):
    engine: str
    polygonBudget: str
    textureSet: str
    providerTaskId: str | None = None


class GenerationJob(BaseModel):
    id: str
    prompt: str
    mode: GenerationMode
    status: JobStatus
    progress: int
    quality: GenerationQuality
    style: str
    targetFormat: TargetFormat
    createdAt: str
    updatedAt: str
    modelUrl: str | None
    thumbnailUrl: str | None
    error: str | None
    metadata: JobMetadata | None = None


class ImageJob(BaseModel):
    id: str
    prompt: str
    status: JobStatus
    progress: int
    aspectRatio: ImageAspectRatio
    createdAt: str
    updatedAt: str
    imageUrl: str | None
    error: str | None


@dataclass(frozen=True)
class TencentAi3dConfig:
    host: str
    endpoint: str
    service: str
    version: str
    region: str


app = FastAPI(title="3D Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: dict[str, GenerationJob] = {}
image_jobs: dict[str, ImageJob] = {}
DEMO_MODEL_PATH = ROOT_DIR / "apps" / "web" / "public" / "models" / "demo-asset.glb"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sorted_jobs() -> list[GenerationJob]:
    return sorted(jobs.values(), key=lambda job: job.createdAt, reverse=True)


def stream_remote_response(response: requests.Response):
    try:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                yield chunk
    finally:
        response.close()


def selected_provider() -> str:
    return os.getenv("MODEL_PROVIDER", "mock").strip().lower()


def selected_image_provider() -> str:
    return os.getenv("IMAGE_PROVIDER", "siliconflow").strip().lower()


def update_job(job_id: str, **updates: Any) -> GenerationJob | None:
    job = jobs.get(job_id)
    if job is None:
        return None
    for key, value in updates.items():
        setattr(job, key, value)
    job.updatedAt = now_iso()
    jobs[job_id] = job
    return job


def update_image_job(job_id: str, **updates: Any) -> ImageJob | None:
    job = image_jobs.get(job_id)
    if job is None:
        return None
    for key, value in updates.items():
        setattr(job, key, value)
    job.updatedAt = now_iso()
    image_jobs[job_id] = job
    return job


def sorted_image_jobs() -> list[ImageJob]:
    return sorted(image_jobs.values(), key=lambda job: job.createdAt, reverse=True)


def meshy_headers() -> dict[str, str]:
    api_key = os.getenv("MESHY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("MESHY_API_KEY is not configured.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def tencent_credentials() -> tuple[str, str]:
    secret_id = os.getenv("TENCENTCLOUD_SECRET_ID", "").strip()
    secret_key = os.getenv("TENCENTCLOUD_SECRET_KEY", "").strip()
    if not secret_id or not secret_key:
        raise RuntimeError(
            "MODEL_PROVIDER=hunyuan requires TENCENTCLOUD_SECRET_ID and "
            "TENCENTCLOUD_SECRET_KEY. The Tencent Cloud API 3.0 docs do not "
            "use a single sk-* API key."
        )
    return secret_id, secret_key


def tencent_ai3d_config() -> TencentAi3dConfig:
    profile = os.getenv("TENCENTCLOUD_HUNYUAN_PROFILE", "domestic").strip().lower()
    if profile in {"international", "intl", "global"}:
        host = TENCENT_HUNYUAN_INTL_HOST
        return TencentAi3dConfig(
            host=host,
            endpoint=f"https://{host}",
            service=TENCENT_HUNYUAN_INTL_SERVICE,
            version=TENCENT_HUNYUAN_INTL_VERSION,
            region=os.getenv("TENCENTCLOUD_REGION", "ap-singapore").strip(),
        )

    if profile in {"domestic", "cn", "china"}:
        host = TENCENT_AI3D_HOST
        return TencentAi3dConfig(
            host=host,
            endpoint=f"https://{host}",
            service=TENCENT_AI3D_SERVICE,
            version=TENCENT_AI3D_VERSION,
            region=os.getenv("TENCENTCLOUD_REGION", "ap-guangzhou").strip(),
        )

    raise RuntimeError(
        "TENCENTCLOUD_HUNYUAN_PROFILE must be domestic or international."
    )


def sign_tencent(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def call_tencent_ai3d(action: str, payload: dict[str, Any]) -> dict[str, Any]:
    secret_id, secret_key = tencent_credentials()
    config = tencent_ai3d_config()
    timestamp = int(time.time())
    date = datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%d")
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    canonical_request = "\n".join(
        [
            "POST",
            "/",
            "",
            f"content-type:application/json; charset=utf-8\nhost:{config.host}\nx-tc-action:{action.lower()}\n",
            "content-type;host;x-tc-action",
            hashlib.sha256(body.encode("utf-8")).hexdigest(),
        ]
    )
    credential_scope = f"{date}/{config.service}/tc3_request"
    string_to_sign = "\n".join(
        [
            "TC3-HMAC-SHA256",
            str(timestamp),
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    secret_date = sign_tencent(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = sign_tencent(secret_date, config.service)
    secret_signing = sign_tencent(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    authorization = (
        "TC3-HMAC-SHA256 "
        f"Credential={secret_id}/{credential_scope}, "
        "SignedHeaders=content-type;host;x-tc-action, "
        f"Signature={signature}"
    )

    response = requests.post(
        config.endpoint,
        headers={
            "Authorization": authorization,
            "Content-Type": "application/json; charset=utf-8",
            "Host": config.host,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": config.version,
            "X-TC-Region": config.region,
        },
        data=body.encode("utf-8"),
        timeout=60,
    )
    data = response.json()
    error = data.get("Response", {}).get("Error")
    if response.status_code >= 400 or error:
        raise RuntimeError(
            f"Tencent Hunyuan3D {action} failed: "
            f"{json.dumps(data, ensure_ascii=False)}"
        )
    return data["Response"]


def hunyuan_result_format(target_format: TargetFormat) -> str:
    return {"glb": "GLB", "fbx": "FBX", "obj": "OBJ"}[target_format]


def create_hunyuan_rapid_task(request: CreateJobRequest) -> str:
    response = call_tencent_ai3d(
        "SubmitHunyuanTo3DRapidJob",
        {
            "Prompt": request.prompt.strip(),
            "ResultFormat": hunyuan_result_format(request.targetFormat),
            "EnablePBR": True,
        },
    )
    job_id = response.get("JobId")
    if not job_id:
        raise RuntimeError("Tencent Hunyuan3D submit response did not include JobId.")
    return str(job_id)


def query_hunyuan_rapid_task(provider_job_id: str) -> dict[str, Any]:
    return call_tencent_ai3d(
        "QueryHunyuanTo3DRapidJob",
        {
            "JobId": provider_job_id,
        },
    )


def model_url_from_hunyuan(task: dict[str, Any]) -> str | None:
    files = task.get("ResultFile3Ds") or []
    if isinstance(files, list):
        for item in files:
            if isinstance(item, dict) and item.get("Url"):
                return str(item["Url"])
    return task.get("ResultUrl") or task.get("Url")


def meshy_art_style(style: str) -> str:
    normalized = style.strip().lower()
    if normalized in {"stylized", "game-ready"}:
        return "sculpture"
    return "realistic"


def create_meshy_preview_task(request: CreateJobRequest) -> str:
    payload = {
        "mode": "preview",
        "prompt": request.prompt.strip(),
        "art_style": meshy_art_style(request.style),
        "should_remesh": True,
        "moderation": True,
    }
    response = requests.post(
        MESHY_BASE_URL,
        headers=meshy_headers(),
        json=payload,
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy create task failed: {response.text}")
    result = response.json().get("result")
    if not result:
        raise RuntimeError("Meshy create task response did not include result.")
    return str(result)


def get_meshy_task(task_id: str) -> dict[str, Any]:
    response = requests.get(
        f"{MESHY_BASE_URL}/{task_id}",
        headers=meshy_headers(),
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy task poll failed: {response.text}")
    return response.json()


def model_url_from_meshy(task: dict[str, Any], target_format: TargetFormat) -> str | None:
    model_urls = task.get("model_urls") or {}
    return (
        model_urls.get(target_format)
        or model_urls.get("glb")
        or model_urls.get("obj")
        or model_urls.get("fbx")
    )


def image_size_for_aspect_ratio(aspect_ratio: ImageAspectRatio) -> str:
    return {
        "1:1": "512x512",
        "16:9": "1024x576",
        "9:16": "576x1024",
        "4:3": "1024x768",
        "3:4": "768x1024",
    }[aspect_ratio]


def siliconflow_image_headers() -> dict[str, str]:
    api_key = os.getenv("SILICONFLOW_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "IMAGE_PROVIDER=siliconflow requires SILICONFLOW_API_KEY in .env."
        )
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def siliconflow_image_payload(
    request: CreateImageJobRequest, seed: int | None = None
) -> dict[str, Any]:
    model = (
        os.getenv("SILICONFLOW_IMAGE_MODEL", "Qwen/Qwen-Image")
        .strip()
        or "Qwen/Qwen-Image"
    )
    payload: dict[str, Any] = {
        "model": model,
        "prompt": request.prompt.strip(),
        "image_size": image_size_for_aspect_ratio(request.aspectRatio),
        "batch_size": 1,
        "num_inference_steps": 20,
        "guidance_scale": 7.5,
        "output_format": "png",
    }
    if seed is not None:
        payload["seed"] = seed
    return payload


def create_siliconflow_image(request: CreateImageJobRequest) -> str:
    seed = int(time.time() * 1000) % 1_000_000_000
    response = requests.post(
        "https://api.siliconflow.cn/v1/images/generations",
        headers=siliconflow_image_headers(),
        json=siliconflow_image_payload(request, seed=seed),
        timeout=120,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"SiliconFlow image generation failed: {response.text}")

    data = response.json()
    images = data.get("images") or data.get("data") or []
    if not isinstance(images, list) or not images:
        raise RuntimeError(
            f"SiliconFlow image generation returned no images: {json.dumps(data, ensure_ascii=False)}"
        )
    first = images[0]
    if not isinstance(first, dict) or not first.get("url"):
        raise RuntimeError(
            f"SiliconFlow image generation returned no image URL: {json.dumps(data, ensure_ascii=False)}"
        )
    return str(first["url"])


async def run_siliconflow_image_generation(
    job_id: str, request: CreateImageJobRequest
) -> None:
    try:
        update_image_job(job_id, status="running", progress=35)
        image_url = await asyncio.to_thread(create_siliconflow_image, request)
        update_image_job(
            job_id,
            status="completed",
            progress=100,
            imageUrl=image_url,
            error=None,
        )
    except Exception as exc:
        update_image_job(job_id, status="failed", progress=0, error=str(exc))


async def run_meshy_generation(job_id: str, request: CreateJobRequest) -> None:
    if request.mode != "text-to-3d":
        update_job(
            job_id,
            status="failed",
            progress=0,
            error="Meshy provider currently supports text-to-3d in this MVP.",
        )
        return

    try:
        update_job(
            job_id,
            status="queued",
            progress=3,
            metadata=JobMetadata(
                engine="Meshy Text to 3D API",
                polygonBudget="Managed by Meshy preview task",
                textureSet="Preview mesh; refine can be added later",
            ),
        )
        provider_task_id = await asyncio.to_thread(create_meshy_preview_task, request)
        job = jobs.get(job_id)
        if job and job.metadata:
            job.metadata.providerTaskId = provider_task_id
            jobs[job_id] = job

        while True:
            await asyncio.sleep(5)
            task = await asyncio.to_thread(get_meshy_task, provider_task_id)
            provider_status = str(task.get("status", "")).upper()
            progress = int(task.get("progress") or 0)

            if provider_status == "PENDING":
                update_job(job_id, status="queued", progress=max(progress, 5))
                continue

            if provider_status == "IN_PROGRESS":
                update_job(job_id, status="running", progress=max(progress, 10))
                continue

            if provider_status == "SUCCEEDED":
                model_url = model_url_from_meshy(task, request.targetFormat)
                if not model_url:
                    raise RuntimeError("Meshy task succeeded but returned no model URL.")
                update_job(
                    job_id,
                    status="completed",
                    progress=100,
                    modelUrl=model_url,
                    thumbnailUrl=task.get("thumbnail_url"),
                    error=None,
                )
                return

            if provider_status in {"FAILED", "CANCELED"}:
                task_error = task.get("task_error") or {}
                message = task_error.get("message") or f"Meshy task {provider_status.lower()}."
                update_job(job_id, status="failed", progress=progress, error=message)
                return

            update_job(job_id, status="running", progress=max(progress, 10))
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), progress=0)


async def run_hunyuan_generation(job_id: str, request: CreateJobRequest) -> None:
    if request.mode != "text-to-3d":
        update_job(
            job_id,
            status="failed",
            progress=0,
            error="腾讯云混元生 3D Provider 当前只支持文本生成 3D。",
        )
        return

    try:
        update_job(
            job_id,
            status="queued",
            progress=3,
            metadata=JobMetadata(
                engine="Tencent Cloud Hunyuan3D API",
                polygonBudget="由混元生 3D 快速接口生成",
                textureSet="EnablePBR=true",
            ),
        )
        provider_job_id = await asyncio.to_thread(create_hunyuan_rapid_task, request)
        job = jobs.get(job_id)
        if job and job.metadata:
            job.metadata.providerTaskId = provider_job_id
            jobs[job_id] = job

        while True:
            await asyncio.sleep(6)
            task = await asyncio.to_thread(query_hunyuan_rapid_task, provider_job_id)
            raw_status = str(task.get("Status", "")).upper()
            progress = int(task.get("Progress") or 0)

            if raw_status in {"DONE", "SUCCESS", "SUCCEEDED"}:
                model_url = model_url_from_hunyuan(task)
                if not model_url:
                    raise RuntimeError("混元生 3D 任务成功，但返回结果里没有模型 URL。")
                update_job(
                    job_id,
                    status="completed",
                    progress=100,
                    modelUrl=model_url,
                    thumbnailUrl=task.get("ResultImageUrl"),
                    error=None,
                )
                return

            if raw_status in {"FAIL", "FAILED", "ERROR"}:
                message = (
                    task.get("ErrorMessage")
                    or task.get("Error")
                    or "混元生 3D 任务失败。"
                )
                update_job(job_id, status="failed", progress=progress, error=str(message))
                return

            next_status: JobStatus = "running"
            if raw_status in {"WAIT", "WAITING", "PENDING", "QUEUED"}:
                next_status = "queued"
            if raw_status in {"POSTPROCESSING", "POST_PROCESSING"}:
                next_status = "postprocessing"
            update_job(job_id, status=next_status, progress=max(progress, 5))
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), progress=0)


async def simulate_generation(job_id: str) -> None:
    stages: list[tuple[JobStatus, int, float]] = [
        ("queued", 8, 0.8),
        ("running", 24, 0.9),
        ("running", 46, 0.9),
        ("running", 68, 0.9),
        ("postprocessing", 84, 0.9),
        ("postprocessing", 94, 0.7),
    ]

    for status, progress, delay in stages:
        await asyncio.sleep(delay)
        if update_job(job_id, status=status, progress=progress) is None:
            return

    update_job(
        job_id,
        status="completed",
        progress=100,
        modelUrl="/models/demo-asset.glb",
        thumbnailUrl=None,
        metadata=JobMetadata(
            engine="Mock GPU worker",
            polygonBudget="18k preview triangles",
            textureSet="PBR base color, roughness, normal placeholders",
        ),
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "3d-agent-api",
        "provider": selected_provider(),
        "imageProvider": selected_image_provider(),
    }


@app.post("/api/jobs", response_model=GenerationJob)
async def create_job(request: CreateJobRequest) -> GenerationJob:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    provider = selected_provider()
    if provider == "meshy" and not os.getenv("MESHY_API_KEY", "").strip():
        raise HTTPException(
            status_code=400,
            detail="MODEL_PROVIDER=meshy requires MESHY_API_KEY in .env or the shell environment.",
        )
    if provider == "hunyuan" and (
        not os.getenv("TENCENTCLOUD_SECRET_ID", "").strip()
        or not os.getenv("TENCENTCLOUD_SECRET_KEY", "").strip()
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "MODEL_PROVIDER=hunyuan requires TENCENTCLOUD_SECRET_ID and "
                "TENCENTCLOUD_SECRET_KEY. The Tencent Cloud API 3.0 docs do "
                "not use a single sk-* API key."
            ),
        )

    timestamp = now_iso()
    job = GenerationJob(
        id=str(uuid4()),
        prompt=prompt,
        mode=request.mode,
        status="queued",
        progress=0,
        quality=request.quality,
        style=request.style,
        targetFormat=request.targetFormat,
        createdAt=timestamp,
        updatedAt=timestamp,
        modelUrl=None,
        thumbnailUrl=None,
        error=None,
        metadata=None,
    )
    jobs[job.id] = job

    if provider == "meshy":
        asyncio.create_task(run_meshy_generation(job.id, request))
    elif provider == "hunyuan":
        asyncio.create_task(run_hunyuan_generation(job.id, request))
    else:
        asyncio.create_task(simulate_generation(job.id))

    return job


@app.get("/api/jobs", response_model=list[GenerationJob])
async def list_jobs() -> list[GenerationJob]:
    return sorted_jobs()[:20]


@app.post("/api/image-jobs", response_model=ImageJob)
async def create_image_job(request: CreateImageJobRequest) -> ImageJob:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    provider = selected_image_provider()
    if provider not in {"siliconflow", "mock"}:
        raise HTTPException(
            status_code=400,
            detail="IMAGE_PROVIDER must be siliconflow or mock.",
        )
    if provider == "siliconflow" and not os.getenv("SILICONFLOW_API_KEY", "").strip():
        raise HTTPException(
            status_code=400,
            detail="IMAGE_PROVIDER=siliconflow requires SILICONFLOW_API_KEY in .env.",
        )

    timestamp = now_iso()
    job = ImageJob(
        id=str(uuid4()),
        prompt=prompt,
        status="queued",
        progress=0,
        aspectRatio=request.aspectRatio,
        createdAt=timestamp,
        updatedAt=timestamp,
        imageUrl=None,
        error=None,
    )
    image_jobs[job.id] = job

    asyncio.create_task(run_siliconflow_image_generation(job.id, request))
    return job


@app.get("/api/image-jobs", response_model=list[ImageJob])
async def list_image_jobs() -> list[ImageJob]:
    return sorted_image_jobs()[:20]


@app.get("/api/image-jobs/{job_id}", response_model=ImageJob)
async def get_image_job(job_id: str) -> ImageJob:
    job = image_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Image job not found.")
    return job


@app.get("/api/image-jobs/{job_id}/image")
async def get_image_job_image(job_id: str):
    job = image_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Image job not found.")
    if job.status != "completed" or not job.imageUrl:
        raise HTTPException(status_code=409, detail="Image is not ready yet.")
    try:
        response = requests.get(job.imageUrl, stream=True, timeout=120)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch generated image: {exc}",
        ) from exc

    content_type = response.headers.get("content-type") or "image/png"
    return StreamingResponse(
        stream_remote_response(response),
        media_type=content_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="{job.id}.png"',
        },
    )


@app.get("/api/jobs/{job_id}/model")
async def get_job_model(job_id: str, format: TargetFormat | None = None):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "completed" or not job.modelUrl:
        raise HTTPException(status_code=409, detail="Model is not ready yet.")

    export_format = format or job.targetFormat
    if export_format != job.targetFormat:
        raise HTTPException(
            status_code=409,
            detail=(
                f"当前任务只生成了 {job.targetFormat.upper()} 文件。"
                f"如需 {export_format.upper()}，请用该格式重新生成。"
            ),
        )

    if job.modelUrl == "/models/demo-asset.glb":
        if not DEMO_MODEL_PATH.exists():
            raise HTTPException(status_code=404, detail="Demo model not found.")
        return FileResponse(
            DEMO_MODEL_PATH,
            media_type="model/gltf-binary",
            filename=f"{job.id}.{export_format}",
        )

    if not job.modelUrl.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Unsupported model URL.")

    try:
        response = requests.get(job.modelUrl, stream=True, timeout=120)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch generated model: {exc}",
        ) from exc

    content_type = response.headers.get("content-type") or "model/gltf-binary"
    return StreamingResponse(
        stream_remote_response(response),
        media_type=content_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'attachment; filename="{job.id}.{export_format}"',
        },
    )


@app.get("/api/jobs/{job_id}", response_model=GenerationJob)
async def get_job(job_id: str) -> GenerationJob:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job
