"use client";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthSplitPage } from "@/components/ui/animated-characters-auth-page";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type RegisterStep = "details" | "code";

function resolveNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function isValidPassword(value: string) {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function RegisterShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => resolveNextPath(searchParams.get("next")),
    [searchParams],
  );
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const supabase = getSupabaseClient();
  const { isLoading: isSessionLoading, session } = useAuth();

  const [registerStep, setRegisterStep] = useState<RegisterStep>("details");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSessionLoading && session) {
      router.replace(nextPath);
    }
  }, [isSessionLoading, nextPath, router, session]);

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  function validateDetails() {
    if (!username.trim()) {
      setError("请输入用户名");
      return false;
    }

    if (!isValidPassword(password)) {
      setError("密码必须包含数字和英文字符");
      return false;
    }

    return true;
  }

  async function sendRegisterCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    if (!validateDetails()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.trim(),
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setRegisterStep("code");
      setMessage("验证码已发送，请查看邮箱");
    } catch {
      setError("验证码发送失败，请检查邮箱");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyRegisterCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setIsSubmitting(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "signup",
      });

      if (verifyError) {
        throw verifyError;
      }

      setMessage("注册成功，正在进入工作台");
      router.replace(nextPath);
    } catch {
      setError("验证码验证失败，请重新输入");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendRegisterCode() {
    resetFeedback();
    setIsSubmitting(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });

      if (resendError) {
        throw resendError;
      }

      setMessage("验证码已重新发送，请查看邮箱");
    } catch {
      setError("验证码重新发送失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSplitPage
      eyebrow="Create Account"
      title={registerStep === "details" ? "创建账号" : "验证邮箱"}
      subtitle={
        registerStep === "details"
          ? "输入用户名、邮箱和密码，创建你的生成工作台"
          : "输入邮箱验证码，完成账号验证"
      }
      actionHref={loginHref}
      actionLabel="返回登录"
      isTyping={isTyping}
      password={password}
      showPassword={showPassword}
    >
      {registerStep === "details" ? (
        <form className="flex flex-col gap-5" onSubmit={sendRegisterCode}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-username">用户名</Label>
            <Input
              id="register-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-email">邮箱</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-password">密码</Label>
            <div className="relative">
              <Input
                id="register-password"
                type="text"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
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
          </div>

          <Button className="h-12 w-full text-base" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
            创建账号
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={verifyRegisterCode}>
          <div className="rounded-md border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
            验证码已发送到 <strong className="text-foreground">{email}</strong>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="register-code">邮箱验证码</Label>
            <Input
              id="register-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              required
            />
          </div>
          <Button className="h-12 w-full text-base" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
            验证并注册
          </Button>
          <Button
            variant="secondary"
            className="h-12 w-full text-base"
            type="button"
            disabled={isSubmitting}
            onClick={() => void resendRegisterCode()}
          >
            重新发送验证码
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full text-base"
            type="button"
            disabled={isSubmitting}
            onClick={() => setRegisterStep("details")}
          >
            修改账号信息
          </Button>
        </form>
      )}

      <div className="mt-5 flex flex-col gap-3">
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

        <Link href={loginHref} className="text-center text-sm font-semibold text-muted-foreground hover:text-foreground">
          已有账号
        </Link>
      </div>
    </AuthSplitPage>
  );
}
