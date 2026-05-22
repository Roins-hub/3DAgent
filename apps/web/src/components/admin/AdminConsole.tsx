"use client";

import {
  Activity,
  AlertTriangle,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  type AdminAuditLog,
  type AdminGenerationJob,
  type AdminSetting,
  type AdminSummary,
  type AdminUser,
} from "@/lib/api";

type AdminView = "overview" | "users" | "jobs" | "settings" | "audit";

const views: { id: AdminView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "users", label: "用户管理", icon: UserCog },
  { id: "jobs", label: "生成记录", icon: Database },
  { id: "settings", label: "系统配置", icon: Settings },
  { id: "audit", label: "审计日志", icon: ShieldCheck },
];

const editableSettings = [
  { key: "MODEL_PROVIDER", label: "三维供应商", secret: false, placeholder: "mock / hunyuan / meshy / neural4d" },
  { key: "IMAGE_PROVIDER", label: "图片供应商", secret: false, placeholder: "mock / siliconflow / openai" },
  { key: "CADAM_LLM_PROVIDER", label: "CADAM 模型通道", secret: false, placeholder: "mimo / openai" },
  { key: "OPENAI_IMAGE_MODEL", label: "OpenAI 图片模型", secret: false, placeholder: "gpt-image-2" },
  { key: "SILICONFLOW_IMAGE_MODEL", label: "SiliconFlow 图片模型", secret: false, placeholder: "Kwai-Kolors/Kolors" },
  { key: "MIMO_CHAT_MODEL", label: "MIMO 对话模型", secret: false, placeholder: "mimo-v2.5-pro" },
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", secret: true, placeholder: "保存后不会回显" },
  { key: "SILICONFLOW_API_KEY", label: "SiliconFlow API Key", secret: true, placeholder: "保存后不会回显" },
  { key: "MIMO_API_KEY", label: "MIMO API Key", secret: true, placeholder: "保存后不会回显" },
  { key: "TENCENT_TOKENHUB_API_KEY", label: "Tencent TokenHub API Key", secret: true, placeholder: "保存后不会回显" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "排队",
    running: "运行",
    postprocessing: "后处理",
    completed: "完成",
    failed: "失败",
  };
  return labels[status] ?? status;
}

function jobKindLabel(kind: AdminGenerationJob["kind"]) {
  const labels: Record<AdminGenerationJob["kind"], string> = {
    "3d": "3D",
    image: "图片",
    cadam: "CADAM",
    paramcad: "工程 CAD",
  };
  return labels[kind] ?? kind;
}

export function AdminConsole() {
  const [view, setView] = useState<AdminView>("overview");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [jobs, setJobs] = useState<AdminGenerationJob[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [jobKind, setJobKind] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settingsByKey = useMemo(
    () => new Map(settings.map((item) => [item.key, item])),
    [settings],
  );

  const loadSummary = useCallback(async () => {
    const nextSummary = await api.adminSummary();
    setSummary(nextSummary);
  }, []);

  const loadUsers = useCallback(async () => {
    const nextUsers = await api.adminUsers();
    setUsers(nextUsers.users);
  }, []);

  const loadSettings = useCallback(async () => {
    const nextSettings = await api.adminSettings();
    setSettings(nextSettings.settings);
  }, []);

  const loadAuditLogs = useCallback(async () => {
    const nextLogs = await api.adminAuditLogs();
    setLogs(nextLogs.logs);
  }, []);

  const loadJobs = useCallback(async () => {
    const result = await api.adminJobs({
      kind: jobKind || undefined,
      status: jobStatus || undefined,
      search: jobSearch || undefined,
      includeDeleted,
    });
    setJobs(result.jobs);
  }, [includeDeleted, jobKind, jobSearch, jobStatus]);

  const loadAll = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (view === "overview") {
        await loadSummary();
      } else if (view === "users") {
        await loadUsers();
      } else if (view === "jobs") {
        await loadJobs();
      } else if (view === "settings") {
        await loadSettings();
      } else {
        await loadAuditLogs();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "后台数据加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [loadAuditLogs, loadJobs, loadSettings, loadSummary, loadUsers, view]);

  useEffect(() => {
    let isMounted = true;
    api.adminSummary()
      .then((nextSummary) => {
        if (!isMounted) return;
        setSummary(nextSummary);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "后台数据加载失败");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function selectView(nextView: AdminView) {
    setView(nextView);
    if (
      (nextView === "overview" && summary) ||
      (nextView === "users" && users.length > 0) ||
      (nextView === "jobs" && jobs.length > 0) ||
      (nextView === "settings" && settings.length > 0) ||
      (nextView === "audit" && logs.length > 0)
    ) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      if (nextView === "overview") {
        await loadSummary();
      } else if (nextView === "users") {
        await loadUsers();
      } else if (nextView === "jobs") {
        await loadJobs();
      } else if (nextView === "settings") {
        await loadSettings();
      } else {
        await loadAuditLogs();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "后台数据加载失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function guardedAction(message: string, action: () => Promise<void>) {
    if (!window.confirm(message)) return;
    setError(null);
    try {
      await action();
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function saveSettings() {
    const payload = editableSettings
      .map((item) => ({ key: item.key, value: formValues[item.key]?.trim() ?? "", isSecret: item.secret }))
      .filter((item) => item.value.length > 0);
    if (!payload.length) return;
    if (!window.confirm("确认更新系统配置？新的配置会同步写入本地 apps/api/.env。")) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await api.adminUpdateSettings(payload);
      setSettings(result.settings);
      setFormValues({});
      const audit = await api.adminAuditLogs();
      setLogs(audit.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "配置保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span><ShieldCheck size={18} /></span>
          <div>
            <strong>智模后台</strong>
            <small>内部运维控制台</small>
          </div>
        </div>
        <nav>
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => void selectView(item.id)}
                type="button"
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p>Admin Console</p>
            <h1>{views.find((item) => item.id === view)?.label}</h1>
          </div>
          <button className="admin-icon-button" onClick={() => void loadAll()} type="button" title="刷新">
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
          </button>
        </header>

        {error && (
          <div className="admin-alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        )}

        {view === "overview" && (
          <section className="admin-view">
            <div className="admin-metrics">
              <Metric label="用户总数" value={summary?.totalUsers ?? 0} />
              <Metric label="生成总数" value={summary?.totalJobs ?? 0} />
              <Metric label="工程 CAD" value={summary?.paramcadJobs ?? 0} />
              <Metric label="运行中" value={summary?.runningJobs ?? 0} />
              <Metric label="失败任务" value={summary?.failedJobs ?? 0} tone="danger" />
            </div>
            <Panel title="最近生成记录">
              <JobsTable jobs={summary?.recentJobs ?? []} compact />
            </Panel>
          </section>
        )}

        {view === "users" && (
          <Panel title="用户管理">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>用户</th><th>注册时间</th><th>最近登录</th><th>状态</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.username || user.email || user.id}</strong><small>{user.email}</small></td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>{formatDate(user.lastSignInAt)}</td>
                      <td><span className={user.isBanned ? "admin-badge danger" : "admin-badge"}>{user.isBanned ? "已禁用" : "正常"}</span></td>
                      <td className="admin-actions">
                        <button onClick={() => void guardedAction(user.isBanned ? "确认恢复这个用户？" : "确认禁用这个用户？", async () => {
                          await api.adminUserAction(user.id, user.isBanned ? "restore" : "disable");
                        })} type="button">
                          {user.isBanned ? "恢复" : "禁用"}
                        </button>
                        <button className="danger" onClick={() => void guardedAction("确认永久删除这个用户？此操作不可恢复。", async () => {
                          await api.adminDeleteUser(user.id);
                        })} type="button">
                          <Trash2 size={14} />硬删
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {view === "jobs" && (
          <Panel title="生成记录">
            <div className="admin-filters">
              <label><Search size={15} /><input value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="搜索提示词" /></label>
              <select value={jobKind} onChange={(event) => setJobKind(event.target.value)}><option value="">全部类型</option><option value="3d">3D</option><option value="image">图片</option><option value="cadam">CADAM</option><option value="paramcad">工程 CAD</option></select>
              <select value={jobStatus} onChange={(event) => setJobStatus(event.target.value)}><option value="">全部状态</option><option value="queued">排队</option><option value="running">运行</option><option value="completed">完成</option><option value="failed">失败</option></select>
              <label className="admin-checkbox"><input checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} type="checkbox" />含软删</label>
              <button onClick={() => void loadJobs()} type="button">筛选</button>
            </div>
            <JobsTable
              jobs={jobs}
              onAction={(job, action) => void guardedAction(
                action === "hard_delete" ? "确认永久删除这条生成记录？" : "确认执行此操作？",
                async () => {
                  if (action === "hard_delete") await api.adminDeleteJob(job.id);
                  else await api.adminJobAction(job.id, action);
                },
              )}
            />
          </Panel>
        )}

        {view === "settings" && (
          <Panel title="系统配置">
            <div className="admin-settings-grid">
              {editableSettings.map((item) => {
                const current = settingsByKey.get(item.key);
                const value = formValues[item.key] ?? current?.value ?? "";
                const isSecretVisible = Boolean(visibleSecrets[item.key]);
                return (
                  <label key={item.key} className="admin-setting-field">
                    <span>{item.secret ? <KeyRound size={14} /> : <Activity size={14} />}{item.label}</span>
                    <div className="admin-secret-input">
                      <input
                        value={value}
                        onChange={(event) => setFormValues((nextValue) => ({ ...nextValue, [item.key]: event.target.value }))}
                        placeholder={item.placeholder}
                        type={item.secret && !isSecretVisible ? "password" : "text"}
                      />
                      {item.secret && (
                        <button
                          type="button"
                          onClick={() => setVisibleSecrets((nextValue) => ({ ...nextValue, [item.key]: !nextValue[item.key] }))}
                          title={isSecretVisible ? "隐藏密钥" : "显示密钥"}
                          aria-label={isSecretVisible ? "隐藏密钥" : "显示密钥"}
                        >
                          {isSecretVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                    <small>{item.secret ? (current?.isConfigured ? `当前密钥已加载 ${formatDate(current.updatedAt)}` : "未配置") : current?.value || "使用 .env 兜底"}</small>
                  </label>
                );
              })}
            </div>
            <button className="admin-primary" disabled={isSaving} onClick={() => void saveSettings()} type="button">
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}
              保存配置
            </button>
          </Panel>
        )}

        {view === "audit" && (
          <Panel title="审计日志">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>时间</th><th>管理员</th><th>动作</th><th>对象</th><th>摘要</th></tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <tr key={log.id ?? index}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.adminEmail || log.adminId || "-"}</td>
                      <td><span className="admin-badge">{log.action}</span></td>
                      <td>{log.targetType} {log.targetId}</td>
                      <td>{log.summary || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className={tone === "danger" ? "admin-metric danger" : "admin-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function JobsTable({
  jobs,
  compact,
  onAction,
}: {
  jobs: AdminGenerationJob[];
  compact?: boolean;
  onAction?: (job: AdminGenerationJob, action: "soft_delete" | "restore" | "retry" | "hard_delete") => void;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr><th>任务</th><th>用户</th><th>状态</th><th>创建</th>{!compact && <th>操作</th>}</tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <strong>{jobKindLabel(job.kind)} · {job.prompt}</strong>
                <small>{job.id}</small>
              </td>
              <td>{job.userId}</td>
              <td><span className={job.status === "failed" ? "admin-badge danger" : "admin-badge"}>{statusLabel(job.status)} · {job.progress}%</span></td>
              <td>{formatDate(job.createdAt)}</td>
              {!compact && (
                <td className="admin-actions">
                  <button onClick={() => onAction?.(job, "retry")} type="button">重试</button>
                  <button onClick={() => onAction?.(job, job.deletedAt ? "restore" : "soft_delete")} type="button">{job.deletedAt ? "恢复" : "软删"}</button>
                  <button className="danger" onClick={() => onAction?.(job, "hard_delete")} type="button"><Trash2 size={14} />硬删</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
