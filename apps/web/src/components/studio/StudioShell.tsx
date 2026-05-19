"use client";

import type { GenerationJob, TargetFormat } from "@3dagent/shared";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  ChevronDown,
  Download,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, api, createClientRequestId } from "@/lib/api";
import { getAuthHeaders } from "@/lib/supabase";
import { useGenerationStore } from "@/store/useGenerationStore";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GenerationCanvas } from "./GenerationCanvas";

const exportFormatOptions: Array<{
  value: TargetFormat;
  label: string;
  description: string;
}> = [
  {
    value: "glb",
    label: "GLB",
    description: "默认格式，适合网页预览和通用交付。",
  },
  {
    value: "fbx",
    label: "FBX",
    description: "适合 DCC 工具、动画和游戏管线。",
  },
  {
    value: "obj",
    label: "OBJ",
    description: "通用网格格式，便于跨软件交换。",
  },
  {
    value: "stl",
    label: "STL",
    description: "适合 3D 打印和几何检查。",
  },
];

const modelTypeCopy = {
  industrial: {
    label: "机械零件生成",
    hint: "机械结构、工程零件与装配模型",
    placeholder:
      "输入你想生成的机械零件，例如一组精密齿轮传动结构，金属材质、倒角边缘、装配孔位清晰",
  },
  appliance: {
    label: "白色家电生成",
    hint: "洗衣机、冰箱、厨电等白色家电模型",
    placeholder:
      "输入你想生成的白色家电，例如一台极简滚筒洗衣机，白色机身、圆形舱门、细节面板和柔和倒角",
  },
};

type ModelType = keyof typeof modelTypeCopy;

function getModelType(value: string | null): ModelType {
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

function loadErrorMessage() {
  return `历史记录加载失败，请确认后端 ${API_BASE_URL} 可访问，且当前账号已登录。`;
}

export function StudioShell() {
  const searchParams = useSearchParams();
  const modelType = getModelType(searchParams.get("type"));
  const currentModelType = modelTypeCopy[modelType];
  const { jobs, activeJobId, setJobs, upsertJob, setActiveJobId } =
    useGenerationStore();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<TargetFormat>("glb");
  const [error, setError] = useState<string | null>(null);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [activeJobId, jobs],
  );

  const canDownload = Boolean(
    activeJob?.status === "completed" && activeJob.modelUrl,
  );
  const resolvedModelUrl =
    activeJob?.status === "completed" && activeJob.modelUrl
      ? activeJob.modelUrl === "/models/demo-asset.glb"
        ? activeJob.modelUrl
        : api.modelUrl(activeJob.id, activeJob.targetFormat)
      : null;
  const selectedExportOption =
    exportFormatOptions.find((option) => option.value === exportFormat) ??
    exportFormatOptions[0];

  useEffect(() => {
    api
      .listJobs()
      .then(setJobs)
      .catch((err) => {
        setError(err instanceof Error ? err.message : loadErrorMessage());
      });
  }, [setJobs]);

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
        const nextJob = await api.getJob(activeJob.id);
        upsertJob(nextJob);
      } catch (err) {
        setError(err instanceof Error ? err.message : "任务轮询失败");
      }
    }, 1200);

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
        targetFormat: exportFormat,
        clientRequestId: createClientRequestId(),
      });
      upsertJob(job);
      setActiveJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectJob(job: GenerationJob) {
    setActiveJobId(job.id);
    setPrompt(job.prompt);
  }

  async function exportModel() {
    if (!activeJob || !canDownload) return;
    setError(null);
    setIsExporting(true);

    try {
      const response = await fetch(api.modelUrl(activeJob.id, exportFormat), {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? `导出失败 ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeJob.prompt.slice(0, 24) || "model"}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className="studio-workspace studio-workspace--model">
      <header className="studio-workspace-topbar">
        <div className="studio-topbar-left">
          <Link href="/" className="studio-back-button" aria-label="返回首页">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <p>{currentModelType.label}工作台</p>
            <span>{currentModelType.hint} · 文本生成、模型预览、历史导出</span>
          </div>
        </div>
        <div className="studio-topbar-actions">
          {activeJob ? (
            <StatusBadge status={activeJob.status} />
          ) : (
            <span className="studio-ready-pill">就绪</span>
          )}
          <div className="studio-export-menu">
            <Button
              variant="dark"
              className="studio-export-main-button"
              disabled={!canDownload || isExporting}
              onClick={() => void exportModel()}
              aria-busy={isExporting}
              title={
                canDownload
                  ? `导出 ${selectedExportOption.label}`
                  : "模型完成后可导出"
              }
            >
              <Download
                className={isExporting ? "animate-pulse" : undefined}
                size={16}
              />
              <span className="sm:hidden">导出</span>
              <span className="hidden sm:inline">
                导出 {selectedExportOption.label}
              </span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="dark"
                  size="icon"
                  className="studio-export-menu-trigger"
                  aria-label="选择导出格式"
                  title="选择导出格式"
                >
                  <ChevronDown size={16} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 border-white/70 bg-white/95 text-slate-950 shadow-xl backdrop-blur"
                side="bottom"
                sideOffset={8}
                align="end"
              >
                <DropdownMenuRadioGroup
                  value={exportFormat}
                  onValueChange={(value) => setExportFormat(value as TargetFormat)}
                >
                  {exportFormatOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="items-start [&>span]:pt-1.5"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold">{option.label}</span>
                        <span className="text-xs text-slate-500">
                          {option.description}
                        </span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <section className="studio-workspace-grid">
        <aside className="studio-glass-panel studio-input-panel">
          <div className="studio-panel-heading">
            <span>
              <Sparkles size={18} />
            </span>
            <div>
              <h1>生成输入</h1>
              <p>只填写当前接口真实使用的提示词</p>
            </div>
          </div>

          <textarea
            className="studio-textarea"
            placeholder={currentModelType.placeholder}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />

          {error && (
            <div className="studio-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <Button
            className="studio-primary-action"
            disabled={isSubmitting || prompt.trim().length === 0}
            onClick={() => void submitGeneration()}
            aria-busy={isSubmitting}
          >
            <Send className={isSubmitting ? "animate-pulse" : undefined} size={16} />
            生成模型
          </Button>

          {activeJob && (
            <div className="studio-current-card">
              <div>
                <span>当前任务</span>
                <StatusBadge status={activeJob.status} />
              </div>
              <p>{activeJob.prompt}</p>
              <div className="studio-progress-label">
                <span>实时进度</span>
                <strong>{activeJob.progress}%</strong>
              </div>
              <div className="studio-progress">
                <i style={{ width: `${activeJob.progress}%` }} />
              </div>
              {activeJob.error && <small>{activeJob.error}</small>}
            </div>
          )}
        </aside>

        <section className="studio-preview-panel">
          <GenerationCanvas activeJob={activeJob} modelUrl={resolvedModelUrl} />
        </section>

        <aside className="studio-glass-panel studio-history-panel">
          <div className="studio-panel-heading">
            <span>
              <Boxes size={18} />
            </span>
            <div>
              <h2>生成历史</h2>
              <p>点击历史项恢复提示词和预览</p>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="studio-empty-state">
              暂无任务，请先输入提示词并生成模型
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
                  <div className="studio-progress">
                    <i style={{ width: `${job.progress}%` }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
