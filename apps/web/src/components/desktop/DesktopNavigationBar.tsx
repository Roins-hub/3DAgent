"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Home,
  Loader2,
  Menu,
  RotateCw,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MenuContainer, MenuItem } from "@/components/ui/fluid-menu";

type NavigationAction = "back" | "forward" | "reload" | "home";

type NavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
};

type UpdateStatusValue =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "unsupported"
  | "error";

type UpdateInfo = {
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string | string[];
};

type UpdateStatus = {
  status: UpdateStatusValue;
  currentVersion: string;
  feedUrl?: string;
  updateInfo?: UpdateInfo;
  percent?: number;
  message?: string | null;
};

declare global {
  interface Window {
    desktopNavigation?: {
      isDesktopApp?: boolean;
      navigate: (action: NavigationAction) => Promise<NavigationState>;
      onStateChange: (callback: (state: NavigationState) => void) => () => void;
    };
    desktopUpdater?: {
      getStatus: () => Promise<UpdateStatus>;
      check: () => Promise<UpdateStatus>;
      download: () => Promise<UpdateStatus>;
      install: () => Promise<UpdateStatus>;
      onStatusChange: (callback: (state: UpdateStatus) => void) => () => void;
    };
  }
}

const initialState: NavigationState = {
  canGoBack: false,
  canGoForward: false,
};

const initialUpdateStatus: UpdateStatus = {
  status: "idle",
  currentVersion: "",
};

function detectDesktopApp() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return Boolean(
    window.desktopNavigation?.isDesktopApp ||
      window.desktopNavigation ||
      navigator.userAgent.toLowerCase().includes("electron") ||
      params.get("__desktop") === "1" ||
      document.documentElement.classList.contains("desktop-app-shell"),
  );
}

function updateStatusText(status: UpdateStatus) {
  if (status.message) {
    return status.message;
  }

  switch (status.status) {
    case "checking":
      return "正在检查更新...";
    case "available":
      return `发现新版本 ${status.updateInfo?.version ?? ""}`;
    case "not-available":
      return "当前已经是最新版本。";
    case "downloading":
      return `正在下载 ${status.percent ?? 0}%`;
    case "downloaded":
      return "更新已下载完成。";
    case "installing":
      return "正在重启并安装更新。";
    case "unsupported":
      return "当前环境不支持检查更新。";
    case "error":
      return "检查更新失败。";
    default:
      return "点击检查是否有新版本。";
  }
}

function releaseNotesList(notes: UpdateInfo["releaseNotes"]) {
  if (Array.isArray(notes)) {
    return notes.filter(Boolean);
  }
  if (typeof notes === "string" && notes.trim()) {
    return notes
      .split(/\r?\n/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

export function DesktopNavigationBar() {
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [state, setState] = useState(initialState);
  const [updateStatus, setUpdateStatus] = useState(initialUpdateStatus);
  const [isUpdatePanelOpen, setIsUpdatePanelOpen] = useState(false);

  useEffect(() => {
    const navigation = window.desktopNavigation;
    const shouldUseDesktopShell = detectDesktopApp();

    if (!shouldUseDesktopShell) {
      return;
    }

    queueMicrotask(() => setIsDesktopApp(true));
    document.documentElement.classList.add("desktop-app-shell");
    const unsubscribe = navigation?.onStateChange(setState);
    const unsubscribeUpdater = window.desktopUpdater?.onStatusChange(setUpdateStatus);
    void window.desktopUpdater?.getStatus().then(setUpdateStatus);

    return () => {
      unsubscribe?.();
      unsubscribeUpdater?.();
      document.documentElement.classList.remove("desktop-app-shell");
    };
  }, []);

  if (!isDesktopApp) {
    return null;
  }

  const navigate = async (action: NavigationAction) => {
    const nextState = await window.desktopNavigation?.navigate(action);
    if (nextState) {
      setState(nextState);
      return;
    }

    if (action === "back") {
      window.history.back();
    }
    if (action === "forward") {
      window.history.forward();
    }
    if (action === "reload") {
      window.location.reload();
    }
    if (action === "home") {
      window.location.assign("/");
    }
  };

  const checkForUpdates = async () => {
    setIsUpdatePanelOpen(true);
    const nextStatus = await window.desktopUpdater?.check();
    if (nextStatus) {
      setUpdateStatus(nextStatus);
    }
  };

  const downloadUpdate = async () => {
    const nextStatus = await window.desktopUpdater?.download();
    if (nextStatus) {
      setUpdateStatus(nextStatus);
    }
  };

  const installUpdate = async () => {
    const nextStatus = await window.desktopUpdater?.install();
    if (nextStatus) {
      setUpdateStatus(nextStatus);
    }
  };

  const isBusy =
    updateStatus.status === "checking" ||
    updateStatus.status === "downloading" ||
    updateStatus.status === "installing";
  const notes = releaseNotesList(updateStatus.updateInfo?.releaseNotes);

  return (
    <div className="fixed bottom-5 left-5 z-[1000]" role="toolbar" aria-label="Desktop navigation">
      {isUpdatePanelOpen && (
        <div className="fixed bottom-6 left-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-4 text-slate-950 shadow-2xl shadow-slate-950/20">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">软件更新</p>
              <p className="mt-1 text-xs text-slate-500">
                当前版本 {updateStatus.currentVersion || "未知"}
              </p>
            </div>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
              type="button"
              aria-label="关闭更新面板"
              onClick={() => setIsUpdatePanelOpen(false)}
            >
              <X size={17} />
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-sm">
            {updateStatus.status === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            ) : updateStatus.status === "downloaded" || updateStatus.status === "not-available" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : isBusy ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />
            ) : (
              <Download className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            )}
            <div>
              <p className="font-medium">{updateStatusText(updateStatus)}</p>
              {updateStatus.updateInfo?.version && updateStatus.status !== "not-available" && (
                <p className="mt-1 text-xs text-slate-500">
                  新版本 {updateStatus.updateInfo.version}
                </p>
              )}
            </div>
          </div>

          {updateStatus.status === "downloading" && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${Math.min(Math.max(updateStatus.percent ?? 0, 0), 100)}%` }}
              />
            </div>
          )}

          {notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {notes.slice(0, 4).map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex gap-2">
            <button
              className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={isBusy}
              onClick={() => void checkForUpdates()}
            >
              检查更新
            </button>
            {updateStatus.status === "available" && (
              <button
                className="h-9 flex-1 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => void downloadUpdate()}
              >
                下载更新
              </button>
            )}
            {updateStatus.status === "downloaded" && (
              <button
                className="h-9 flex-1 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                type="button"
                onClick={() => void installUpdate()}
              >
                重启安装
              </button>
            )}
          </div>
        </div>
      )}
      <MenuContainer>
        <MenuItem
          title="Menu"
          icon={
            <div className="relative h-6 w-6">
              <div className="absolute inset-0 origin-center opacity-100 transition-all duration-300 ease-in-out [div[data-expanded=true]_&]:rotate-180 [div[data-expanded=true]_&]:scale-0 [div[data-expanded=true]_&]:opacity-0">
                <Menu size={24} strokeWidth={1.7} />
              </div>
              <div className="absolute inset-0 origin-center -rotate-180 scale-0 opacity-0 transition-all duration-300 ease-in-out [div[data-expanded=true]_&]:rotate-0 [div[data-expanded=true]_&]:scale-100 [div[data-expanded=true]_&]:opacity-100">
                <X size={24} strokeWidth={1.7} />
              </div>
            </div>
          }
        />
        <MenuItem
          icon={<ArrowLeft size={22} strokeWidth={1.8} />}
          onClick={() => navigate("back")}
          disabled={!state.canGoBack}
          title="Back"
        />
        <MenuItem
          icon={<ArrowRight size={22} strokeWidth={1.8} />}
          onClick={() => navigate("forward")}
          disabled={!state.canGoForward}
          title="Forward"
        />
        <MenuItem
          icon={<RotateCw size={21} strokeWidth={1.8} />}
          onClick={() => navigate("reload")}
          title="Refresh"
        />
        <MenuItem
          icon={<Home size={21} strokeWidth={1.8} />}
          onClick={() => navigate("home")}
          title="Home"
        />
        <MenuItem
          icon={<Download size={21} strokeWidth={1.8} />}
          onClick={() => {
            setIsUpdatePanelOpen(true);
            void checkForUpdates();
          }}
          title="Check for updates"
        />
      </MenuContainer>
    </div>
  );
}
