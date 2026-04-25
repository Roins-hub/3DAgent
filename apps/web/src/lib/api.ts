import type { CreateJobRequest, GenerationJob } from "@3dagent/shared";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listJobs: () => request<GenerationJob[]>("/api/jobs"),
  getJob: (jobId: string) => request<GenerationJob>(`/api/jobs/${jobId}`),
  modelUrl: (jobId: string, format?: string) =>
    `${API_BASE_URL}/api/jobs/${jobId}/model${
      format ? `?format=${encodeURIComponent(format)}` : ""
    }`,
  createJob: (payload: CreateJobRequest) =>
    request<GenerationJob>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
