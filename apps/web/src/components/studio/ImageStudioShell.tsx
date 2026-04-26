"use client";

import type { ImageAspectRatio, ImageJob } from "@3dagent/shared";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Image as ImageIcon,
  Play,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

const aspectRatios: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ImageStudioShell() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("1:1");
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ jobId: string; url: string } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [activeJobId, jobs],
  );

  useEffect(() => {
    api
      .listImageJobs()
      .then((items) => {
        setJobs(items);
        setActiveJobId((current) => current ?? items[0]?.id ?? null);
      })
      .catch(() => {
        setError(`图片 API 未连接，请确认 FastAPI 已在 ${API_BASE_URL} 启动。`);
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

    const interval = window.setInterval(async () => {
      try {
        const nextJob = await api.getImageJob(activeJob.id);
        setJobs((items) =>
          items.map((item) => (item.id === nextJob.id ? nextJob : item)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "图片任务轮询失败。");
      }
    }, 900);

    return () => window.clearInterval(interval);
  }, [activeJob]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== "completed") {
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;

    fetch(`${api.imageUrl(activeJob.id)}?v=${encodeURIComponent(activeJob.updatedAt)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`图片加载失败：${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = window.URL.createObjectURL(blob);
        if (isMounted) {
          setPreview({ jobId: activeJob.id, url: objectUrl });
        } else {
          window.URL.revokeObjectURL(objectUrl);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "图片加载失败。");
        }
      });

    return () => {
      isMounted = false;
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeJob]);

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
      setError(err instanceof Error ? err.message : "创建图片任务失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectJob(job: ImageJob) {
    setActiveJobId(job.id);
    setPrompt(job.prompt);
    setAspectRatio(job.aspectRatio);
  }

  async function downloadActiveImage() {
    if (!activeJob || activeJob.status !== "completed") return;
    setError(null);
    try {
      const response = await fetch(api.imageUrl(activeJob.id));
      if (!response.ok) {
        throw new Error(`图片下载失败：${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeJob.prompt.slice(0, 24) || "image"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片下载失败。");
    }
  }

  const canDownload = activeJob?.status === "completed";
  const previewUrl =
    activeJob && preview?.jobId === activeJob.id ? preview.url : null;
  const isPreviewLoading = Boolean(canDownload && !previewUrl && !error);

  return (
    <main className="min-h-screen bg-[#ece7dc] text-[#171817]">
      <header className="relative z-50 flex items-center justify-between border-b border-black/10 bg-[#f7f2e8]/85 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-black/[0.05]"
            aria-label="返回首页"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="font-bold">图片生成工作台</p>
            <p className="text-xs text-[#656057]">
              免费 Pollinations 文生图、预览与下载
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={activeJob?.status ?? "queued"} />
          <Button
            variant="dark"
            disabled={!canDownload}
            onClick={() => void downloadActiveImage()}
          >
            <Download size={16} />
            下载图片
          </Button>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-65px)] gap-3 p-3 lg:grid-cols-[390px_1fr]">
        <aside className="surface flex min-h-[620px] flex-col rounded-lg p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#202421] text-[#f7f1e7]">
              <ImageIcon size={17} />
            </span>
            <div>
              <h1 className="font-bold">图片提示词</h1>
              <p className="text-xs text-[#656057]">文本生成可预览图片</p>
            </div>
          </div>

          <div className="mb-4 flex-1 space-y-3 overflow-auto rounded-lg border border-black/10 bg-white/50 p-3">
            <div className="rounded-lg bg-[#202421] p-3 text-sm leading-6 text-[#f7f1e7]">
              描述主体、场景、风格和构图。图片会由后端代理加载，避免浏览器跨域或重定向问题。
            </div>
            {activeJob && (
              <div className="rounded-lg bg-[#20766f]/10 p-3 text-sm leading-6 text-[#1b514c]">
                {activeJob.prompt}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-[#20766f] transition-all"
                    style={{ width: `${activeJob.progress}%` }}
                  />
                </div>
                {activeJob.error && (
                  <p className="mt-2 text-xs text-red-700">{activeJob.error}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <textarea
              className="min-h-28 w-full resize-none rounded-md border border-black/10 bg-white/70 p-3 text-sm leading-6 outline-none transition focus:border-[#20766f]"
              placeholder="请输入图片描述，例如：一个人在雨后的城市街道行走，电影感摄影，柔和霓虹光。"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-md border border-black/10 bg-white/70 px-3 text-sm font-semibold outline-none transition focus:border-[#20766f]"
              value={aspectRatio}
              onChange={(event) =>
                setAspectRatio(event.target.value as ImageAspectRatio)
              }
              aria-label="图片比例"
            >
              {aspectRatios.map((ratio) => (
                <option value={ratio} key={ratio}>
                  图片比例 {ratio}
                </option>
              ))}
            </select>
            <div className="rounded-md border border-[#20766f]/20 bg-[#20766f]/10 px-3 py-2 text-xs font-semibold text-[#1b514c]">
              当前模式：文本生成图片
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-red-600/10 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 shrink-0" size={16} />
                {error}
              </div>
            )}
            <Button
              className="w-full"
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
          </div>
        </aside>

        <section className="grid gap-3 lg:grid-rows-[1fr_auto]">
          <div className="dark-surface rounded-lg p-3">
            <div className="relative flex h-full min-h-[520px] items-center justify-center overflow-hidden rounded-lg bg-[#151815]">
              <div className="absolute inset-0 subtle-grid opacity-20" />
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={activeJob?.prompt ?? "生成图片"}
                  className="relative z-10 max-h-full max-w-full rounded-md object-contain shadow-2xl shadow-black/40"
                />
              ) : (
                <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center text-[#f7f1e7]">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-md border border-white/10 bg-white/10">
                    <ImageIcon size={28} />
                  </span>
                  <div>
                    <p className="text-lg font-bold">
                      {isPreviewLoading
                        ? "图片正在加载"
                        : activeJob
                          ? "图片正在生成"
                          : "等待图片提示词"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/62">
                      完成后，生成图会在这里完整预览。
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                {previewUrl ? "图片预览" : activeJob ? "正在生成" : "就绪"}
              </div>
            </div>
          </div>

          <section className="surface rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">图片生成历史</h2>
                <p className="text-xs text-[#656057]">
                  选择任意版本，可恢复对应提示词和预览状态。
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={prompt.trim().length === 0}
                onClick={() => void submitImageGeneration()}
              >
                <Play size={15} />
                再生成一次
              </Button>
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-md border border-dashed border-black/15 p-4 text-sm text-[#656057]">
                暂无图片任务。请先输入提示词并开始生成。
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => (
                  <button
                    className={`rounded-md border p-3 text-left transition ${
                      job.id === activeJobId
                        ? "border-[#20766f] bg-[#20766f]/10"
                        : "border-black/10 bg-white/55 hover:bg-white"
                    }`}
                    key={job.id}
                    onClick={() => selectJob(job)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <StatusBadge status={job.status} />
                      <span className="text-xs text-[#656057]">
                        {formatTime(job.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-5">
                      {job.prompt}
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
                      <span
                        className="block h-full rounded-full bg-[#20766f]"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
