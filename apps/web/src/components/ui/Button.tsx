"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "dark";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" &&
          "bg-[#20766f] text-white shadow-sm hover:bg-[#1a625c]",
        variant === "secondary" &&
          "border border-black/10 bg-white/70 text-[#202421] hover:bg-white",
        variant === "ghost" &&
          "text-[#202421] hover:bg-black/[0.04]",
        variant === "dark" &&
          "bg-[#202421] text-[#f7f1e7] hover:bg-[#111310]",
        className,
      )}
      {...props}
    />
  );
}
