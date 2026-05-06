import type {
  CreateImageJobRequest,
  CreateJobRequest,
  GenerationJob,
  ImageJob,
} from "@3dagent/shared";
import { getAuthHeaders } from "@/lib/supabase";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8016";

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

export type HelpChatStreamOptions = {
  onDelta: (delta: string) => void;
};

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
    throw new Error(body?.detail ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<AuthUser>("/api/auth/me"),
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
  listImageJobs: () => request<ImageJob[]>("/api/image-jobs"),
  getImageJob: (jobId: string) => request<ImageJob>(`/api/image-jobs/${jobId}`),
  imageUrl: (jobId: string) => `${API_BASE_URL}/api/image-jobs/${jobId}/image`,
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
  helpChatStream: async (payload: HelpChatRequest, options: HelpChatStreamOptions) => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/help-chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });

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
