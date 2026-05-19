"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Component as AiLoader } from "@/components/ui/ai-loader";
import { api } from "@/lib/api";
import { buildCadamPreviewHref } from "@/lib/cadam-routing";

type CadamLoadingClientProps = {
  requirement: string;
  requestId: string;
};

export function CadamLoadingClient({ requirement, requestId }: CadamLoadingClientProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runGeneration() {
      if (!requirement.trim()) {
        setError("缺少生成需求，请返回后重新输入。");
        return;
      }

      try {
        const result = await api.paramcadRun({
          requirement,
          runFea: false,
          clientRequestId: requestId || undefined,
        });
        if (!cancelled) {
          window.location.assign(buildCadamPreviewHref(result));
        }
      } catch (generateError) {
        if (!cancelled) {
          setError(generateError instanceof Error ? generateError.message : "CAD Core 生成失败。");
        }
      }
    }

    runGeneration();

    return () => {
      cancelled = true;
    };
  }, [requirement, requestId]);

  if (error) {
    return (
      <main className="cadam-loading-error-page">
        <section className="cadam-loading-error">
          <span>生成中断</span>
          <h1>CAD 生成失败</h1>
          <p>{error}</p>
          <Link href="/industrial/cadam">返回生成页</Link>
        </section>
      </main>
    );
  }

  return <AiLoader text="正在生成" />;
}
