import { supabase } from "./supabase";
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8016";
async function getAuthHeaders() {
    const { data: { session }, } = await supabase.auth.getSession();
    return session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
}
async function request(path, init) {
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
    return response.json();
}
export const adminApi = {
    summary: () => request("/api/admin/summary"),
    users: () => request("/api/admin/users"),
    userAction: (userId, action) => request(`/api/admin/users/${userId}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
    }),
    deleteUser: (userId) => request(`/api/admin/users/${userId}`, {
        method: "DELETE",
    }),
    jobs: (params) => {
        const query = new URLSearchParams();
        if (params?.kind)
            query.set("kind", params.kind);
        if (params?.status)
            query.set("status", params.status);
        if (params?.search)
            query.set("search", params.search);
        if (params?.includeDeleted)
            query.set("includeDeleted", "true");
        const suffix = query.toString() ? `?${query.toString()}` : "";
        return request(`/api/admin/generation-jobs${suffix}`);
    },
    jobAction: (jobId, action) => request(`/api/admin/generation-jobs/${jobId}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
    }),
    deleteJob: (jobId) => request(`/api/admin/generation-jobs/${jobId}`, {
        method: "DELETE",
    }),
    settings: () => request("/api/admin/settings"),
    updateSettings: (settings) => request("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
    }),
    auditLogs: () => request("/api/admin/audit-logs"),
};
