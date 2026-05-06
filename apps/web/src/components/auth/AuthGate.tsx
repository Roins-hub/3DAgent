"use client";

import { Loader2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { AuroraBackground } from "@/components/ui/aurora-background";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoading, session } = useAuth();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  if (isLoading) {
    return (
      <AuroraBackground className="auth-aurora-page">
        <div className="auth-glass-card auth-loading-card">
          <Loader2 className="animate-spin" size={18} />
          <span>正在检查登录状态</span>
        </div>
      </AuroraBackground>
    );
  }

  if (!session) {
    return (
      <AuroraBackground className="auth-aurora-page">
        <section className="auth-glass-card auth-required-card">
          <Link href="/" className="auth-required-brand">
            <span>
              <Sparkles className="size-5" />
            </span>
            <strong>智模工坊</strong>
          </Link>

          <div className="auth-required-lock">
            <Lock size={30} />
          </div>

          <p className="auth-required-eyebrow">Protected Workspace</p>
          <h1>请先登录</h1>
          <p className="auth-required-copy">工作台会保存你的生成任务和下载记录</p>

          <div className="auth-required-actions">
            <Button asChild className="h-12 w-full text-base">
              <Link href={loginHref}>前往登录</Link>
            </Button>
            <Button asChild variant="secondary" className="h-12 w-full text-base">
              <Link href="/">返回首页</Link>
            </Button>
          </div>
        </section>
      </AuroraBackground>
    );
  }

  return children;
}
