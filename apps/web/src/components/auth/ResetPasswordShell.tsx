"use client";

import { AlertCircle, CheckCircle2, Loader2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

function isValidPassword(value: string) {
  return value.length >= 6 && !/^\d+$/.test(value);
}

export function ResetPasswordShell() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { isLoading: isSessionLoading, session } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasRecoverySession = useMemo(() => !!session, [session]);

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    if (!hasRecoverySession) {
      setError("请从重置密码邮件中的链接打开此页面。");
      return;
    }

    if (!password) {
      setError("请输入新密码。");
      return;
    }

    if (!isValidPassword(password)) {
      setError("密码至少需要 6 个字符，且不能全部为数字。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }

      setMessage("密码已更新，正在返回登录页...");
      await supabase.auth.signOut({ scope: "local" });
      setTimeout(() => {
        router.replace("/login");
      }, 900);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      console.error("[ResetPassword] update failed:", err);
      setError(text || "密码更新失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-[460px] rounded-2xl border border-black/10 bg-white p-8 shadow-sm">
        <Link href="/" className="mb-6 flex items-center gap-3 text-lg font-semibold">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
            <Sparkles className="size-5" />
          </span>
          <span>智模精工</span>
        </Link>

        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">账号安全</p>
          <h1 className="text-3xl font-bold tracking-tight">重置密码</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            请输入新密码。此页面需要通过重置密码邮件中的链接打开。
          </p>
        </div>

        {!hasRecoverySession && !isSessionLoading && (
          <div className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
            未找到重置密码会话。请先打开邮件中的重置密码链接。
          </div>
        )}

        <form className="flex flex-col gap-5" onSubmit={submitPassword}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 个字符，不能全为数字"
              disabled={!hasRecoverySession}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">确认新密码</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入新密码"
              disabled={!hasRecoverySession}
            />
          </div>

          {message && (
            <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={16} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 shrink-0" size={16} />
              <span>{error}</span>
            </div>
          )}

          <Button className="h-12 w-full text-base" disabled={isSubmitting || !hasRecoverySession} type="submit">
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
            保存新密码
          </Button>
        </form>
      </section>
    </main>
  );
}
