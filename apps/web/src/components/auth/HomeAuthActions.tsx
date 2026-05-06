"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export function HomeAuthActions() {
  const { isLoading, signOut, user } = useAuth();

  if (isLoading) {
    return <span className="apple-global-actions" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className="apple-global-actions">
        <Link href="/login" className="apple-nav-login">
          <LogIn size={14} />
          登录
        </Link>
      </div>
    );
  }

  return (
    <div className="apple-global-actions">
      <span className="apple-global-user">
        <UserRound size={14} />
        <span>
          {typeof user.user_metadata?.username === "string"
            ? user.user_metadata.username
            : user.email}
        </span>
      </span>
      <button
        className="apple-nav-logout"
        onClick={() => void signOut()}
        title="退出登录"
        type="button"
      >
        <LogOut size={14} />
        <span>退出</span>
      </button>
    </div>
  );
}
