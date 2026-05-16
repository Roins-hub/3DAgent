import type {
  CreateImageJobRequest,
  CreateJobRequest,
  GenerationJob,
  ImageJob,
  JobStatus,
} from "@3dagent/shared";
import { apiBaseUrlCandidates, normalizeApiBaseUrl } from "@3dagent/shared";
import { getAuthHeaders } from "@/lib/supabase";

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
let activeApiBaseUrl = API_BASE_URL;

function browserHostname() {
  return typeof window === "undefined" ? undefined : window.location.hostname;
}

function isDesktopApp() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return Boolean(
    window.desktopNavigation?.isDesktopApp ||
      params.get("__desktop") === "1" ||
      document.documentElement.classList.contains("desktop-app-shell"),
  );
}

function apiBaseUrls() {
  return apiBaseUrlCandidates(API_BASE_URL, browserHostname(), isDesktopApp());
}

function apiUrl(path: string, baseUrl = activeApiBaseUrl) {
  return `${baseUrl}${path}`;
}

function connectionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return `无法连接后端服务 ${apiBaseUrls().join(" 或 ")}。请确认 FastAPI 已启动。${message ? `（${message}）` : ""}`;
}

function formatApiError(status: number, detail: unknown) {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (status === 401) {
    return "登录已失效，请重新登录后再试。";
  }
  if (status === 403) {
    return "当前账号没有权限执行这个操作。";
  }
  if (status === 502) {
    return "后端连接 Supabase 或模型服务失败，请检查后端日志和环境配置。";
  }
  if (status >= 500) {
    return `后端服务异常：HTTP ${status}`;
  }
  return `请求失败：HTTP ${status}`;
}

export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
}

export interface HelpChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface HelpChatRequest {
  messages: HelpChatMessage[];
  selectedTool?: string | null;
  hasImage?: boolean;
  imageDataUrl?: string | null;
}

export interface HelpChatResponse {
  message: string;
}

export interface AdminSummary {
  totalUsers: number;
  totalJobs: number;
  modelJobs: number;
  imageJobs: number;
  cadamJobs: number;
  paramcadJobs: number;
  failedJobs: number;
  runningJobs: number;
  completedJobs: number;
  recentJobs: AdminGenerationJob[];
}

export interface AdminUser {
  id: string;
  email: string | null;
  username: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  isBanned: boolean;
}

export interface AdminGenerationJob {
  id: string;
  userId: string;
  kind: "3d" | "image" | "cadam" | "paramcad";
  prompt: string;
  mode: string | null;
  status: JobStatus;
  progress: number;
  quality: string | null;
  style: string | null;
  targetFormat: string | null;
  aspectRatio: string | null;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface AdminSetting {
  key: string;
  value: string | null;
  isSecret: boolean;
  isConfigured: boolean;
  updatedAt: string | null;
}

export interface AdminAuditLog {
  id: string | null;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string | null;
  createdAt: string | null;
}

export interface CadamGenerateRequest {
  prompt: string;
  parameters?: Record<string, unknown>;
}

export interface CadamGenerateResponse {
  name: string;
  description: string;
  scad: string;
  parameters: Record<string, unknown>;
  provider: string;
  model: string;
}

export interface ParamcadRunRequest {
  requirement: string;
  runFea?: boolean;
}

export interface ParamcadRunResponse {
  success: boolean;
  message: string | null;
  title: string | null;
  domain: string | null;
  material: string | null;
  geometryType: string | null;
  score: number | null;
  iterations: number | null;
  safetyFactor: number | null;
  maxStress: number | null;
  feaPassed: boolean | null;
  stepFile: string | null;
  stepDownloadUrl: string | null;
  parameters: Record<string, number>;
  provider: string;
  model: string;
}

export type HelpChatStreamOptions = {
  onDelta: (delta: string) => void;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  let response: Response | null = null;
  let lastConnectionError: unknown = null;

  for (const baseUrl of apiBaseUrls()) {
    try {
      response = await fetch(apiUrl(path, baseUrl), {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
          ...init?.headers,
        },
      });
      activeApiBaseUrl = baseUrl;
      break;
    } catch (error) {
      lastConnectionError = error;
    }
  }

  if (!response) {
    throw new Error(connectionErrorMessage(lastConnectionError));
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(formatApiError(response.status, body?.detail));
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<AuthUser>("/api/auth/me"),
  listJobs: () => request<GenerationJob[]>("/api/jobs"),
  getJob: (jobId: string) => request<GenerationJob>(`/api/jobs/${jobId}`),
  modelUrl: (jobId: string, format?: string) =>
    `${activeApiBaseUrl}/api/jobs/${jobId}/model${
      format ? `?format=${encodeURIComponent(format)}` : ""
    }`,
  createJob: (payload: CreateJobRequest) =>
    request<GenerationJob>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listImageJobs: () => request<ImageJob[]>("/api/image-jobs"),
  getImageJob: (jobId: string) => request<ImageJob>(`/api/image-jobs/${jobId}`),
  imageUrl: (jobId: string) => `${activeApiBaseUrl}/api/image-jobs/${jobId}/image`,
  createImageJob: (payload: CreateImageJobRequest) =>
    request<ImageJob>("/api/image-jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  helpChat: (payload: HelpChatRequest) =>
    request<HelpChatResponse>("/api/help-chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cadamGenerate: (payload: CadamGenerateRequest) =>
    request<CadamGenerateResponse>("/api/cadam/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  paramcadRun: (payload: ParamcadRunRequest) =>
    request<ParamcadRunResponse>("/api/paramcad/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  paramcadOutputUrl: (stepFile: string) =>
    `${activeApiBaseUrl}/api/paramcad/outputs/${encodeURIComponent(stepFile)}`,
  adminSummary: () => request<AdminSummary>("/api/admin/summary"),
  adminUsers: () => request<{ users: AdminUser[] }>("/api/admin/users"),
  adminUserAction: (userId: string, action: "disable" | "restore") =>
    request<AdminUser>(`/api/admin/users/${userId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  adminDeleteUser: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}`, {
      method: "DELETE",
    }),
  adminJobs: (params?: {
    kind?: string;
    status?: string;
    search?: string;
    includeDeleted?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params?.kind) query.set("kind", params.kind);
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.includeDeleted) query.set("includeDeleted", "true");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ jobs: AdminGenerationJob[] }>(`/api/admin/generation-jobs${suffix}`);
  },
  adminJobAction: (jobId: string, action: "soft_delete" | "restore" | "retry") =>
    request<{ job: AdminGenerationJob }>(`/api/admin/generation-jobs/${jobId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  adminDeleteJob: (jobId: string) =>
    request<{ ok: boolean }>(`/api/admin/generation-jobs/${jobId}`, {
      method: "DELETE",
    }),
  adminSettings: () => request<{ settings: AdminSetting[] }>("/api/admin/settings"),
  adminUpdateSettings: (
    settings: { key: string; value: string | null; isSecret: boolean }[],
  ) =>
    request<{ settings: AdminSetting[] }>("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    }),
  adminAuditLogs: () => request<{ logs: AdminAuditLog[] }>("/api/admin/audit-logs"),
  helpChatStream: async (payload: HelpChatRequest, options: HelpChatStreamOptions) => {
    const authHeaders = await getAuthHeaders();
    let response: Response | null = null;
    let lastConnectionError: unknown = null;

    for (const baseUrl of apiBaseUrls()) {
      try {
        response = await fetch(apiUrl("/api/help-chat/stream", baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify(payload),
        });
        activeApiBaseUrl = baseUrl;
        break;
      } catch (error) {
        lastConnectionError = error;
      }
    }

    if (!response) {
      throw new Error(connectionErrorMessage(lastConnectionError));
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail ?? `Request failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Streaming response is not available.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let message = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const delta = decoder.decode(value, { stream: true });
      if (delta) {
        message += delta;
        options.onDelta(delta);
      }
    }

    const tail = decoder.decode();
    if (tail) {
      message += tail;
      options.onDelta(tail);
    }

    return { message };
  },
};
