export type AdminView = "overview" | "users" | "jobs" | "settings" | "audit";

export type JobStatus =
  | "queued"
  | "running"
  | "postprocessing"
  | "completed"
  | "failed";

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
