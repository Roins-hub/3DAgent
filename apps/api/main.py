from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import hmac
import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
import requests

GenerationMode = Literal["text-to-3d", "image-to-3d"]
JobStatus = Literal["queued", "running", "postprocessing", "completed", "failed"]
TargetFormat = Literal["glb", "fbx", "obj", "stl"]
GenerationQuality = Literal["draft", "balanced", "production"]
ImageAspectRatio = Literal["1:1", "16:9", "9:16", "4:3", "3:4"]

MESHY_BASE_URL = "https://api.meshy.ai/openapi/v2/text-to-3d"
TENCENT_AI3D_HOST = "ai3d.tencentcloudapi.com"
TENCENT_AI3D_ENDPOINT = f"https://{TENCENT_AI3D_HOST}"
TENCENT_AI3D_SERVICE = "ai3d"
TENCENT_AI3D_VERSION = "2025-05-13"
TENCENT_HUNYUAN_GENERATE_ACTION = "SubmitHunyuanTo3DJob"
TENCENT_HUNYUAN_STATUS_ACTION = "QueryHunyuanTo3DJob"
TENCENT_HUNYUAN_INTL_HOST = "hunyuan.intl.tencentcloudapi.com"
TENCENT_HUNYUAN_INTL_SERVICE = "hunyuan"
TENCENT_HUNYUAN_INTL_VERSION = "2023-09-01"
SILICONFLOW_DEFAULT_IMAGE_MODEL = "Kwai-Kolors/Kolors"
SILICONFLOW_IMAGE_TIMEOUT_SECONDS = 180
OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-2"
OPENAI_IMAGE_TIMEOUT_SECONDS = 360
NEURAL4D_DEFAULT_BASE_URL = "https://alb.neural4d.com:3000/api"
NEURAL4D_POLL_SECONDS = 8
SUPABASE_REQUEST_RETRIES = 2
SUPABASE_AUTH_CACHE_SECONDS = 60
ADMIN_SETTINGS_CACHE_SECONDS = 30
ADMIN_SECRET_KEYS = {
    "MESHY_API_KEY",
    "NEURAL4D_API_TOKEN",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
    "SILICONFLOW_API_KEY",
    "OPENAI_API_KEY",
    "CADAM_OPENAI_API_KEY",
    "MIMO_API_KEY",
}
ADMIN_VISIBLE_SETTING_KEYS = [
    "MODEL_PROVIDER",
    "IMAGE_PROVIDER",
    "CADAM_LLM_PROVIDER",
    "OPENAI_IMAGE_MODEL",
    "SILICONFLOW_IMAGE_MODEL",
    "MIMO_CHAT_MODEL",
    "OPENAI_API_KEY",
    "SILICONFLOW_API_KEY",
    "MIMO_API_KEY",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
]


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
API_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_env_file(ROOT_DIR / ".env")
load_env_file(API_ENV_PATH)


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


class AuthUser(BaseModel):
    id: str
    email: str | None = None
    username: str | None = None


class AdminSummary(BaseModel):
    totalUsers: int
    totalJobs: int
    modelJobs: int
    imageJobs: int
    failedJobs: int
    runningJobs: int
    completedJobs: int
    recentJobs: list[dict[str, Any]] = Field(default_factory=list)


class AdminUser(BaseModel):
    id: str
    email: str | None = None
    username: str | None = None
    createdAt: str | None = None
    lastSignInAt: str | None = None
    isBanned: bool = False


class AdminUsersResponse(BaseModel):
    users: list[AdminUser]


class AdminUserAction(BaseModel):
    action: Literal["disable", "restore"]


class AdminGenerationJobAction(BaseModel):
    action: Literal["soft_delete", "restore", "retry"]


class AdminSettingInput(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    value: str | None = Field(default=None, max_length=4000)
    isSecret: bool = False


class AdminSettingView(BaseModel):
    key: str
    value: str | None = None
    isSecret: bool = False
    isConfigured: bool = False
    updatedAt: str | None = None


class AdminSettingsUpdate(BaseModel):
    settings: list[AdminSettingInput] = Field(default_factory=list, max_length=80)


class AdminSettingsResponse(BaseModel):
    settings: list[AdminSettingView]


class AdminAuditLog(BaseModel):
    id: str | None = None
    adminId: str | None = None
    adminEmail: str | None = None
    action: str
    targetType: str
    targetId: str | None = None
    summary: str | None = None
    createdAt: str | None = None


class HelpChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class HelpChatRequest(BaseModel):
    messages: list[HelpChatMessage] = Field(default_factory=list, max_length=30)
    selectedTool: str | None = Field(default=None, max_length=80)
    hasImage: bool = False
    imageDataUrl: str | None = Field(default=None, max_length=70_000_000)


class HelpChatResponse(BaseModel):
    message: str


class CadamGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2400)
    parameters: dict[str, Any] = Field(default_factory=dict)


class CadamGenerateResponse(BaseModel):
    name: str
    description: str
    scad: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    provider: str
    model: str


@dataclass(frozen=True)
class TencentAi3dConfig:
    host: str
    endpoint: str
    service: str
    version: str
    region: str


app = FastAPI(title="智模工坊 API", version="0.1.0")

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
job_contexts: dict[str, dict[str, str]] = {}
auth_user_cache: dict[str, tuple[float, AuthUser]] = {}
admin_settings_cache: tuple[float, dict[str, dict[str, Any]]] | None = None
DEMO_MODEL_PATH = ROOT_DIR / "apps" / "web" / "public" / "models" / "demo-asset.glb"
MODEL_CACHE_DIR = ROOT_DIR / ".cache" / "models"
IMAGE_CACHE_DIR = ROOT_DIR / ".cache" / "images"
MODEL_CONVERTER_SCRIPT = ROOT_DIR / "apps" / "api" / "scripts" / "convert_model.mjs"


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


def auth_cache_key(authorization: str) -> str:
    return hashlib.sha256(authorization.encode("utf-8")).hexdigest()


def get_cached_auth_user(authorization: str) -> AuthUser | None:
    cached = auth_user_cache.get(auth_cache_key(authorization))
    if not cached:
        return None

    expires_at, user = cached
    if expires_at <= time.monotonic():
        auth_user_cache.pop(auth_cache_key(authorization), None)
        return None
    return user


def cache_auth_user(authorization: str, user: AuthUser) -> None:
    auth_user_cache[auth_cache_key(authorization)] = (
        time.monotonic() + SUPABASE_AUTH_CACHE_SECONDS,
        user,
    )


def user_owns_local_job(job_id: str, user: AuthUser) -> bool:
    return job_contexts.get(job_id, {}).get("user_id") == user.id


def model_cache_path(
    job: GenerationJob, export_format: TargetFormat, source_url: str | None = None
) -> Path:
    cache_key = hashlib.sha256(
        f"{job.id}:{source_url or job.modelUrl}:{export_format}".encode("utf-8")
    ).hexdigest()
    return MODEL_CACHE_DIR / f"{cache_key}.{export_format}"


def infer_model_format(model_url: str | None, fallback: TargetFormat) -> TargetFormat:
    if model_url:
        suffix = Path(model_url.split("?", 1)[0]).suffix.lower().lstrip(".")
        if suffix in {"glb", "fbx", "obj", "stl"}:
            return suffix  # type: ignore[return-value]
    return fallback


def can_convert_model_locally(source_format: TargetFormat, target_format: TargetFormat) -> bool:
    return source_format == "glb" and target_format in {"obj", "stl", "fbx"}


def model_media_type(export_format: TargetFormat) -> str:
    if export_format == "glb":
        return "model/gltf-binary"
    if export_format == "obj":
        return "model/obj"
    if export_format == "stl":
        return "model/stl"
    return "application/octet-stream"


def file_response_for_model(job: GenerationJob, export_format: TargetFormat, path: Path):
    return FileResponse(
        path,
        media_type=model_media_type(export_format),
        filename=f"{job.id}.{export_format}",
    )


def format_unavailable_error(job: GenerationJob, export_format: TargetFormat) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=(
            f"当前任务没有可用的 {export_format.upper()} 文件。"
            f"请用 {export_format.upper()} 重新生成，或选择 {job.targetFormat.upper()} 导出。"
        ),
    )


def convert_model_file(source_path: Path, target_path: Path, target_format: TargetFormat) -> None:
    if target_format not in {"obj", "stl", "fbx"}:
        raise RuntimeError(f"Local conversion to {target_format.upper()} is not supported.")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "node",
            str(MODEL_CONVERTER_SCRIPT),
            str(source_path),
            str(target_path),
            target_format,
        ],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "Unknown conversion error").strip()
        raise RuntimeError(f"Model conversion failed: {message}")


def download_remote_model(source_url: str, target_path: Path) -> None:
    try:
        response = requests.get(source_url, stream=True, timeout=120)
        response.raise_for_status()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = target_path.with_suffix(f"{target_path.suffix}.tmp")
        try:
            with temp_path.open("wb") as model_file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        model_file.write(chunk)
            temp_path.replace(target_path)
        finally:
            response.close()
            if temp_path.exists():
                temp_path.unlink()
    except requests.RequestException as exc:
        raise RuntimeError(f"Could not fetch generated model: {exc}") from exc


def selected_provider() -> str:
    return runtime_setting_value("MODEL_PROVIDER", "mock").strip().lower()


def selected_image_provider() -> str:
    return runtime_setting_value("IMAGE_PROVIDER", "siliconflow").strip().lower()


def mimo_base_url() -> str:
    return (
        runtime_setting_value("MIMO_BASE_URL", "https://api.xiaomimimo.com/v1")
        .strip()
        .rstrip(";")
        .rstrip("/")
    )


def mimo_chat_model() -> str:
    return runtime_setting_value("MIMO_CHAT_MODEL", "mimo-v2.5-pro").strip() or "mimo-v2.5-pro"


def cadam_chat_model() -> str:
    return runtime_setting_value("CADAM_CHAT_MODEL", mimo_chat_model()).strip() or mimo_chat_model()


def cadam_llm_provider() -> str:
    return runtime_setting_value("CADAM_LLM_PROVIDER", "mimo").strip().lower() or "mimo"


def cadam_openai_base_url() -> str:
    return (
        runtime_setting_value(
            "CADAM_OPENAI_BASE_URL",
            runtime_setting_value("OPENAI_IMAGE_BASE_URL", "https://api.openai.com/v1"),
        )
        .strip()
        .rstrip("/")
    )


def cadam_openai_model() -> str:
    return runtime_setting_value("CADAM_OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"


def is_mimo_vision_model(model: str) -> bool:
    return model in {"mimo-v2.5", "mimo-v2-omni"}


def validate_image_data_url(image_data_url: str) -> str:
    value = image_data_url.strip()
    if not value.startswith("data:image/") or ";base64," not in value:
        raise HTTPException(
            status_code=400,
            detail="Image must be sent as a base64 data URL.",
        )
    return value


def help_system_prompt() -> str:
    return (
        "你是智模工坊平台的中文 AI 帮助助手。你的职责是帮助用户理解和排查本平台的使用问题，"
        "包括账号登录、邮箱验证码、工业模型生成、图片生成、CAD 参数获取、CADAM 参数化建模、"
        "提示词优化、模型格式和下载、以及常见启动报错。"
        "当用户询问 CAD 参数或 CAD 建模时，要说明用户可以先让 AI 根据用途、外形、尺寸约束、"
        "孔位、厚度、圆角、材质和装配关系整理参数值，再把这些参数带到 CADAM 工作台生成参数化 OpenSCAD，"
        "最后在工业建模/CAD 工作台预览、调整和导出模型。"
        "回答要简洁、具体、按步骤说明。不要编造平台不存在的功能；如果不确定，请说明需要用户提供更多信息。"
    )


def build_help_reply(request: HelpChatRequest) -> str:
    latest_user_message = next(
        (
            message.content.strip()
            for message in reversed(request.messages)
            if message.role == "user" and message.content.strip()
        ),
        "",
    )
    question = latest_user_message.lower()

    if request.hasImage:
        return (
            "我已经收到图片。当前帮助助手先支持说明和排查，后续接入真实多模态模型后，"
            "可以根据图片内容直接建议工业模型生成提示词。现在你可以先描述图片主体、风格、"
            "用途和目标格式，我会帮你整理成适合生成的提示词。"
        )

    if any(keyword in question for keyword in ["cad", "cadam", "参数", "尺寸", "建模", "openscad"]):
        return (
            "可以。推荐流程是：\n"
            "1. 先告诉 AI 你要做的零件用途、外形、关键尺寸、孔位、厚度、圆角、装配关系和目标单位。\n"
            "2. 让 AI 输出一组 CAD参数，例如 width、height、depth、thickness、holeDiameter、cornerRadius 等。\n"
            "3. 把确认后的参数带到 CADAM/工业 CAD 建模入口，由 CADAM 生成参数化 OpenSCAD 模型。\n"
            "4. 在 CAD 工作台预览模型，如果尺寸不合适，继续让 AI 调整参数后重新生成。\n"
            "例如你可以问：`帮我设计一个传感器安装支架，给出可建模的 CAD参数，并说明每个参数含义。`"
        )

    if any(keyword in question for keyword in ["登录", "验证码", "账号", "register", "login"]):
        return (
            "账号相关问题可以先按这几步排查：\n"
            "1. 确认邮箱地址没有多余空格，并检查垃圾邮件箱。\n"
            "2. 如果验证码过期，回到注册页重新发送验证码。\n"
            "3. 登录时需要用户名、邮箱和密码匹配；用户名不匹配会被主动退出。\n"
            "4. 如果仍然失败，可以清理浏览器本地登录状态后重新登录。"
        )

    if any(keyword in question for keyword in ["图片", "image", "图像"]):
        return (
            "图片生成入口在导航里的“图片生成”。建议提示词包含主体、风格、画面比例和用途，"
            "例如：`一台白色科幻无人机，产品渲染风格，16:9，干净背景`。生成后会在历史记录里"
            "保留结果，方便继续查看或下载。"
        )

    if any(keyword in question for keyword in ["下载", "模型", "glb", "fbx", "obj", "3d"]):
        return (
            "工业模型生成可以在“工业模型工作台”完成。一个好提示词通常包含：主体、用途、材质、风格、"
            "复杂度和目标格式。生成完成后，预览区会加载模型，历史记录中也能重新打开任务。"
            "如果需要特定格式，请在提交前选择 GLB、FBX 或 OBJ。"
        )

    if any(keyword in question for keyword in ["报错", "失败", "错误", "error", "端口", "启动"]):
        return (
            "常见启动问题通常来自端口占用或旧进程未关闭。前端默认使用 3000，后端开发脚本使用 8016。"
            "如果看到 `Another next dev server is already running`，可以先查 3000 端口对应 PID，"
            "再用 `taskkill /PID <PID> /T /F` 结束旧进程后重新启动。"
        )

    if request.selectedTool == "writePrompt":
        return (
            "我可以帮你优化提示词。请尽量提供：主体、风格、材质、用途、比例或目标格式。"
            "例如把“机器人”扩写成“一个游戏可用的圆润服务机器人，白色陶瓷外壳，蓝色发光面板，"
            "低多边形但保留 PBR 材质，输出 GLB”。"
        )

    return (
        "我可以帮你处理智模工坊的使用问题。你可以问我：如何写工业模型生成提示词、"
        "图片生成怎么用、登录验证码问题、模型下载方式，或者把具体报错贴给我，我会按步骤帮你排查。"
    )


def build_mimo_help_chat_payload(request: HelpChatRequest) -> dict[str, Any]:
    model = mimo_chat_model()
    image_data_url = validate_image_data_url(request.imageDataUrl) if request.imageDataUrl else None
    if image_data_url and not is_mimo_vision_model(model):
        raise HTTPException(
            status_code=400,
            detail="Image understanding requires MIMO_CHAT_MODEL=mimo-v2.5 or mimo-v2-omni.",
        )

    tool_hint = ""
    if request.selectedTool:
        tool_hint = f"\n用户当前选择的输入工具是：{request.selectedTool}。"

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": help_system_prompt() + tool_hint,
        }
    ]
    visible_messages = request.messages[-16:]
    last_user_index = next(
        (
            index
            for index in range(len(visible_messages) - 1, -1, -1)
            if visible_messages[index].role == "user"
        ),
        -1,
    )

    for index, message in enumerate(visible_messages):
        content = message.content.strip()
        if image_data_url and index == last_user_index:
            multimodal_content: list[dict[str, Any]] = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_data_url,
                    },
                }
            ]
            if content:
                multimodal_content.append({"type": "text", "text": content})
            else:
                multimodal_content.append({"type": "text", "text": "请描述这张图片，并回答用户的问题。"})
            messages.append({"role": message.role, "content": multimodal_content})
        elif content:
            messages.append({"role": message.role, "content": content})

    return {
        "model": model,
        "messages": messages,
        "max_completion_tokens": 1024,
        "temperature": 0.4,
        "top_p": 0.9,
    }


def mimo_headers() -> dict[str, str]:
    api_key = env_or_runtime_secret("MIMO_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="MiMo API key is not configured.")
    return {
        "api-key": api_key,
        "Content-Type": "application/json",
    }


def call_mimo_help_chat(request: HelpChatRequest) -> str:
    payload = build_mimo_help_chat_payload(request)
    payload["stream"] = False

    response = requests.post(
        f"{mimo_base_url()}/chat/completions",
        headers=mimo_headers(),
        json=payload,
        timeout=60,
    )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"MiMo help chat request failed: HTTP {response.status_code}",
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="MiMo returned invalid JSON.") from exc

    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="MiMo returned no choices.")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise HTTPException(status_code=502, detail="MiMo returned an invalid message.")

    content = message.get("content") or message.get("reasoning_content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="MiMo returned an empty response.")

    return content.strip()


def cadam_system_prompt() -> str:
    return (
        "You are CADAM inside Zhimo Workshop. Generate manufacturable parametric CAD as OpenSCAD. "
        "Return strict JSON only, with no markdown and no extra prose. Escape every newline in the scad string as \\n. "
        "The JSON schema is: "
        '{"name":"snake_case_part_name","description":"short Chinese description",'
        '"parameters":{"width":96,"height":64,"depth":38,"thickness":6,"holeDiameter":8},'
        '"scad":"valid OpenSCAD source code"}. '
        "Rules: use millimeters, create a complete module and call it at the end, prefer difference/union, "
        "use $fn values for smooth cylinders, avoid external imports/includes, and keep the SCAD self-contained. "
        "The main module must include default numeric parameters, for example module part(width=80, height=50). "
        "Do not reference width/height/depth/thickness/holeDiameter/cornerRadius unless they are module parameters "
        "or local variables. Define any helper module before the final main module call. Do not use negative cube sizes. "
        "Generate a 3D solid directly using cube, cylinder, sphere, hull, minkowski, union and difference. "
        "Do not output purely 2D operators such as polygon, square, circle or offset unless they are inside linear_extrude. "
        "Keep scad comments ASCII only or omit comments. "
        "If the user asks for an unsafe weapon or illegal item, generate a harmless industrial fixture instead."
    )


def fallback_cadam_payload_from_text(text: str) -> dict[str, Any]:
    fence = re.search(r"```(?:openscad|scad)?\s*(.*?)```", text, re.IGNORECASE | re.DOTALL)
    scad = fence.group(1).strip() if fence else ""
    if not scad:
        module_index = text.find("module ")
        if module_index >= 0:
            scad = text[module_index:].strip()

    if not scad:
        raise HTTPException(status_code=502, detail="CADAM model returned no OpenSCAD block.")

    module_match = re.search(r"module\s+([A-Za-z_][A-Za-z0-9_]*)", scad)
    name = module_match.group(1) if module_match else "cadam_part"
    return {
        "name": name,
        "description": "AI 生成的参数化 CAD 零件",
        "parameters": {},
        "scad": scad,
    }


def extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()

    try:
        parsed = json.loads(stripped)
    except ValueError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start < 0 or end <= start:
            return fallback_cadam_payload_from_text(stripped)
        try:
            parsed = json.loads(stripped[start : end + 1])
        except ValueError as exc:
            try:
                return fallback_cadam_payload_from_text(stripped)
            except HTTPException:
                raise HTTPException(status_code=502, detail="CADAM model returned invalid JSON.") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="CADAM model returned invalid JSON.")
    return parsed


def validate_cadam_scad(scad: Any) -> str:
    if not isinstance(scad, str) or not scad.strip():
        raise HTTPException(status_code=502, detail="CADAM model returned empty OpenSCAD.")
    value = scad.strip()
    if "module " not in value or "(" not in value or ")" not in value:
        raise HTTPException(status_code=502, detail="CADAM model returned incomplete OpenSCAD.")
    lowered = value.lower()
    if "include <" in lowered or "use <" in lowered or "import(" in lowered:
        raise HTTPException(
            status_code=502,
            detail="CADAM model returned OpenSCAD with external dependencies.",
        )
    if any(token in lowered for token in ["polygon(", "square(", "circle(", "offset("]) and "linear_extrude" not in lowered:
        raise HTTPException(
            status_code=502,
            detail="CADAM model returned 2D OpenSCAD without extrusion.",
        )
    return value


def normalize_cadam_parameters(parameters: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    source = parameters if isinstance(parameters, dict) else {}
    merged = {**fallback, **source}
    aliases = {
        "hole_diameter": "holeDiameter",
        "hole_d": "holeDiameter",
        "corner_radius": "cornerRadius",
    }
    for source_key, target_key in aliases.items():
        if source_key in merged and target_key not in merged:
            merged[target_key] = merged[source_key]
    return merged


def repair_main_module_defaults(scad: str, parameters: dict[str, Any]) -> str:
    module_match = re.search(r"module\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)", scad)
    if not module_match:
        return scad

    defaults: list[str] = []
    for key in ["width", "height", "depth", "thickness", "holeDiameter", "cornerRadius", "teeth"]:
        value = parameters.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            defaults.append(f"{key}={value:g}")

    if not defaults:
        return scad

    start, end = module_match.span()
    replacement = f"module {module_match.group(1)}({', '.join(defaults)})"
    return f"{scad[:start]}{replacement}{scad[end:]}"


def prefix_global_parameter_defaults(scad: str, parameters: dict[str, Any]) -> str:
    assignments: list[str] = []
    for key in ["width", "height", "depth", "thickness", "holeDiameter", "cornerRadius", "teeth"]:
        value = parameters.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            assignments.append(f"{key} = {value:g};")
    if not assignments:
        return scad
    return "\n".join(assignments) + "\n\n" + scad


def call_mimo_cadam_generation(request: CadamGenerateRequest) -> CadamGenerateResponse:
    model = cadam_chat_model()
    user_payload = {
        "prompt": request.prompt.strip(),
        "current_parameters": request.parameters,
        "output_language": "Chinese for description, OpenSCAD for scad",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": cadam_system_prompt()},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            },
        ],
        "max_completion_tokens": 2200,
        "temperature": 0.18,
        "top_p": 0.86,
        "stream": False,
    }

    try:
        response = requests.post(
            f"{mimo_base_url()}/chat/completions",
            headers=mimo_headers(),
            json=payload,
            timeout=90,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"CADAM MiMo request failed: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"CADAM model request failed: HTTP {response.status_code}",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="CADAM model returned invalid response JSON.") from exc

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="CADAM model returned no choices.")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise HTTPException(status_code=502, detail="CADAM model returned an invalid message.")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(
            status_code=502,
            detail="CADAM model returned no final CAD answer. Try CADAM_CHAT_MODEL=mimo-v2.5-pro.",
        )

    parsed = extract_json_object(content)
    name = parsed.get("name")
    description = parsed.get("description")
    parameters = normalize_cadam_parameters(parsed.get("parameters"), request.parameters)
    scad = validate_cadam_scad(
        prefix_global_parameter_defaults(
            repair_main_module_defaults(str(parsed.get("scad") or ""), parameters),
            parameters,
        )
    )

    return CadamGenerateResponse(
        name=str(name).strip() if name else "cadam_part",
        description=str(description).strip() if description else "AI 生成的参数化 CAD 零件",
        scad=scad,
        parameters=parameters,
        provider="mimo",
        model=model,
    )


def openai_chat_headers() -> dict[str, str]:
    api_key = env_or_runtime_secret("CADAM_OPENAI_API_KEY") or env_or_runtime_secret("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="CADAM OpenAI-compatible API key is not configured.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def call_openai_cadam_generation(request: CadamGenerateRequest) -> CadamGenerateResponse:
    model = cadam_openai_model()
    user_payload = {
        "prompt": request.prompt.strip(),
        "current_parameters": request.parameters,
        "output_language": "Chinese for description, OpenSCAD for scad",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": cadam_system_prompt()},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            },
        ],
        "max_tokens": 2200,
        "temperature": 0.18,
        "top_p": 0.86,
        "response_format": {"type": "json_object"},
    }
    response = requests.post(
        f"{cadam_openai_base_url()}/chat/completions",
        headers=openai_chat_headers(),
        json=payload,
        timeout=90,
    )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"CADAM OpenAI-compatible request failed: HTTP {response.status_code}",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="CADAM OpenAI-compatible provider returned invalid JSON.") from exc

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="CADAM OpenAI-compatible provider returned no choices.")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise HTTPException(status_code=502, detail="CADAM OpenAI-compatible provider returned an invalid message.")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="CADAM OpenAI-compatible provider returned an empty response.")

    parsed = extract_json_object(content)
    name = parsed.get("name")
    description = parsed.get("description")
    parameters = normalize_cadam_parameters(parsed.get("parameters"), request.parameters)
    scad = validate_cadam_scad(
        prefix_global_parameter_defaults(
            repair_main_module_defaults(str(parsed.get("scad") or ""), parameters),
            parameters,
        )
    )

    return CadamGenerateResponse(
        name=str(name).strip() if name else "cadam_part",
        description=str(description).strip() if description else "AI 生成的参数化 CAD 零件",
        scad=scad,
        parameters=parameters,
        provider="openai-compatible",
        model=model,
    )


def extract_mimo_stream_delta(chunk: dict[str, Any]) -> str:
    choices = chunk.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""

    delta = first_choice.get("delta")
    if isinstance(delta, dict):
        content = delta.get("content")
        return content if isinstance(content, str) else ""

    message = first_choice.get("message")
    if isinstance(message, dict):
        content = message.get("content") or message.get("reasoning_content")
        return content if isinstance(content, str) else ""

    return ""


def stream_mimo_help_chat(request: HelpChatRequest):
    payload = build_mimo_help_chat_payload(request)
    payload["stream"] = True

    try:
        response = requests.post(
            f"{mimo_base_url()}/chat/completions",
            headers=mimo_headers(),
            json=payload,
            timeout=60,
            stream=True,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        yield f"MiMo help chat stream request failed: {exc}"
        return

    try:
        for raw_line in response.iter_lines(decode_unicode=False):
            line = raw_line.decode("utf-8")
            if not line:
                continue
            data = line[5:].strip() if line.startswith("data:") else line.strip()
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except ValueError:
                continue
            delta = extract_mimo_stream_delta(chunk)
            if delta:
                yield delta
    finally:
        response.close()


def supabase_auth_config() -> tuple[str, str]:
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    publishable_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()

    if not supabase_url or not publishable_key:
        raise HTTPException(status_code=503, detail="Supabase Auth is not configured.")

    return supabase_url, publishable_key


def supabase_service_role_key() -> str:
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_role_key:
        raise HTTPException(status_code=503, detail="Supabase service role key is not configured.")
    return service_role_key


def supabase_rest_url(path: str) -> str:
    supabase_url, _ = supabase_auth_config()
    return f"{supabase_url}/rest/v1/{path.lstrip('/')}"


def supabase_admin_url(path: str) -> str:
    supabase_url, _ = supabase_auth_config()
    path = path.lstrip("/")
    if path.startswith("auth/"):
        return f"{supabase_url}/{path}"
    return f"{supabase_url}/rest/v1/{path}"


def supabase_headers(authorization: str, *, prefer: str | None = None) -> dict[str, str]:
    _, publishable_key = supabase_auth_config()
    headers = {
        "apikey": publishable_key,
        "Authorization": authorization,
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def supabase_admin_headers(*, prefer: str | None = None) -> dict[str, str]:
    service_role_key = supabase_service_role_key()
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def supabase_request(request_func: Any, *args: Any, **kwargs: Any) -> requests.Response:
    last_error: requests.RequestException | None = None
    for attempt in range(SUPABASE_REQUEST_RETRIES + 1):
        try:
            return request_func(*args, **kwargs)
        except requests.RequestException as exc:
            last_error = exc
            if attempt >= SUPABASE_REQUEST_RETRIES:
                break
            time.sleep(0.4 * (attempt + 1))

    assert last_error is not None
    raise last_error


def supabase_admin_request(
    method: str,
    path: str,
    *,
    json_body: Any | None = None,
    prefer: str | None = None,
    timeout: int = 20,
) -> requests.Response:
    request_func = getattr(requests, method.lower())
    kwargs: dict[str, Any] = {
        "headers": supabase_admin_headers(prefer=prefer),
        "timeout": timeout,
    }
    if json_body is not None:
        kwargs["data"] = json.dumps(json_body)
    response = supabase_request(request_func, supabase_admin_url(path), **kwargs)
    if not response.ok:
        raise_supabase_error(response)
    return response


def verify_supabase_user(authorization: str | None) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Supabase access token.")

    cached_user = get_cached_auth_user(authorization)
    if cached_user:
        return cached_user

    supabase_url, publishable_key = supabase_auth_config()

    try:
        response = supabase_request(
            requests.get,
            f"{supabase_url}/auth/v1/user",
            headers={
                "apikey": publishable_key,
                "Authorization": authorization,
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Supabase Auth verification failed.") from exc

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid or expired Supabase access token.")

    if not response.ok:
        raise HTTPException(status_code=502, detail="Supabase Auth verification failed.")

    payload = response.json()
    user_metadata = payload.get("user_metadata") or {}
    username = user_metadata.get("username")
    user = AuthUser(
        id=payload["id"],
        email=payload.get("email"),
        username=username if isinstance(username, str) else None,
    )
    cache_auth_user(authorization, user)
    return user


def admin_email_allowlist() -> set[str]:
    raw_value = os.getenv("ADMIN_EMAIL_ALLOWLIST", "")
    return {
        email.strip().lower()
        for email in raw_value.replace(";", ",").split(",")
        if email.strip()
    }


def verify_admin_user(authorization: str | None) -> AuthUser:
    user = verify_supabase_user(authorization)
    if not user.email or user.email.lower() not in admin_email_allowlist():
        raise HTTPException(status_code=403, detail="Admin access is not allowed for this account.")
    return user


def runtime_settings_map() -> dict[str, dict[str, Any]]:
    global admin_settings_cache
    now = time.monotonic()
    if admin_settings_cache and admin_settings_cache[0] > now:
        return admin_settings_cache[1]
    try:
        response = supabase_admin_request(
            "GET",
            "admin_settings?select=key,value,is_secret,updated_at",
            timeout=10,
        )
    except Exception:
        return {}
    data = response.json()
    settings = {
        row["key"]: row
        for row in data
        if isinstance(row, dict) and isinstance(row.get("key"), str)
    }
    admin_settings_cache = (now + ADMIN_SETTINGS_CACHE_SECONDS, settings)
    return settings


def clear_runtime_settings_cache() -> None:
    global admin_settings_cache
    admin_settings_cache = None


def runtime_setting_value(key: str, default: str = "") -> str:
    row = runtime_settings_map().get(key)
    value = row.get("value") if row else None
    if isinstance(value, str) and value:
        return value
    return os.getenv(key, default)


def env_or_runtime_secret(key: str) -> str:
    return runtime_setting_value(key, "").strip()


def generation_job_to_history_row(job: GenerationJob, user_id: str) -> dict[str, Any]:
    return {
        "id": job.id,
        "user_id": user_id,
        "kind": "3d",
        "prompt": job.prompt,
        "mode": job.mode,
        "status": job.status,
        "progress": job.progress,
        "quality": job.quality,
        "style": job.style,
        "target_format": job.targetFormat,
        "aspect_ratio": None,
        "result_url": job.modelUrl,
        "thumbnail_url": job.thumbnailUrl,
        "error": job.error,
        "metadata": job.metadata.model_dump() if job.metadata else None,
        "created_at": job.createdAt,
        "updated_at": job.updatedAt,
    }


def image_job_to_history_row(job: ImageJob, user_id: str) -> dict[str, Any]:
    return {
        "id": job.id,
        "user_id": user_id,
        "kind": "image",
        "prompt": job.prompt,
        "mode": None,
        "status": job.status,
        "progress": job.progress,
        "quality": None,
        "style": None,
        "target_format": None,
        "aspect_ratio": job.aspectRatio,
        "result_url": job.imageUrl,
        "thumbnail_url": None,
        "error": job.error,
        "metadata": None,
        "created_at": job.createdAt,
        "updated_at": job.updatedAt,
    }


def history_row_to_generation_job(row: dict[str, Any]) -> GenerationJob:
    metadata = row.get("metadata")
    return GenerationJob(
        id=row["id"],
        prompt=row["prompt"],
        mode=row.get("mode") or "text-to-3d",
        status=row["status"],
        progress=int(row["progress"] or 0),
        quality=row.get("quality") or "balanced",
        style=row.get("style") or "game-ready",
        targetFormat=row.get("target_format") or "glb",
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        modelUrl=row.get("result_url"),
        thumbnailUrl=row.get("thumbnail_url"),
        error=row.get("error"),
        metadata=JobMetadata(**metadata) if isinstance(metadata, dict) else None,
    )


def history_row_to_image_job(row: dict[str, Any]) -> ImageJob:
    return ImageJob(
        id=row["id"],
        prompt=row["prompt"],
        status=row["status"],
        progress=int(row["progress"] or 0),
        aspectRatio=row.get("aspect_ratio") or "1:1",
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        imageUrl=row.get("result_url"),
        error=row.get("error"),
    )


def raise_supabase_error(response: requests.Response) -> None:
    try:
        body = response.json()
    except ValueError:
        body = response.text
    raise HTTPException(
        status_code=502,
        detail=f"Supabase history request failed: HTTP {response.status_code} {body}",
    )


def insert_history_row(row: dict[str, Any], authorization: str) -> None:
    response = supabase_request(
        requests.post,
        supabase_rest_url("generation_jobs"),
        headers=supabase_headers(authorization, prefer="return=minimal"),
        data=json.dumps(row),
        timeout=20,
    )
    if not response.ok:
        raise_supabase_error(response)


def patch_history_row(job_id: str, updates: dict[str, Any], authorization: str) -> None:
    payload = {key: value for key, value in updates.items() if value is not None}
    if not payload:
        return
    payload["updated_at"] = now_iso()
    response = supabase_request(
        requests.patch,
        supabase_rest_url(f"generation_jobs?id=eq.{job_id}"),
        headers=supabase_headers(authorization, prefer="return=minimal"),
        data=json.dumps(payload),
        timeout=20,
    )
    if not response.ok:
        raise_supabase_error(response)


def list_history_rows(kind: str, authorization: str, limit: int = 20) -> list[dict[str, Any]]:
    response = supabase_request(
        requests.get,
        supabase_rest_url(
            f"generation_jobs?kind=eq.{kind}&select=*&order=created_at.desc&limit={limit}"
        ),
        headers=supabase_headers(authorization),
        timeout=20,
    )
    if not response.ok:
        raise_supabase_error(response)
    data = response.json()
    return data if isinstance(data, list) else []


def get_history_row(job_id: str, kind: str, authorization: str) -> dict[str, Any] | None:
    response = supabase_request(
        requests.get,
        supabase_rest_url(f"generation_jobs?id=eq.{job_id}&kind=eq.{kind}&select=*&limit=1"),
        headers=supabase_headers(authorization),
        timeout=20,
    )
    if not response.ok:
        raise_supabase_error(response)
    data = response.json()
    if not isinstance(data, list) or not data:
        return None
    return data[0]


def get_admin_history_row(job_id: str) -> dict[str, Any] | None:
    response = supabase_admin_request(
        "GET",
        f"generation_jobs?id=eq.{quote(job_id)}&select=*&limit=1",
    )
    data = response.json()
    if not isinstance(data, list) or not data:
        return None
    return data[0]


def admin_list_generation_rows(
    *,
    kind: str | None = None,
    status: str | None = None,
    search: str | None = None,
    include_deleted: bool = False,
    limit: int = 100,
) -> list[dict[str, Any]]:
    filters = ["select=*", "order=created_at.desc", f"limit={max(1, min(limit, 500))}"]
    if kind and kind in {"3d", "image"}:
        filters.append(f"kind=eq.{kind}")
    if status:
        filters.append(f"status=eq.{quote(status)}")
    if search:
        filters.append(f"prompt=ilike.*{quote(search)}*")
    if not include_deleted:
        filters.append("deleted_at=is.null")
    response = supabase_admin_request("GET", f"generation_jobs?{'&'.join(filters)}")
    data = response.json()
    return data if isinstance(data, list) else []


def admin_job_response(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "kind": row.get("kind"),
        "prompt": row.get("prompt"),
        "mode": row.get("mode"),
        "status": row.get("status"),
        "progress": row.get("progress"),
        "quality": row.get("quality"),
        "style": row.get("style"),
        "targetFormat": row.get("target_format"),
        "aspectRatio": row.get("aspect_ratio"),
        "resultUrl": row.get("result_url"),
        "thumbnailUrl": row.get("thumbnail_url"),
        "error": row.get("error"),
        "metadata": row.get("metadata"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
        "deletedAt": row.get("deleted_at"),
        "deletedBy": row.get("deleted_by"),
    }


def admin_user_from_payload(payload: dict[str, Any]) -> AdminUser:
    metadata = payload.get("user_metadata") or {}
    username = metadata.get("username")
    banned_until = payload.get("banned_until")
    return AdminUser(
        id=str(payload.get("id") or ""),
        email=payload.get("email"),
        username=username if isinstance(username, str) else None,
        createdAt=payload.get("created_at"),
        lastSignInAt=payload.get("last_sign_in_at"),
        isBanned=bool(banned_until),
    )


def admin_setting_view(row: dict[str, Any]) -> AdminSettingView:
    is_secret = bool(row.get("is_secret"))
    value = row.get("value")
    return AdminSettingView(
        key=str(row.get("key") or ""),
        value=value if isinstance(value, str) else None,
        isSecret=is_secret,
        isConfigured=bool(value),
        updatedAt=row.get("updated_at"),
    )


def merge_settings_with_environment(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key = {
        str(row.get("key")): dict(row)
        for row in rows
        if isinstance(row, dict) and row.get("key")
    }
    for key in ADMIN_VISIBLE_SETTING_KEYS:
        env_value = os.getenv(key, "")
        row = by_key.get(key)
        if row is None:
            by_key[key] = {
                "key": key,
                "value": env_value,
                "is_secret": key in ADMIN_SECRET_KEYS,
                "updated_at": None,
            }
        elif not row.get("value") and env_value:
            row["value"] = env_value
    return [by_key[key] for key in ADMIN_VISIBLE_SETTING_KEYS if key in by_key] + [
        row for key, row in sorted(by_key.items()) if key not in ADMIN_VISIBLE_SETTING_KEYS
    ]


def update_local_env_file(updates: dict[str, str]) -> None:
    API_ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing_lines = API_ENV_PATH.read_text(encoding="utf-8-sig").splitlines() if API_ENV_PATH.exists() else []
    pending = dict(updates)
    next_lines: list[str] = []
    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key, _ = line.split("=", 1)
        clean_key = key.strip()
        if clean_key in pending:
            next_lines.append(f"{clean_key}={pending.pop(clean_key)}")
        else:
            next_lines.append(line)
    for key, value in pending.items():
        next_lines.append(f"{key}={value}")
    API_ENV_PATH.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")
    for key, value in updates.items():
        os.environ[key] = value


def write_audit_log(
    admin: AuthUser,
    action: str,
    target_type: str,
    *,
    target_id: str | None = None,
    summary: str | None = None,
) -> None:
    payload = {
        "admin_id": admin.id,
        "admin_email": admin.email,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "summary": summary,
    }
    supabase_admin_request(
        "POST",
        "admin_audit_logs",
        json_body=payload,
        prefer="return=minimal",
    )


def register_job_context(job_id: str, user: AuthUser, authorization: str) -> None:
    job_contexts[job_id] = {"user_id": user.id, "authorization": authorization}


def persist_job_update(job_id: str, updates: dict[str, Any]) -> None:
    context = job_contexts.get(job_id)
    if not context:
        return

    row_updates: dict[str, Any] = {}
    field_map = {
        "status": "status",
        "progress": "progress",
        "modelUrl": "result_url",
        "thumbnailUrl": "thumbnail_url",
        "error": "error",
    }
    for source_key, row_key in field_map.items():
        if source_key in updates:
            row_updates[row_key] = updates[source_key]
    if "metadata" in updates:
        metadata = updates["metadata"]
        row_updates["metadata"] = metadata.model_dump() if metadata else None
    try:
        patch_history_row(job_id, row_updates, context["authorization"])
    except Exception as exc:
        print(f"Supabase history update skipped for job {job_id}: {exc}")


def persist_image_job_update(job_id: str, updates: dict[str, Any]) -> None:
    context = job_contexts.get(job_id)
    if not context:
        return

    row_updates: dict[str, Any] = {}
    field_map = {
        "status": "status",
        "progress": "progress",
        "imageUrl": "result_url",
        "error": "error",
    }
    for source_key, row_key in field_map.items():
        if source_key in updates:
            row_updates[row_key] = updates[source_key]
    try:
        patch_history_row(job_id, row_updates, context["authorization"])
    except Exception as exc:
        print(f"Supabase image history update skipped for job {job_id}: {exc}")


def update_job(job_id: str, **updates: Any) -> GenerationJob | None:
    job = jobs.get(job_id)
    if job is None:
        return None
    for key, value in updates.items():
        setattr(job, key, value)
    job.updatedAt = now_iso()
    jobs[job_id] = job
    persist_job_update(job_id, updates)
    return job


def update_image_job(job_id: str, **updates: Any) -> ImageJob | None:
    job = image_jobs.get(job_id)
    if job is None:
        return None
    for key, value in updates.items():
        setattr(job, key, value)
    job.updatedAt = now_iso()
    image_jobs[job_id] = job
    persist_image_job_update(job_id, updates)
    return job


def sorted_image_jobs() -> list[ImageJob]:
    return sorted(image_jobs.values(), key=lambda job: job.createdAt, reverse=True)


def meshy_headers() -> dict[str, str]:
    api_key = env_or_runtime_secret("MESHY_API_KEY")
    if not api_key:
        raise RuntimeError("MESHY_API_KEY is not configured.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def neural4d_base_url() -> str:
    return (
        runtime_setting_value("NEURAL4D_BASE_URL", NEURAL4D_DEFAULT_BASE_URL).strip().rstrip("/")
        or NEURAL4D_DEFAULT_BASE_URL
    )


def neural4d_headers() -> dict[str, str]:
    token = env_or_runtime_secret("NEURAL4D_API_TOKEN")
    if not token:
        raise RuntimeError("MODEL_PROVIDER=neural4d requires NEURAL4D_API_TOKEN.")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def neural4d_model_count() -> int:
    raw_value = runtime_setting_value("NEURAL4D_MODEL_COUNT", "1").strip()
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError("NEURAL4D_MODEL_COUNT must be an integer.") from exc
    if value < 1:
        raise RuntimeError("NEURAL4D_MODEL_COUNT must be at least 1.")
    return value


def neural4d_post(path: str, payload: dict[str, Any], timeout: int = 60) -> dict[str, Any]:
    response = requests.post(
        f"{neural4d_base_url()}/{path.lstrip('/')}",
        headers=neural4d_headers(),
        json=payload,
        timeout=timeout,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Neural4D request failed: HTTP {response.status_code} {response.text}")
    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError(f"Neural4D returned invalid JSON: {response.text}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"Neural4D returned an unexpected response: {data}")
    return data


def tencent_credentials() -> tuple[str, str]:
    secret_id = env_or_runtime_secret("TENCENTCLOUD_SECRET_ID")
    secret_key = env_or_runtime_secret("TENCENTCLOUD_SECRET_KEY")
    if not secret_id or not secret_key:
        raise RuntimeError(
            "MODEL_PROVIDER=hunyuan requires TENCENTCLOUD_SECRET_ID and "
            "TENCENTCLOUD_SECRET_KEY. The Tencent Cloud API 3.0 docs do not "
            "use a single sk-* API key."
        )
    return secret_id, secret_key


def tencent_ai3d_config() -> TencentAi3dConfig:
    profile = runtime_setting_value("TENCENTCLOUD_HUNYUAN_PROFILE", "domestic").strip().lower()
    if profile in {"international", "intl", "global"}:
        host = TENCENT_HUNYUAN_INTL_HOST
        return TencentAi3dConfig(
            host=host,
            endpoint=f"https://{host}",
            service=TENCENT_HUNYUAN_INTL_SERVICE,
            version=TENCENT_HUNYUAN_INTL_VERSION,
            region=runtime_setting_value("TENCENTCLOUD_REGION", "ap-singapore").strip(),
        )

    if profile in {"domestic", "cn", "china"}:
        host = TENCENT_AI3D_HOST
        return TencentAi3dConfig(
            host=host,
            endpoint=f"https://{host}",
            service=TENCENT_AI3D_SERVICE,
            version=TENCENT_AI3D_VERSION,
            region=runtime_setting_value("TENCENTCLOUD_REGION", "ap-guangzhou").strip(),
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
    return {"glb": "GLB", "fbx": "FBX", "obj": "OBJ", "stl": "STL"}[target_format]


def hunyuan_generate_action() -> str:
    return (
        runtime_setting_value("TENCENTCLOUD_HUNYUAN_GENERATE_ACTION", TENCENT_HUNYUAN_GENERATE_ACTION)
        .strip()
        or TENCENT_HUNYUAN_GENERATE_ACTION
    )


def hunyuan_status_action() -> str:
    return (
        runtime_setting_value("TENCENTCLOUD_HUNYUAN_STATUS_ACTION", TENCENT_HUNYUAN_STATUS_ACTION)
        .strip()
        or TENCENT_HUNYUAN_STATUS_ACTION
    )


def create_hunyuan_task(request: CreateJobRequest) -> str:
    response = call_tencent_ai3d(
        hunyuan_generate_action(),
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


def query_hunyuan_task(provider_job_id: str) -> dict[str, Any]:
    return call_tencent_ai3d(
        hunyuan_status_action(),
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


def create_neural4d_text_task(request: CreateJobRequest) -> str:
    data = neural4d_post(
        "generateModelWithText",
        {
            "prompt": request.prompt.strip(),
            "modelCount": neural4d_model_count(),
            "disablePbr": 0,
        },
    )
    uuids = data.get("uuids") or []
    if not isinstance(uuids, list) or not uuids:
        raise RuntimeError(
            f"Neural4D text generation returned no UUIDs: {json.dumps(data, ensure_ascii=False)}"
        )
    return str(uuids[0])


def query_neural4d_progress(provider_uuid: str) -> dict[str, Any]:
    return neural4d_post("queryJobProgress", {"uuid": provider_uuid}, timeout=30)


def retrieve_neural4d_model(provider_uuid: str) -> dict[str, Any]:
    return neural4d_post("retrieveModel", {"uuid": provider_uuid}, timeout=30)


def convert_neural4d_model(provider_uuid: str, target_format: TargetFormat) -> dict[str, Any]:
    return neural4d_post(
        "convertToFormat",
        {
            "uuid": provider_uuid,
            "modelType": target_format,
        },
        timeout=60,
    )


def parse_neural4d_progress(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return max(0, min(99, int(value)))
    text = str(value).strip().replace("%", "")
    try:
        return max(0, min(99, int(float(text))))
    except ValueError:
        return 0


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
    return model_urls.get(target_format)


def export_url_from_provider(job: GenerationJob, export_format: TargetFormat) -> str | None:
    metadata = job.metadata
    if not metadata or not metadata.providerTaskId:
        return None

    engine = metadata.engine.lower()
    if "meshy" in engine:
        task = get_meshy_task(metadata.providerTaskId)
        return model_url_from_meshy(task, export_format)

    if "neural4d" in engine:
        conversion = convert_neural4d_model(metadata.providerTaskId, export_format)
        if int(conversion.get("statusType") or 0) == 0:
            model_url = conversion.get("modelUrl")
            return str(model_url) if model_url else None

    return None


def image_size_for_aspect_ratio(aspect_ratio: ImageAspectRatio) -> str:
    return {
        "1:1": "512x512",
        "16:9": "1024x576",
        "9:16": "576x1024",
        "4:3": "1024x768",
        "3:4": "768x1024",
    }[aspect_ratio]


def openai_image_size_for_aspect_ratio(aspect_ratio: ImageAspectRatio) -> str:
    return {
        "1:1": "1024x1024",
        "16:9": "1536x1024",
        "9:16": "1024x1536",
        "4:3": "1536x1024",
        "3:4": "1024x1536",
    }[aspect_ratio]


def image_cache_path(job_id: str) -> Path:
    return IMAGE_CACHE_DIR / f"{job_id}.png"


def image_file_response(job_id: str, image_path: Path) -> FileResponse:
    return FileResponse(
        image_path,
        media_type="image/png",
        filename=f"{job_id}.png",
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Disposition": f'inline; filename="{job_id}.png"',
        },
    )


def cache_remote_image(job: ImageJob) -> Path:
    if not job.imageUrl or not job.imageUrl.startswith(("http://", "https://")):
        raise RuntimeError("Image job does not have a remote image URL.")

    cached_path = image_cache_path(job.id)
    if cached_path.exists() and cached_path.stat().st_size > 0:
        return cached_path

    try:
        response = requests.get(job.imageUrl, stream=True, timeout=120)
        response.raise_for_status()
        IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        temp_path = cached_path.with_suffix(".png.tmp")
        try:
            with temp_path.open("wb") as image_file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        image_file.write(chunk)
            temp_path.replace(cached_path)
        finally:
            response.close()
            if temp_path.exists():
                temp_path.unlink()
    except requests.RequestException as exc:
        raise RuntimeError(f"Could not fetch generated image: {exc}") from exc

    return cached_path


def estimated_image_progress(elapsed_seconds: float, expected_seconds: float) -> int:
    if expected_seconds <= 0:
        return 35
    ratio = max(0.0, min(elapsed_seconds / expected_seconds, 1.0))
    return min(96, 35 + int(61 * ratio))


def estimated_model_progress(elapsed_seconds: float, expected_seconds: float) -> int:
    if expected_seconds <= 0:
        return 5
    ratio = max(0.0, min(elapsed_seconds / expected_seconds, 1.0))
    return min(96, 5 + int(91 * ratio))


async def track_model_generation_progress(job_id: str, expected_seconds: float) -> None:
    started_at = time.monotonic()
    while True:
        await asyncio.sleep(2)
        job = jobs.get(job_id)
        if job is None or job.status not in {"queued", "running", "postprocessing"}:
            return
        progress = estimated_model_progress(time.monotonic() - started_at, expected_seconds)
        if progress > job.progress:
            next_status: JobStatus = "running"
            if progress >= 90:
                next_status = "postprocessing"
            update_job(job_id, status=next_status, progress=progress)


async def track_image_generation_progress(job_id: str, expected_seconds: float) -> None:
    started_at = time.monotonic()
    while True:
        await asyncio.sleep(2)
        job = image_jobs.get(job_id)
        if job is None or job.status not in {"queued", "running"}:
            return
        progress = estimated_image_progress(time.monotonic() - started_at, expected_seconds)
        if progress > job.progress:
            update_image_job(job_id, status="running", progress=progress)


def siliconflow_image_headers() -> dict[str, str]:
    api_key = env_or_runtime_secret("SILICONFLOW_API_KEY")
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
        runtime_setting_value("SILICONFLOW_IMAGE_MODEL", SILICONFLOW_DEFAULT_IMAGE_MODEL)
        .strip()
        or SILICONFLOW_DEFAULT_IMAGE_MODEL
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
    try:
        response = requests.post(
            "https://api.siliconflow.cn/v1/images/generations",
            headers=siliconflow_image_headers(),
            json=siliconflow_image_payload(request, seed=seed),
            timeout=SILICONFLOW_IMAGE_TIMEOUT_SECONDS,
        )
    except requests.Timeout as exc:
        raise RuntimeError(
            "SiliconFlow 图片生成超时：当前模型排队或响应过慢，请稍后重试，"
            "或在 .env 中切换 SILICONFLOW_IMAGE_MODEL。"
        ) from exc
    except requests.RequestException as exc:
        raise RuntimeError(f"SiliconFlow 图片生成请求失败：{exc}") from exc
    if response.status_code >= 400:
        try:
            error_payload = response.json()
            error_message = (
                error_payload.get("message")
                or error_payload.get("error")
                or response.text
            )
        except ValueError:
            error_message = response.text
        raise RuntimeError(
            f"SiliconFlow 图片生成失败：HTTP {response.status_code} {error_message}"
        )

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


def openai_image_headers() -> dict[str, str]:
    api_key = env_or_runtime_secret("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("IMAGE_PROVIDER=openai requires OPENAI_API_KEY in .env.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def openai_image_model() -> str:
    return runtime_setting_value("OPENAI_IMAGE_MODEL", OPENAI_DEFAULT_IMAGE_MODEL).strip() or OPENAI_DEFAULT_IMAGE_MODEL


def openai_image_base_url() -> str:
    return (
        runtime_setting_value("OPENAI_IMAGE_BASE_URL", "https://api.openai.com/v1")
        .strip()
        .rstrip("/")
    )


def openai_image_payload(request: CreateImageJobRequest) -> dict[str, Any]:
    return {
        "model": openai_image_model(),
        "prompt": request.prompt.strip(),
        "size": openai_image_size_for_aspect_ratio(request.aspectRatio),
        "n": 1,
        "quality": runtime_setting_value("OPENAI_IMAGE_QUALITY", "low").strip() or "low",
        "moderation": runtime_setting_value("OPENAI_IMAGE_MODERATION", "auto").strip() or "auto",
    }


def create_openai_image(job_id: str, request: CreateImageJobRequest) -> str:
    try:
        response = requests.post(
            f"{openai_image_base_url()}/images/generations",
            headers=openai_image_headers(),
            json=openai_image_payload(request),
            timeout=OPENAI_IMAGE_TIMEOUT_SECONDS,
        )
    except requests.Timeout as exc:
        raise RuntimeError("OpenAI 图片生成超时：当前模型或中转站响应较慢，请稍后重试。") from exc
    except requests.RequestException as exc:
        raise RuntimeError(f"OpenAI 图片生成请求失败：{exc}") from exc

    if response.status_code >= 400:
        try:
            error_payload = response.json()
            error = error_payload.get("error")
            error_message = (
                error.get("message")
                if isinstance(error, dict)
                else error_payload.get("message") or response.text
            )
        except ValueError:
            error_message = response.text
        raise RuntimeError(f"OpenAI 图片生成失败：HTTP {response.status_code} {error_message}")

    data = response.json()
    images = data.get("data") or []
    if not isinstance(images, list) or not images:
        raise RuntimeError(
            f"OpenAI image generation returned no images: {json.dumps(data, ensure_ascii=False)}"
        )

    first = images[0]
    if not isinstance(first, dict):
        raise RuntimeError(
            f"OpenAI image generation returned an invalid image: {json.dumps(data, ensure_ascii=False)}"
        )

    if first.get("url"):
        return str(first["url"])

    b64_json = first.get("b64_json")
    if not isinstance(b64_json, str) or not b64_json:
        raise RuntimeError(
            f"OpenAI image generation returned no image data: {json.dumps(data, ensure_ascii=False)}"
        )

    IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    image_path = image_cache_path(job_id)
    image_path.write_bytes(base64.b64decode(b64_json))
    return f"local://image-jobs/{job_id}/image"


async def run_siliconflow_image_generation(
    job_id: str, request: CreateImageJobRequest
) -> None:
    progress_task: asyncio.Task[None] | None = None
    try:
        update_image_job(job_id, status="running", progress=35)
        progress_task = asyncio.create_task(track_image_generation_progress(job_id, 90))
        image_url = await asyncio.to_thread(create_siliconflow_image, request)
        pending_job = image_jobs.get(job_id)
        if pending_job is not None:
            cache_job = pending_job.model_copy(update={"imageUrl": image_url})
            update_image_job(job_id, status="postprocessing", progress=98)
            await asyncio.to_thread(cache_remote_image, cache_job)
        update_image_job(
            job_id,
            status="completed",
            progress=100,
            imageUrl=image_url,
            error=None,
        )
    except Exception as exc:
        update_image_job(job_id, status="failed", progress=0, error=str(exc))
    finally:
        if progress_task is not None:
            progress_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await progress_task


async def run_openai_image_generation(job_id: str, request: CreateImageJobRequest) -> None:
    progress_task: asyncio.Task[None] | None = None
    try:
        update_image_job(job_id, status="running", progress=35)
        progress_task = asyncio.create_task(track_image_generation_progress(job_id, 180))
        image_url = await asyncio.to_thread(create_openai_image, job_id, request)
        update_image_job(
            job_id,
            status="completed",
            progress=100,
            imageUrl=image_url,
            error=None,
        )
    except Exception as exc:
        update_image_job(job_id, status="failed", progress=0, error=str(exc))
    finally:
        if progress_task is not None:
            progress_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await progress_task


async def run_meshy_generation(job_id: str, request: CreateJobRequest) -> None:
    if request.mode != "text-to-3d":
        update_job(
            job_id,
            status="failed",
            progress=0,
            error="Meshy provider currently supports text-to-3d in this MVP.",
        )
        return

    progress_task: asyncio.Task[None] | None = None
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
        progress_task = asyncio.create_task(track_model_generation_progress(job_id, 180))
        provider_task_id = await asyncio.to_thread(create_meshy_preview_task, request)
        job = jobs.get(job_id)
        if job and job.metadata:
            job.metadata.providerTaskId = provider_task_id
            update_job(job_id, metadata=job.metadata)

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
    finally:
        if progress_task is not None:
            progress_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await progress_task


async def run_hunyuan_generation(job_id: str, request: CreateJobRequest) -> None:
    if request.mode != "text-to-3d":
        update_job(
            job_id,
            status="failed",
            progress=0,
            error="腾讯云混元生3D Provider 当前只支持文本生成3D。",
        )
        return

    progress_task: asyncio.Task[None] | None = None
    try:
        update_job(
            job_id,
            status="queued",
            progress=3,
            metadata=JobMetadata(
                engine="Tencent Cloud Hunyuan3D API",
                polygonBudget="由混元生3D标准接口生成",
                textureSet="EnablePBR=true",
            ),
        )
        progress_task = asyncio.create_task(track_model_generation_progress(job_id, 240))
        provider_job_id = await asyncio.to_thread(create_hunyuan_task, request)
        job = jobs.get(job_id)
        if job and job.metadata:
            job.metadata.providerTaskId = provider_job_id
            update_job(job_id, metadata=job.metadata)

        while True:
            await asyncio.sleep(6)
            task = await asyncio.to_thread(query_hunyuan_task, provider_job_id)
            raw_status = str(task.get("Status", "")).upper()
            progress = int(task.get("Progress") or 0)

            if raw_status in {"DONE", "SUCCESS", "SUCCEEDED"}:
                model_url = model_url_from_hunyuan(task)
                if not model_url:
                    raise RuntimeError("混元生3D任务成功，但返回结果里没有模型 URL。")
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
                    or "混元生3D任务失败。"
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
    finally:
        if progress_task is not None:
            progress_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await progress_task


async def run_neural4d_generation(job_id: str, request: CreateJobRequest) -> None:
    if request.mode != "text-to-3d":
        update_job(
            job_id,
            status="failed",
            progress=0,
            error="Neural4D provider currently supports text-to-3d in this app.",
        )
        return

    progress_task: asyncio.Task[None] | None = None
    try:
        update_job(
            job_id,
            status="queued",
            progress=3,
            metadata=JobMetadata(
                engine="Neural4D API",
                polygonBudget="Managed by Neural4D generation",
                textureSet="PBR enabled",
            ),
        )
        progress_task = asyncio.create_task(track_model_generation_progress(job_id, 240))
        provider_uuid = await asyncio.to_thread(create_neural4d_text_task, request)
        job = jobs.get(job_id)
        if job and job.metadata:
            job.metadata.providerTaskId = provider_uuid
            update_job(job_id, metadata=job.metadata)

        while True:
            await asyncio.sleep(NEURAL4D_POLL_SECONDS)
            progress_payload = await asyncio.to_thread(query_neural4d_progress, provider_uuid)
            progress_status = int(progress_payload.get("statusType") or 0)
            progress = parse_neural4d_progress(progress_payload.get("progress"))
            if progress_status == -1:
                raise RuntimeError("Neural4D job UUID does not exist.")
            if progress_status == -2:
                raise RuntimeError(progress_payload.get("message") or "Neural4D token is invalid.")

            retrieved = await asyncio.to_thread(retrieve_neural4d_model, provider_uuid)
            code_status = int(retrieved.get("codeStatus") or 0)
            if code_status == 1:
                update_job(job_id, status="running", progress=max(progress, 5))
                continue
            if code_status == -1:
                raise RuntimeError(retrieved.get("message") or "Neural4D token is invalid or expired.")
            if code_status == -2:
                raise RuntimeError(retrieved.get("message") or "Neural4D model UUID does not exist.")
            if code_status == -3:
                raise RuntimeError(retrieved.get("message") or "Neural4D model generation failed.")
            if code_status != 0:
                update_job(job_id, status="running", progress=max(progress, 5))
                continue

            model_url = retrieved.get("modelUrl")
            if request.targetFormat != "glb":
                while True:
                    conversion = await asyncio.to_thread(
                        convert_neural4d_model,
                        provider_uuid,
                        request.targetFormat,
                    )
                    status_type = int(conversion.get("statusType") or 0)
                    if status_type == 0:
                        model_url = conversion.get("modelUrl")
                        break
                    if status_type == -1:
                        raise RuntimeError(
                            conversion.get("message")
                            or "Neural4D format conversion failed."
                        )
                    update_job(job_id, status="postprocessing", progress=95)
                    await asyncio.sleep(NEURAL4D_POLL_SECONDS)

            if not model_url:
                raise RuntimeError("Neural4D task completed but returned no model URL.")
            update_job(
                job_id,
                status="completed",
                progress=100,
                modelUrl=str(model_url),
                thumbnailUrl=retrieved.get("imageUrl"),
                error=None,
            )
            return
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), progress=0)
    finally:
        if progress_task is not None:
            progress_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await progress_task


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


@app.get("/api/admin/summary", response_model=AdminSummary)
async def admin_summary(authorization: str | None = Header(default=None)) -> AdminSummary:
    verify_admin_user(authorization)
    users_response, rows = await asyncio.gather(
        asyncio.to_thread(supabase_admin_request, "GET", "/auth/v1/admin/users"),
        asyncio.to_thread(admin_list_generation_rows, include_deleted=True, limit=500),
    )
    users_payload = users_response.json()
    raw_users = users_payload.get("users") if isinstance(users_payload, dict) else users_payload
    users = raw_users if isinstance(raw_users, list) else []
    failed_jobs = sum(1 for row in rows if row.get("status") == "failed")
    running_jobs = sum(1 for row in rows if row.get("status") in {"queued", "running", "postprocessing"})
    completed_jobs = sum(1 for row in rows if row.get("status") == "completed")
    return AdminSummary(
        totalUsers=len(users),
        totalJobs=len(rows),
        modelJobs=sum(1 for row in rows if row.get("kind") == "3d"),
        imageJobs=sum(1 for row in rows if row.get("kind") == "image"),
        failedJobs=failed_jobs,
        runningJobs=running_jobs,
        completedJobs=completed_jobs,
        recentJobs=[admin_job_response(row) for row in rows[:8]],
    )


@app.get("/api/admin/users", response_model=AdminUsersResponse)
async def admin_list_users(authorization: str | None = Header(default=None)) -> AdminUsersResponse:
    verify_admin_user(authorization)
    response = supabase_admin_request("GET", "/auth/v1/admin/users")
    payload = response.json()
    raw_users = payload.get("users") if isinstance(payload, dict) else payload
    users = [admin_user_from_payload(item) for item in raw_users if isinstance(item, dict)] if isinstance(raw_users, list) else []
    return AdminUsersResponse(users=users)


@app.post("/api/admin/users/{user_id}/action", response_model=AdminUser)
async def admin_update_user(
    user_id: str,
    action: AdminUserAction,
    authorization: str | None = Header(default=None),
) -> AdminUser:
    admin = verify_admin_user(authorization)
    if action.action == "disable":
        payload = {"ban_duration": "876000h"}
        audit_action = "user.disable"
    else:
        payload = {"ban_duration": "none"}
        audit_action = "user.restore"
    response = supabase_admin_request("PUT", f"/auth/v1/admin/users/{quote(user_id)}", json_body=payload)
    write_audit_log(admin, audit_action, "user", target_id=user_id)
    payload = response.json()
    return admin_user_from_payload(payload if isinstance(payload, dict) else {"id": user_id})


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    admin = verify_admin_user(authorization)
    supabase_admin_request("DELETE", f"/auth/v1/admin/users/{quote(user_id)}")
    write_audit_log(admin, "user.hard_delete", "user", target_id=user_id)
    return {"ok": True}


@app.get("/api/admin/generation-jobs")
async def admin_list_generation_jobs(
    kind: str | None = None,
    status: str | None = None,
    search: str | None = None,
    includeDeleted: bool = False,
    authorization: str | None = Header(default=None),
) -> dict[str, list[dict[str, Any]]]:
    verify_admin_user(authorization)
    rows = admin_list_generation_rows(
        kind=kind,
        status=status,
        search=search,
        include_deleted=includeDeleted,
    )
    return {"jobs": [admin_job_response(row) for row in rows]}


def retry_admin_generation(row: dict[str, Any], admin: AuthUser) -> dict[str, Any]:
    timestamp = now_iso()
    new_id = str(uuid4())
    retry_row = {
        **row,
        "id": new_id,
        "status": "queued",
        "progress": 0,
        "result_url": None,
        "thumbnail_url": None,
        "error": None,
        "created_at": timestamp,
        "updated_at": timestamp,
        "deleted_at": None,
        "deleted_by": None,
        "metadata": {
            **(row.get("metadata") if isinstance(row.get("metadata"), dict) else {}),
            "retried_from": row.get("id"),
        },
    }
    supabase_admin_request(
        "POST",
        "generation_jobs",
        json_body=retry_row,
        prefer="return=minimal",
    )
    service_authorization = f"Bearer {supabase_service_role_key()}"
    user = AuthUser(id=str(row.get("user_id") or ""))
    if row.get("kind") == "3d":
        job = history_row_to_generation_job(retry_row)
        jobs[job.id] = job
        register_job_context(job.id, user, service_authorization)
        request = CreateJobRequest(
            prompt=job.prompt,
            mode=job.mode,
            quality=job.quality,
            style=job.style,
            targetFormat=job.targetFormat,
        )
        provider = selected_provider()
        if provider == "meshy":
            asyncio.create_task(run_meshy_generation(job.id, request))
        elif provider == "neural4d":
            asyncio.create_task(run_neural4d_generation(job.id, request))
        elif provider == "hunyuan":
            asyncio.create_task(run_hunyuan_generation(job.id, request))
        else:
            asyncio.create_task(simulate_generation(job.id))
    elif row.get("kind") == "image":
        job = history_row_to_image_job(retry_row)
        image_jobs[job.id] = job
        register_job_context(job.id, user, service_authorization)
        request = CreateImageJobRequest(prompt=job.prompt, aspectRatio=job.aspectRatio)
        provider = selected_image_provider()
        if provider == "openai":
            asyncio.create_task(run_openai_image_generation(job.id, request))
        elif provider == "mock":
            asyncio.create_task(simulate_image_generation(job.id))
        else:
            asyncio.create_task(run_siliconflow_image_generation(job.id, request))
    write_audit_log(admin, "generation_job.retry", "generation_job", target_id=str(row.get("id")), summary=f"new_id={new_id}")
    return retry_row


async def simulate_image_generation(job_id: str) -> None:
    update_image_job(job_id, status="running", progress=50)
    await asyncio.sleep(0)
    update_image_job(job_id, status="completed", progress=100, imageUrl="local://image-jobs/demo/image", error=None)


@app.post("/api/admin/generation-jobs/{job_id}/action")
async def admin_update_generation_job(
    job_id: str,
    action: AdminGenerationJobAction,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    admin = verify_admin_user(authorization)
    if action.action == "retry":
        row = get_admin_history_row(job_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Generation job not found.")
        retry_row = retry_admin_generation(row, admin)
        return {"job": admin_job_response(retry_row)}
    if action.action == "soft_delete":
        payload = {"deleted_at": now_iso(), "deleted_by": admin.id, "updated_at": now_iso()}
        audit_action = "generation_job.soft_delete"
    else:
        payload = {"deleted_at": None, "deleted_by": None, "updated_at": now_iso()}
        audit_action = "generation_job.restore"
    supabase_admin_request(
        "PATCH",
        f"generation_jobs?id=eq.{quote(job_id)}",
        json_body=payload,
        prefer="return=minimal",
    )
    write_audit_log(admin, audit_action, "generation_job", target_id=job_id)
    row = get_admin_history_row(job_id) or {"id": job_id, **payload}
    return {"job": admin_job_response(row)}


@app.delete("/api/admin/generation-jobs/{job_id}")
async def admin_delete_generation_job(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    admin = verify_admin_user(authorization)
    supabase_admin_request("DELETE", f"generation_jobs?id=eq.{quote(job_id)}")
    write_audit_log(admin, "generation_job.hard_delete", "generation_job", target_id=job_id)
    return {"ok": True}


@app.get("/api/admin/settings", response_model=AdminSettingsResponse)
async def admin_get_settings(authorization: str | None = Header(default=None)) -> AdminSettingsResponse:
    verify_admin_user(authorization)
    response = supabase_admin_request(
        "GET",
        "admin_settings?select=key,value,is_secret,updated_at&order=key.asc",
    )
    data = response.json()
    rows = data if isinstance(data, list) else []
    merged_rows = merge_settings_with_environment(rows)
    return AdminSettingsResponse(settings=[admin_setting_view(row) for row in merged_rows])


@app.put("/api/admin/settings", response_model=AdminSettingsResponse)
async def admin_update_settings(
    request: AdminSettingsUpdate,
    authorization: str | None = Header(default=None),
) -> AdminSettingsResponse:
    admin = verify_admin_user(authorization)
    timestamp = now_iso()
    rows = [
        {
            "key": setting.key.strip(),
            "value": setting.value,
            "is_secret": setting.isSecret or setting.key.strip() in ADMIN_SECRET_KEYS,
            "updated_by": admin.id,
            "updated_at": timestamp,
        }
        for setting in request.settings
        if setting.key.strip()
    ]
    if rows:
        update_local_env_file({row["key"]: row["value"] or "" for row in rows})
        supabase_admin_request(
            "POST",
            "admin_settings",
            json_body=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        write_audit_log(
            admin,
            "settings.update",
            "admin_settings",
            summary=", ".join(row["key"] for row in rows),
        )
        clear_runtime_settings_cache()
    return await admin_get_settings(authorization)


@app.get("/api/admin/audit-logs")
async def admin_list_audit_logs(
    authorization: str | None = Header(default=None),
) -> dict[str, list[AdminAuditLog]]:
    verify_admin_user(authorization)
    response = supabase_admin_request(
        "GET",
        "admin_audit_logs?select=*&order=created_at.desc&limit=100",
    )
    data = response.json()
    rows = data if isinstance(data, list) else []
    logs = [
        AdminAuditLog(
            id=row.get("id"),
            adminId=row.get("admin_id"),
            adminEmail=row.get("admin_email"),
            action=str(row.get("action") or ""),
            targetType=str(row.get("target_type") or ""),
            targetId=row.get("target_id"),
            summary=row.get("summary"),
            createdAt=row.get("created_at"),
        )
        for row in rows
        if isinstance(row, dict)
    ]
    return {"logs": logs}


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "3d-agent-api",
        "provider": selected_provider(),
        "imageProvider": selected_image_provider(),
        "cadamProvider": cadam_llm_provider(),
    }


@app.get("/api/auth/me", response_model=AuthUser)
async def auth_me(authorization: str | None = Header(default=None)) -> AuthUser:
    return verify_supabase_user(authorization)


@app.post("/api/help-chat", response_model=HelpChatResponse)
async def help_chat(request: HelpChatRequest) -> HelpChatResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="Message is required.")

    message = await asyncio.to_thread(call_mimo_help_chat, request)
    return HelpChatResponse(message=message)


@app.post("/api/help-chat/stream")
async def help_chat_stream(request: HelpChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Message is required.")

    return StreamingResponse(
        stream_mimo_help_chat(request),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/cadam/generate", response_model=CadamGenerateResponse)
async def cadam_generate(request: CadamGenerateRequest) -> CadamGenerateResponse:
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required.")

    provider = cadam_llm_provider()
    if provider == "openai":
        return await asyncio.to_thread(call_openai_cadam_generation, request)
    if provider == "mimo":
        return await asyncio.to_thread(call_mimo_cadam_generation, request)
    raise HTTPException(status_code=400, detail="CADAM_LLM_PROVIDER must be mimo or openai.")


@app.post("/api/jobs", response_model=GenerationJob)
async def create_job(
    request: CreateJobRequest,
    authorization: str | None = Header(default=None),
) -> GenerationJob:
    user = verify_supabase_user(authorization)
    assert authorization is not None
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    provider = selected_provider()
    if provider == "meshy" and not env_or_runtime_secret("MESHY_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="MODEL_PROVIDER=meshy requires MESHY_API_KEY in .env or the shell environment.",
        )
    if provider == "neural4d" and not env_or_runtime_secret("NEURAL4D_API_TOKEN"):
        raise HTTPException(
            status_code=400,
            detail="MODEL_PROVIDER=neural4d requires NEURAL4D_API_TOKEN in .env or the shell environment.",
        )
    if provider == "hunyuan" and (
        not env_or_runtime_secret("TENCENTCLOUD_SECRET_ID")
        or not env_or_runtime_secret("TENCENTCLOUD_SECRET_KEY")
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
    insert_history_row(generation_job_to_history_row(job, user.id), authorization)
    jobs[job.id] = job
    register_job_context(job.id, user, authorization)

    if provider == "meshy":
        asyncio.create_task(run_meshy_generation(job.id, request))
    elif provider == "neural4d":
        asyncio.create_task(run_neural4d_generation(job.id, request))
    elif provider == "hunyuan":
        asyncio.create_task(run_hunyuan_generation(job.id, request))
    else:
        asyncio.create_task(simulate_generation(job.id))

    return job


@app.get("/api/jobs", response_model=list[GenerationJob])
async def list_jobs(authorization: str | None = Header(default=None)) -> list[GenerationJob]:
    verify_supabase_user(authorization)
    assert authorization is not None
    return [history_row_to_generation_job(row) for row in list_history_rows("3d", authorization)]


@app.post("/api/image-jobs", response_model=ImageJob)
async def create_image_job(
    request: CreateImageJobRequest,
    authorization: str | None = Header(default=None),
) -> ImageJob:
    user = verify_supabase_user(authorization)
    assert authorization is not None
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    provider = selected_image_provider()
    if provider not in {"siliconflow", "openai", "mock"}:
        raise HTTPException(
            status_code=400,
            detail="IMAGE_PROVIDER must be siliconflow, openai, or mock.",
        )
    if provider == "siliconflow" and not env_or_runtime_secret("SILICONFLOW_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="IMAGE_PROVIDER=siliconflow requires SILICONFLOW_API_KEY in .env.",
        )
    if provider == "openai" and not env_or_runtime_secret("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="IMAGE_PROVIDER=openai requires OPENAI_API_KEY in .env.",
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
    insert_history_row(image_job_to_history_row(job, user.id), authorization)
    image_jobs[job.id] = job
    register_job_context(job.id, user, authorization)

    if provider == "openai":
        asyncio.create_task(run_openai_image_generation(job.id, request))
    else:
        asyncio.create_task(run_siliconflow_image_generation(job.id, request))
    return job


@app.get("/api/image-jobs", response_model=list[ImageJob])
async def list_image_jobs(authorization: str | None = Header(default=None)) -> list[ImageJob]:
    verify_supabase_user(authorization)
    assert authorization is not None
    return [history_row_to_image_job(row) for row in list_history_rows("image", authorization)]


@app.get("/api/image-jobs/{job_id}", response_model=ImageJob)
async def get_image_job(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> ImageJob:
    verify_supabase_user(authorization)
    assert authorization is not None
    row = get_history_row(job_id, "image", authorization)
    if row is None:
        raise HTTPException(status_code=404, detail="Image job not found.")
    return history_row_to_image_job(row)


@app.get("/api/image-jobs/{job_id}/image")
async def get_image_job_image(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    verify_supabase_user(authorization)
    assert authorization is not None
    row = get_history_row(job_id, "image", authorization)
    if row is None:
        raise HTTPException(status_code=404, detail="Image job not found.")
    job = history_row_to_image_job(row)
    if job.status != "completed" or not job.imageUrl:
        raise HTTPException(status_code=409, detail="Image is not ready yet.")

    if job.imageUrl.startswith("local://"):
        image_path = image_cache_path(job.id)
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="Generated image file not found.")
        return image_file_response(job.id, image_path)

    try:
        image_path = await asyncio.to_thread(cache_remote_image, job)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    return image_file_response(job.id, image_path)


@app.get("/api/jobs/{job_id}/model")
async def get_job_model(
    job_id: str,
    format: TargetFormat | None = None,
    authorization: str | None = Header(default=None),
):
    user = verify_supabase_user(authorization)
    assert authorization is not None
    job = jobs.get(job_id) if user_owns_local_job(job_id, user) else None
    if job is None:
        row = get_history_row(job_id, "3d", authorization)
        if row is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        job = history_row_to_generation_job(row)
    if job.status != "completed" or not job.modelUrl:
        raise HTTPException(status_code=409, detail="Model is not ready yet.")

    export_format = format or job.targetFormat

    cached_path = model_cache_path(job, export_format, job.modelUrl)
    if cached_path.exists() and cached_path.stat().st_size > 0:
        return file_response_for_model(job, export_format, cached_path)

    if job.modelUrl == "/models/demo-asset.glb":
        if not DEMO_MODEL_PATH.exists():
            raise HTTPException(status_code=404, detail="Demo model not found.")
        if export_format == "glb":
            return file_response_for_model(job, export_format, DEMO_MODEL_PATH)
        if not can_convert_model_locally("glb", export_format):
            raise format_unavailable_error(job, export_format)
        try:
            await asyncio.to_thread(convert_model_file, DEMO_MODEL_PATH, cached_path, export_format)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return file_response_for_model(job, export_format, cached_path)

    source_url = job.modelUrl
    source_format = infer_model_format(job.modelUrl, job.targetFormat)
    if export_format != job.targetFormat:
        provider_export_url = await asyncio.to_thread(export_url_from_provider, job, export_format)
        if provider_export_url:
            source_url = provider_export_url
            source_format = export_format
        elif not can_convert_model_locally(source_format, export_format):
            raise format_unavailable_error(job, export_format)

    if not source_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Unsupported model URL.")

    try:
        if source_format == export_format:
            await asyncio.to_thread(download_remote_model, source_url, cached_path)
        else:
            source_path = model_cache_path(job, source_format, source_url)
            if not source_path.exists() or source_path.stat().st_size == 0:
                await asyncio.to_thread(download_remote_model, source_url, source_path)
            await asyncio.to_thread(convert_model_file, source_path, cached_path, export_format)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    return file_response_for_model(job, export_format, cached_path)


@app.get("/api/jobs/{job_id}", response_model=GenerationJob)
async def get_job(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> GenerationJob:
    user = verify_supabase_user(authorization)
    assert authorization is not None
    local_job = jobs.get(job_id)
    if local_job and user_owns_local_job(job_id, user):
        return local_job
    row = get_history_row(job_id, "3d", authorization)
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return history_row_to_generation_job(row)
