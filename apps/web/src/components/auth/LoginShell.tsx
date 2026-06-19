"use client";

import { AlertCircle, Eye, EyeOff, Loader2, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthSplitPage } from "@/components/ui/animated-characters-auth-page";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAuthErrorMessage } from "@/lib/auth-utils";
import { getSupabaseClient } from "@/lib/supabase";

type LoginMode = "password" | "code";

function resolveNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function LoginShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => resolveNextPath(searchParams.get("next")),
    [searchParams],
  );
  const registerHref = `/register?next=${encodeURIComponent(nextPath)}`;
  const supabase = getSupabaseClient();
  const { isLoading: isSessionLoading, session } = useAuth();

  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSendingResetLink, setIsSendingResetLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSessionLoading && session) {
      router.replace(nextPath);
    }
  }, [isSessionLoading, nextPath, router, session]);

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  function validatePasswordLogin() {
    if (!email.trim()) {
      setError("请输入邮箱地址");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请输入有效的邮箱地址");
      return false;
    }

    if (!password) {
      setError("请输入密码");
      return false;
    }

    return true;
  }

  function validateCodeLogin() {
    if (!email.trim()) {
      setError("请输入邮箱地址");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请输入有效的邮箱地址");
      return false;
    }

    if (!code.trim()) {
      setError("请输入验证码");
      return false;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setError("验证码必须是6位数字");
      return false;
    }

    return true;
  }

  async function sendLoginCode() {
    resetFeedback();

    if (!email.trim()) {
      setError("请输入邮箱地址");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请输入有效的邮箱地址");
      return;
    }

    setIsSendingCode(true);

    try {
      console.info("[Login] 发送登录/注册验证码:", { email });

      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (sendError) {
        console.info("[Login] 发送验证码失败:", sendError.message);
        setError(formatAuthErrorMessage(sendError, "send-login-code"));
        return;
      }

      setMessage("验证码已发送，请查看邮箱；新邮箱会在验证后自动创建账号。");
    } catch (err) {
      console.info("[Login] 发送验证码网络错误:", getErrorMessage(err));
      setError(formatAuthErrorMessage(err, "send-login-code"));
    } finally {
      setIsSendingCode(false);
    }
  }

  async function sendPasswordResetEmail() {
    resetFeedback();

    if (!email.trim()) {
      setError("请输入邮箱地址。");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请输入有效的邮箱地址。");
      return;
    }

    setIsSendingResetLink(true);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo },
      );

      if (resetError) {
        throw resetError;
      }

      setMessage("重置密码邮件已发送，请前往邮箱点击重置链接。");
    } catch (err) {
      console.error("[Login] password reset error:", err);
      setError(formatAuthErrorMessage(err, "send-login-code"));
    } finally {
      setIsSendingResetLink(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    const isValid = loginMode === "password" ? validatePasswordLogin() : validateCodeLogin();
    if (!isValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (loginMode === "password") {
        console.info("[Login] 密码登录:", { email });

        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (loginError) {
          console.info("[Login] 密码登录未通过:", loginError.message);
          setError(formatAuthErrorMessage(loginError, "password-login"));
          return;
        }
      } else {
        console.info("[Login] 验证码登录/注册:", { email });

        const { error: loginError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });

        if (loginError) {
          console.info("[Login] 验证码登录未通过:", loginError.message);
          setError(formatAuthErrorMessage(loginError, "otp-login"));
          return;
        }
      }

      router.replace(nextPath);
    } catch (err) {
      console.info("[Login] 登录请求未完成:", err);

      setError(formatAuthErrorMessage(err, loginMode === "password" ? "password-login" : "otp-login"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSplitPage
      eyebrow="Supabase Auth"
      title="欢迎回来"
      subtitle="登录后继续生成工业模型与图片方案"
      actionHref="/"
      actionLabel="返回首页"
      isTyping={isTyping}
      password={password}
      showPassword={showPassword}
    >
      <form className="flex flex-col gap-5" onSubmit={login}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-email">邮箱</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => setIsTyping(true)}
            onBlur={() => setIsTyping(false)}
            placeholder="example@email.com"
            required
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant={loginMode === "password" ? "default" : "secondary"}
            type="button"
            className="flex-1"
            onClick={() => {
              setLoginMode("password");
              resetFeedback();
            }}
          >
            密码登录
          </Button>
          <Button
            variant={loginMode === "code" ? "default" : "secondary"}
            type="button"
            className="flex-1"
            onClick={() => {
              setLoginMode("code");
              resetFeedback();
            }}
          >
            验证码登录/注册
          </Button>
        </div>

        {loginMode === "password" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">密码</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder="请输入密码"
                required
                className={showPassword ? "pr-12" : "password-mask-input pr-12"}
              />
              <button
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button
              type="button"
              className="self-end text-sm font-semibold text-muted-foreground transition hover:text-foreground"
              disabled={isSendingResetLink}
              onClick={() => void sendPasswordResetEmail()}
            >
              {isSendingResetLink ? "正在发送找回链接..." : "忘记密码"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-code">验证码</Label>
            <div className="flex gap-2">
              <Input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder="请输入6位验证码"
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={isSendingCode}
                onClick={() => void sendLoginCode()}
              >
                {isSendingCode ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
                获取登录/注册码
              </Button>
            </div>
          </div>
        )}

        {message && (
          <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm text-muted-foreground">
            <Mail className="mt-0.5 shrink-0 text-primary" size={16} />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 shrink-0" size={16} />
            <span>{error}</span>
          </div>
        )}

        <Button className="h-12 w-full text-base" disabled={isSubmitting} type="submit">
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
          登录
        </Button>

        <Button asChild variant="secondary" className="h-12 w-full text-base">
          <Link href={registerHref}>
            <UserPlus size={18} />
            创建账号
          </Link>
        </Button>
      </form>
    </AuthSplitPage>
  );
}
