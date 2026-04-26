export type GenerationMode = "text-to-3d" | "image-to-3d";

export type JobStatus =
  | "queued"
  | "running"
  | "postprocessing"
  | "completed"
  | "failed";

export type TargetFormat = "glb" | "fbx" | "obj";

export type GenerationQuality = "draft" | "balanced" | "production";

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface CreateJobRequest {
  prompt: string;
  mode: GenerationMode;
  quality: GenerationQuality;
  style: string;
  targetFormat: TargetFormat;
}

export interface GenerationJob {
  id: string;
  prompt: string;
  mode: GenerationMode;
  status: JobStatus;
  progress: number;
  quality: GenerationQuality;
  style: string;
  targetFormat: TargetFormat;
  createdAt: string;
  updatedAt: string;
  modelUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  metadata?: {
    engine: string;
    polygonBudget: string;
    textureSet: string;
  };
}

export interface CreateImageJobRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
}

export interface ImageJob {
  id: string;
  prompt: string;
  status: JobStatus;
  progress: number;
  aspectRatio: ImageAspectRatio;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
  error: string | null;
}
