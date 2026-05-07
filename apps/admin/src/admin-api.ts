import { supabase } from "./supabase";
import type {
  AdminAuditLog,
  AdminGenerationJob,
  AdminSetting,
  AdminSummary,
  AdminUser,
} from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8016";

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...init?.headers,
    },
  });

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
