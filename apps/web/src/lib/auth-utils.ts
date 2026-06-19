type SignUpIdentity = {
  id?: string;
};

type SignUpResultLike = {
  user?: {
    identities?: SignUpIdentity[] | null;
  } | null;
};

export function isDuplicateSignUpResult(data: SignUpResultLike | null | undefined) {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

export type AuthErrorContext =
  | "send-login-code"
  | "password-login"
  | "otp-login"
  | "register"
  | "verify-register-code";

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "未知错误";
}

export function formatAuthErrorMessage(error: unknown, context: AuthErrorContext) {
  const message = getAuthErrorMessage(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("authretryablefetcherror") ||
    normalized.includes("network") ||
    normalized.includes("fetcherror")
  ) {
    return "无法连接到 Supabase，请检查网络、代理或稍后重试。";
  }

  if (
    normalized.includes("signup") &&
    (normalized.includes("disable") ||
      normalized.includes("not allowed") ||
      normalized.includes("not enabled"))
  ) {
    return "Supabase 邮箱注册当前未开启，请在 Supabase Auth 设置中启用 Email signup 后再试。";
  }

  if (normalized.includes("rate limit")) {
    return "请求过于频繁，请稍后再试";
  }

  if (context === "send-login-code") {
    if (normalized.includes("email")) {
      return "验证码发送失败，请检查邮箱地址或 Supabase 邮件设置。";
    }
    return "验证码发送失败，请稍后重试";
  }

  if (context === "password-login") {
    if (normalized.includes("invalid email")) {
      return "邮箱格式不正确";
    }
    if (
      normalized.includes("invalid login credentials") ||
      normalized.includes("invalid credentials") ||
      normalized.includes("invalid")
    ) {
      return "邮箱或密码错误，请检查后重试";
    }
    if (normalized.includes("user not found")) {
      return "该邮箱未注册，请先创建账号";
    }
    return "密码登录失败，请检查账号信息";
  }

  if (context === "otp-login" || context === "verify-register-code") {
    if (normalized.includes("expired")) {
      return "验证码已过期，请重新获取";
    }
    if (normalized.includes("invalid") || normalized.includes("token")) {
      return "验证码错误，请检查后重新输入";
    }
    return "验证码验证失败，请重新输入";
  }

  if (context === "register") {
    if (normalized.includes("already") || normalized.includes("registered")) {
      return "该邮箱已经注册，请直接登录或换一个邮箱。";
    }
    if (normalized.includes("email")) {
      return "该邮箱已被注册，或邮箱格式不正确";
    }
    if (normalized.includes("password")) {
      return "密码不符合要求，请使用更安全的密码";
    }
    return "注册失败，请稍后重试";
  }

  return message || "操作失败，请稍后重试";
}
