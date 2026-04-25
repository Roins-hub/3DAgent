"use client";

import type { GenerationJob, TargetFormat } from "@3dagent/shared";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Download,
  Play,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, api } from "@/lib/api";
import { useGenerationStore } from "@/store/useGenerationStore";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GenerationCanvas } from "./GenerationCanvas";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StudioShell() {
  const { jobs, activeJobId, setJobs, upsertJob, setActiveJobId } =
    useGenerationStore();
  const [prompt, setPrompt] = useState("");
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [activeJobId, jobs],
  );

  useEffect(() => {
    api
      .listJobs()
      .then(setJobs)
      .catch(() => {
        setError(`API 未连接，请确认 FastAPI 已在 ${API_BASE_URL} 启动。`);
      });
  }, [setJobs]);

  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const nextJob = await api.getJob(activeJob.id);
        upsertJob(nextJob);
      } catch (err) {
        setError(err instanceof Error ? err.message : "任务轮询失败。");
      }
    }, 900);

    return () => window.clearInterval(interval);
  }, [activeJob, upsertJob]);

  async function submitGeneration() {
    setError(null);
    setIsSubmitting(true);
    try {
      const job = await api.createJob({
        prompt,
        mode: "text-to-3d",
        quality: "balanced",
        style: "game-ready",
        targetFormat: "glb",
      });
      upsertJob(job);
      setActiveJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectJob(job: GenerationJob) {
    setActiveJobId(job.id);
    setPrompt(job.prompt);
  }

  async function exportModel(format: TargetFormat) {
    if (!activeJob || !canDownload) return;
    setError(null);
    setIsExportMenuOpen(false);

    try {
      const response = await fetch(api.modelUrl(activeJob.id, format));
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? `导出失败：${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeJob.prompt.slice(0, 24) || "model"}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败。");
    }
  }

  const canDownload = Boolean(
    activeJob?.status === "completed" && activeJob.modelUrl,
  );
  const resolvedModelUrl =
    activeJob?.status === "completed" && activeJob.modelUrl
      ? activeJob.modelUrl === "/models/demo-asset.glb"
        ? activeJob.modelUrl
        : api.modelUrl(activeJob.id, activeJob.targetFormat)
      : null;

  return (
    <main className="min-h-screen bg-[#ece7dc] text-[#171817]">
      <header className="relative z-50 flex items-center justify-between overflow-visible border-b border-black/10 bg-[#f7f2e8]/85 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-black/[0.05]"
            aria-label="返回首页"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="font-bold">Forma Agent 工作台</p>
            <p className="text-xs text-[#656057]">
              聊天生成、3D 预览、版本历史与模型导出
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={activeJob?.status ?? "queued"} />
          <div className="relative z-50">
            <Button
              variant="dark"
              disabled={!canDownload}
              onClick={() => setIsExportMenuOpen((value) => !value)}
              aria-expanded={isExportMenuOpen}
            >
              <Download size={16} />
              导出
              <ChevronDown size={15} />
            </Button>
            {isExportMenuOpen && (
              <div className="absolute right-0 top-11 z-[80] w-40 overflow-hidden rounded-md border border-black/10 bg-white p-1 text-sm shadow-xl">
                {(["glb", "fbx", "obj"] as TargetFormat[]).map((format) => (
                  <button
                    className="flex w-full items-center justify-between rounded px-3 py-2 text-left font-semibold text-[#202421] hover:bg-[#20766f]/10 disabled:cursor-not-allowed disabled:text-[#8b8579] disabled:hover:bg-transparent"
                    disabled={format !== activeJob?.targetFormat}
                    key={format}
                    onClick={() => void exportModel(format)}
                    title={
                      format === activeJob?.targetFormat
                        ? `导出 ${format.toUpperCase()}`
                        : `当前任务没有生成 ${format.toUpperCase()} 文件`
                    }
                  >
                    <span>{format.toUpperCase()}</span>
                    {format === activeJob?.targetFormat && (
                      <span className="text-xs text-[#20766f]">可用</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-65px)] grid-rows-[auto_1fr_auto] gap-3 p-3 lg:grid-cols-[390px_1fr] lg:grid-rows-[1fr_auto]">
        <aside className="surface flex min-h-[540px] flex-col rounded-lg p-4 lg:row-span-2">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#202421] text-[#f7f1e7]">
              <Sparkles size={17} />
            </span>
            <div>
              <h1 className="font-bold">生成对话</h1>
              <p className="text-xs text-[#656057]">模拟后端接口</p>
            </div>
          </div>

          <div className="mb-4 flex-1 space-y-3 overflow-auto rounded-lg border border-black/10 bg-white/50 p-3">
            <div className="rounded-lg bg-[#202421] p-3 text-sm leading-6 text-[#f7f1e7]">
              告诉我你想生成什么模型，我会准备网格、材质和导出设置。
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
              </div>
            )}
          </div>

          <div className="space-y-3">
            <textarea
              className="min-h-28 w-full resize-none rounded-md border border-black/10 bg-white/70 p-3 text-sm leading-6 outline-none transition focus:border-[#20766f]"
              placeholder="请输入你想生成的 3D 模型，例如：生成一个写实风格的陶瓷杯，带蓝色釉面。"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <div className="rounded-md border border-[#20766f]/20 bg-[#20766f]/10 px-3 py-2 text-xs font-semibold text-[#1b514c]">
              当前模式：文本生成 3D
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
              onClick={submitGeneration}
              aria-busy={isSubmitting}
            >
              <Send className={isSubmitting ? "animate-pulse" : undefined} size={16} />
              生成模型
            </Button>
          </div>
        </aside>

        <section className="dark-surface rounded-lg p-3">
          <GenerationCanvas activeJob={activeJob} modelUrl={resolvedModelUrl} />
        </section>

        <section className="surface rounded-lg p-4 lg:col-start-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">生成历史</h2>
              <p className="text-xs text-[#656057]">
                选择任意版本，可恢复对应提示词和预览状态。
              </p>
            </div>
            <Button variant="secondary" onClick={() => void submitGeneration()}>
              <Play size={15} />
              再生成一次
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {jobs.length === 0 ? (
              <div className="rounded-md border border-dashed border-black/15 p-4 text-sm text-[#656057]">
                暂无任务。请先在左侧输入提示词并开始生成。
              </div>
            ) : (
              jobs.map((job) => (
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
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
