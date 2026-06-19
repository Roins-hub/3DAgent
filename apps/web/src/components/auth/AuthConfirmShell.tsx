"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

const SUPPORTED_OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function normalizeOtpType(value: string | null): EmailOtpType | null {
  if (!value || !SUPPORTED_OTP_TYPES.has(value)) {
    return null;
  }
  return value as EmailOtpType;
}

function resolveRedirectPath(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  if (typeof window !== "undefined") {
    try {
      const url = new URL(value);
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export function AuthConfirmShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseClient();
  const [error, setError] = useState<string | null>(null);

  const tokenHash = searchParams.get("token_hash");
  const otpType = useMemo(() => normalizeOtpType(searchParams.get("type")), [searchParams]);
  const fallbackPath = otpType === "recovery" ? "/reset-password" : "/";
  const nextPath = resolveRedirectPath(searchParams.get("next"), fallbackPath);

  useEffect(() => {
    let isMounted = true;

    async function confirmAuthToken() {
      if (!tokenHash || !otpType) {
        setError("验证链接无效，请重新获取邮件。");
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });

      if (!isMounted) {
        return;
      }

      if (verifyError) {
        setError("验证链接已失效或已被使用，请重新获取邮件。");
        return;
      }

      router.replace(nextPath);
    }

    void confirmAuthToken();

    return () => {
      isMounted = false;
    };
  }, [nextPath, otpType, router, supabase, tokenHash]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-[460px] rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
        <Link href="/" className="mx-auto mb-6 flex w-fit items-center gap-3 text-lg font-semibold">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
            <Sparkles className="size-5" />
          </span>
          <span>智模精工</span>
        </Link>

        {error ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-4 text-left text-sm text-destructive">
            <AlertCircle className="mt-0.5 shrink-0" size={16} />
            <span>{error}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin" />
            <div>
              <h1 className="text-2xl font-bold">正在验证邮件链接</h1>
              <p className="mt-2 text-sm text-muted-foreground">验证完成后会自动进入下一步。</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
