"use client";

import type { ImageAspectRatio, ImageJob } from "@3dagent/shared";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Image as ImageIcon,
  Maximize2,
  RotateCcw,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, api } from "@/lib/api";
import { getAuthHeaders } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

const aspectRatios: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

const imageTypeCopy = {
  industrial: {
    label: "机械零件图",
    hint: "机械结构、精密零件与装配效果图",
    placeholder:
      "输入机械零件图描述，例如一组精密齿轮组件，金属材质、工程灯光、装配结构清晰",
  },
  appliance: {
    label: "白色家电图",
    hint: "洗衣机、冰箱、厨电等白色家电产品图",
    placeholder:
      "输入白色家电图描述，例如一台现代白色冰箱，简洁外观、柔和高光、干净产品摄影背景",
  },
};

type ImageType = keyof typeof imageTypeCopy;

function getImageType(value: string | null): ImageType {
  if (value === "industrial" || value === "appliance") {
    return value;
  }

  return "industrial";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isBackendConnectionError(value: string | null) {
  return Boolean(value?.startsWith("Cannot connect to backend"));
}

export function ImageStudioShell() {
  const searchParams = useSearchParams();
  const imageType = getImageType(searchParams.get("type"));
  const currentImageType = imageTypeCopy[imageType];
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("1:1");
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    jobId: string;
    url: string;
    blob: Blob;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const previewDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [activeJobId, jobs],
  );
  const isCompleted = activeJob?.status === "completed";
  const hasFailed = activeJob?.status === "failed";
  const previewUrl =
    activeJob && preview?.jobId === activeJob.id ? preview.url : null;
  const hasPreviewError = Boolean(isCompleted && error && !previewUrl);
  const canDownload = Boolean(isCompleted && !hasPreviewError);
  const isPreviewLoading = Boolean(isCompleted && !previewUrl && !error);

  useEffect(() => {
    api
      .listImageJobs()
      .then((items) => {
        setJobs(items);
        setActiveJobId((current) => current ?? items[0]?.id ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : `历史记录加载失败，请确认后端 ${API_BASE_URL} 可访问`);
      });
  }, []);

  useEffect(() => {
    if (
      !activeJob ||
      activeJob.status === "completed" ||
      activeJob.status === "failed"
    ) {
      return;
    }

    let isMounted = true;

    const refreshJob = async () => {
      try {
        const nextJob = await api.getImageJob(activeJob.id);
        if (isMounted) {
          setJobs((items) =>
            items.map((item) => (item.id === nextJob.id ? nextJob : item)),
          );
          setError((current) => (isBackendConnectionError(current) ? null : current));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "图片任务轮询失败";
        setError((current) => current ?? message);
      }
    };

    void refreshJob();
    const interval = window.setInterval(() => void refreshJob(), 700);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [activeJob]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== "completed") {
      return;
    }
    let isMounted = true;
    let objectUrl: string | null = null;

    getAuthHeaders()
      .then((headers) =>
        fetch(`${api.imageUrl(activeJob.id)}?v=${encodeURIComponent(activeJob.updatedAt)}`, {
          headers,
        }),
      )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const detail =
            typeof body?.detail === "string"
              ? body.detail
              : `图片加载失败 ${response.status}`;
          throw new Error(
            response.status === 410
              ? "图片文件缺失，请重新生成或在后台重试这条记录。"
              : detail,
          );
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = window.URL.createObjectURL(blob);
        if (isMounted) {
          setPreview({ jobId: activeJob.id, url: objectUrl, blob });
        } else {
          window.URL.revokeObjectURL(objectUrl);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "图片加载失败");
        }
      });

    return () => {
      isMounted = false;
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeJob]);

  useEffect(() => {
    if (!isPreviewFullscreen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPreviewFullscreen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPreviewFullscreen]);

  function saveImageBlob(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
  }

  async function submitImageGeneration() {
    setError(null);
    setIsSubmitting(true);
    try {
      const job = await api.createImageJob({
        prompt,
        aspectRatio,
      });
      setJobs((items) => [job, ...items]);
      setActiveJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建图片任务失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectJob(job: ImageJob) {
    setActiveJobId(job.id);
    setPrompt(job.prompt);
    setAspectRatio(job.aspectRatio);
    setIsPreviewFullscreen(false);
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
  }

  async function downloadActiveImage() {
    if (!activeJob || activeJob.status !== "completed") return;
    setError(null);
    setIsDownloading(true);
    const fileName = `${activeJob.prompt.slice(0, 24) || "image"}.png`;
    try {
      if (preview?.jobId === activeJob.id) {
        saveImageBlob(preview.blob, fileName);
        return;
      }
      const response = await fetch(api.imageUrl(activeJob.id), {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(`图片下载失败 ${response.status}`);
      }
      const blob = await response.blob();
      saveImageBlob(blob, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片下载失败");
    } finally {
      setIsDownloading(false);
    }
  }

  function updatePreviewScale(nextScale: number) {
    setPreviewScale(Math.min(6, Math.max(0.35, nextScale)));
  }

  function resetFullscreenPreview() {
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
  }

  function handleFullscreenWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    updatePreviewScale(previewScale + (event.deltaY > 0 ? -0.16 : 0.16));
  }

  function handlePreviewPointerDown(event: React.PointerEvent<HTMLImageElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    previewDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewOffset.x,
      originY: previewOffset.y,
    };
  }

  function handlePreviewPointerMove(event: React.PointerEvent<HTMLImageElement>) {
    const drag = previewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setPreviewOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }

  function handlePreviewPointerUp(event: React.PointerEvent<HTMLImageElement>) {
    if (previewDragRef.current?.pointerId === event.pointerId) {
      previewDragRef.current = null;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <main className="studio-workspace studio-workspace--image">
      <header className="studio-workspace-topbar">
        <div className="studio-topbar-left">
          <Link href="/" className="studio-back-button" aria-label="返回首页">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <p>{currentImageType.label}工作台</p>
            <span>{currentImageType.hint} · 提示词、比例、预览、历史下载</span>
          </div>
        </div>
        <div className="studio-topbar-actions">
          {activeJob ? (
            <StatusBadge status={activeJob.status} />
          ) : (
            <span className="studio-ready-pill">就绪</span>
          )}
          <Button
            variant="dark"
            disabled={!canDownload || isDownloading}
            onClick={() => void downloadActiveImage()}
            title={canDownload ? "下载当前图片" : "图片完成后可下载"}
            aria-busy={isDownloading}
          >
            <Download size={16} />
            <span className="hidden sm:inline">下载图片</span>
            <span className="sm:hidden">下载</span>
          </Button>
        </div>
      </header>

      <section className="studio-workspace-grid">
        <aside className="studio-glass-panel studio-input-panel">
          <div className="studio-panel-heading">
            <span>
              <ImageIcon size={18} />
            </span>
            <div>
              <h1>生成输入</h1>
              <p>提示词与图片比例会发送给后端</p>
            </div>
          </div>

          <textarea
            className="studio-textarea"
            placeholder={currentImageType.placeholder}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />

          <label className="studio-field-label" htmlFor="image-aspect-ratio">
            图片比例
          </label>
          <select
            id="image-aspect-ratio"
            className="studio-select"
            value={aspectRatio}
            onChange={(event) =>
              setAspectRatio(event.target.value as ImageAspectRatio)
            }
          >
            {aspectRatios.map((ratio) => (
              <option value={ratio} key={ratio}>
                {ratio}
              </option>
            ))}
          </select>

          {error && (
            <div className="studio-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <Button
            className="studio-primary-action"
            disabled={isSubmitting || prompt.trim().length === 0}
            onClick={() => void submitImageGeneration()}
            aria-busy={isSubmitting}
          >
            <WandSparkles
              className={isSubmitting ? "animate-pulse" : undefined}
              size={16}
            />
            生成图片
          </Button>

          {activeJob && (
            <div className="studio-current-card">
              <div>
                <span>当前任务</span>
                <StatusBadge status={activeJob.status} />
              </div>
              <p>{activeJob.prompt}</p>
              <small>比例 {activeJob.aspectRatio}</small>
              <div className="studio-progress">
                <i style={{ width: `${activeJob.progress}%` }} />
              </div>
              {activeJob.error && <small>{activeJob.error}</small>}
            </div>
          )}
        </aside>

        <section className="studio-preview-panel">
          <div className="image-preview-canvas">
            <div className="image-preview-grid" />
            {previewUrl ? (
              <div className="image-preview-tools">
                <button
                  type="button"
                  onClick={() => {
                    resetFullscreenPreview();
                    setIsPreviewFullscreen(true);
                  }}
                  aria-label="全屏预览"
                  title="全屏预览"
                >
                  <Maximize2 size={17} />
                </button>
              </div>
            ) : null}
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={activeJob?.prompt ?? "生成图片"}
                className="image-preview-result"
                decoding="async"
              />
            ) : (
              <div className="image-preview-empty">
                <span>
                  {isPreviewLoading ? (
                    <WandSparkles className="animate-pulse" size={30} />
                  ) : (
                    <ImageIcon size={30} />
                  )}
                </span>
                <div>
                  <p>
                    {isPreviewLoading
                      ? "图片文件加载中"
                      : hasPreviewError
                        ? "图片文件缺失"
                        : hasFailed
                          ? "图片生成失败"
                          : activeJob
                            ? "图片正在生成"
                            : "等待图片提示词"}
                  </p>
                  <small>
                    {isPreviewLoading
                      ? "任务已完成，正在下载图片文件"
                      : hasPreviewError
                        ? error
                        : hasFailed
                          ? activeJob?.error || "请调整提示词后重试"
                          : activeJob
                            ? `当前进度 ${activeJob.progress}%`
                            : "完成后生成图会在这里预览"}
                  </small>
                </div>
              </div>
            )}
            <div className="studio-preview-state">
              {previewUrl
                ? "图片预览"
                : hasPreviewError
                  ? "文件缺失"
                  : hasFailed
                    ? "失败"
                    : activeJob
                      ? "正在生成"
                      : "就绪"}
            </div>
          </div>
        </section>

        <aside className="studio-glass-panel studio-history-panel">
          <div className="studio-panel-heading">
            <span>
              <ImageIcon size={18} />
            </span>
            <div>
              <h2>图片历史</h2>
              <p>点击历史项恢复提示词和预览</p>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="studio-empty-state">
              暂无图片任务，请先输入提示词并生成图片
            </div>
          ) : (
            <div className="studio-history-list">
              {jobs.map((job) => (
                <button
                  className={job.id === activeJobId ? "is-active" : undefined}
                  key={job.id}
                  onClick={() => selectJob(job)}
                >
                  <div>
                    <StatusBadge status={job.status} />
                    <span>{formatTime(job.createdAt)}</span>
                  </div>
                  <p>{job.prompt}</p>
                  <div className="studio-history-meta">
                    <span>{job.aspectRatio}</span>
                    <span>{job.progress}%</span>
                  </div>
                  <div className="studio-progress">
                    <i style={{ width: `${job.progress}%` }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </section>

      {isPreviewFullscreen && previewUrl ? (
        <div
          className="image-fullscreen-preview"
          role="dialog"
          aria-modal="true"
          aria-label="全屏图片预览"
          onWheel={handleFullscreenWheel}
        >
          <div className="image-fullscreen-tools">
            <button
              type="button"
              onClick={() => updatePreviewScale(previewScale - 0.25)}
              aria-label="缩小"
              title="缩小"
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              onClick={() => updatePreviewScale(previewScale + 0.25)}
              aria-label="放大"
              title="放大"
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              onClick={resetFullscreenPreview}
              aria-label="重置视图"
              title="重置视图"
            >
              <RotateCcw size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsPreviewFullscreen(false)}
              aria-label="关闭全屏预览"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
          <div className="image-fullscreen-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={activeJob?.prompt ?? "生成图片"}
              className="image-fullscreen-result"
              decoding="async"
              draggable={false}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
              style={{
                transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})`,
              }}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
