"use client";

import { ExternalLink, Loader2, Maximize2, RefreshCw } from "lucide-react";
import React from "react";

const CAD_URL = "/vendor/chili3d/index.html";

export function Chili3DWorkbench() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [frameKey, setFrameKey] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 3500);

    return () => window.clearTimeout(timer);
  }, [frameKey]);

  return (
    <section className="chili-workbench" aria-label="智模工坊 CAD 工作台">
      <div className="chili-workbench-bar">
        <div>
          <p>智模工坊</p>
          <span>网页 CAD 建模、草图、实体编辑与导入导出</span>
        </div>
        <div className="chili-workbench-actions">
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setFrameKey((key) => key + 1);
            }}
            aria-label="重新加载智模工坊"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <a href={CAD_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            新窗口
          </a>
          <a href={CAD_URL} target="_blank" rel="noreferrer" aria-label="全屏打开智模工坊">
            <Maximize2 size={16} />
          </a>
        </div>
      </div>

      <div className="chili-frame-shell">
        {isLoading ? (
          <div className="chili-frame-loading">
            <Loader2 size={26} />
            <span>正在载入智模工坊...</span>
          </div>
        ) : null}
        <iframe
          key={frameKey}
          src={CAD_URL}
          title="智模工坊"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="fullscreen; clipboard-read; clipboard-write"
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </section>
  );
}
