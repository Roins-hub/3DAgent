import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase 环境变量未配置。");
  }

  browserClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return browserClient;
}

export async function getAccessToken() {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();

  return session?.access_token ?? null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function clearLocalSupabaseSession() {
  if (typeof window === "undefined") {
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storageKeys = new Set<string>();

  if (supabaseUrl) {
    try {
      const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
      storageKeys.add(`sb-${projectRef}-auth-token`);
      storageKeys.add(`sb-${projectRef}-auth-token-code-verifier`);
    } catch {
      // Ignore malformed local config and fall back to the prefix cleanup below.
    }
  }

  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("sb-") && key.includes("-auth-token")) {
      storageKeys.add(key);
    }
  }

  for (const key of storageKeys) {
    window.localStorage.removeItem(key);
  }
}
