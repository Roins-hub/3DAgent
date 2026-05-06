"use client";

import { AlertCircle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthSplitPage } from "@/components/ui/animated-characters-auth-page";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

function resolveNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
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

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSessionLoading && session) {
      router.replace(nextPath);
    }
  }, [isSessionLoading, nextPath, router, session]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        throw loginError;
      }

      const savedUsername = data.user?.user_metadata?.username;
      if (
        typeof savedUsername === "string" &&
        savedUsername.trim().toLowerCase() !== username.trim().toLowerCase()
      ) {
        await supabase.auth.signOut();
        setError("用户名与邮箱账号不匹配");
        return;
      }

      router.replace(nextPath);
    } catch {
      setError("登录失败，请检查账号信息");
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
          <Label htmlFor="login-username">用户名</Label>
          <Input
            id="login-username"
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
          <Label htmlFor="login-email">邮箱</Label>
          <Input
            id="login-email"
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
          <Label htmlFor="login-password">密码</Label>
          <div className="relative">
            <Input
              id="login-password"
              type="text"
              autoComplete="current-password"
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

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="remember" />
            <Label htmlFor="remember" className="cursor-pointer text-sm font-normal">
              记住我
            </Label>
          </div>
          <Link href={registerHref} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            创建账号
          </Link>
        </div>

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
