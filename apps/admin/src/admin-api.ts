import { supabase } from "./supabase";
import { apiBaseUrlCandidates } from "@3dagent/shared";
import type {
  AdminAuditLog,
  AdminGenerationJob,
  AdminSetting,
  AdminSummary,
  AdminUser,
} from "./types";

const configuredApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.NEXT_PUBLIC_API_BASE_URL;

function browserHostname() {
  return typeof window === "undefined" ? undefined : window.location.hostname;
}

function apiBaseUrls() {
  return apiBaseUrlCandidates(configuredApiBaseUrl, browserHostname());
}

function initialApiBaseUrl() {
  return apiBaseUrls()[0] ?? "";
}

let activeApiBaseUrl = initialApiBaseUrl();
export const API_BASE_URL = activeApiBaseUrl || "/api";

function apiUrl(path: string, baseUrl = activeApiBaseUrl) {
  return `${baseUrl}${path}`;
}

function connectionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const candidates = apiBaseUrls().map((baseUrl) => baseUrl || "/api").join(" 或 ");
  return `无法连接后端服务 ${candidates}。请确认 FastAPI 已启动。${message ? `（${message}）` : ""}`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

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
    throw new Error(body?.detail ?? `请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const adminApi = {
  summary: () => request<AdminSummary>("/api/admin/summary"),
  users: () => request<{ users: AdminUser[] }>("/api/admin/users"),
  userAction: (userId: string, action: "disable" | "restore") =>
    request<AdminUser>(`/api/admin/users/${userId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteUser: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}`, {
      method: "DELETE",
    }),
  jobs: (params?: {
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
    return request<{ jobs: AdminGenerationJob[] }>(
      `/api/admin/generation-jobs${suffix}`,
    );
  },
  jobAction: (jobId: string, action: "soft_delete" | "restore" | "retry") =>
    request<{ job: AdminGenerationJob }>(
      `/api/admin/generation-jobs/${jobId}/action`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      },
    ),
  deleteJob: (jobId: string) =>
    request<{ ok: boolean }>(`/api/admin/generation-jobs/${jobId}`, {
      method: "DELETE",
    }),
  settings: () => request<{ settings: AdminSetting[] }>("/api/admin/settings"),
  updateSettings: (
    settings: { key: string; value: string | null; isSecret: boolean }[],
  ) =>
    request<{ settings: AdminSetting[] }>("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    }),
  auditLogs: () => request<{ logs: AdminAuditLog[] }>("/api/admin/audit-logs"),
};
