"use client";

import React from "react";
import { Atom, Box, ChevronDown, Cuboid, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, buttonVariants } from "@/components/ui/Button";
import { UserAvatarIcon } from "@/components/ui/icon-set";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import { useScroll } from "@/components/ui/use-scroll";
import { cn } from "@/lib/utils";

const links = [
  {
    label: "首页",
    href: "/",
  },
  {
    label: "图片生成",
    href: "/image",
  },
  {
    label: "流程",
    href: "/#workflow",
  },
  {
    label: "帮助",
    href: "/help",
  },
  {
    label: "联系我们",
    href: "/contact",
  },
];

const industrialLinks = [
  {
    label: "Chili3D 网页 CAD",
    description: "浏览器端 CAD 建模页面",
    href: "/industrial/chili3d",
    Icon: Cuboid,
  },
  {
    label: "CADAM AI 生成 CAD",
    description: "文本生成参数化 CAD",
    href: "/industrial/cadam",
    Icon: WandSparkles,
  },
  {
    label: "3D模型生成",
    description: "先选择家具、文具、工业或文创方向",
    href: "/model",
    Icon: Box,
  },
];

function getUserDisplayName(session: ReturnType<typeof useAuth>["session"]) {
  const metadataName = session?.user.user_metadata?.username;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  const emailName = session?.user.email?.split("@")[0];

  if (emailName) {
    return emailName;
  }

  return "用户";
}

export function Header() {
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);
  const { isLoading, session, signOut } = useAuth();
  const isSignedIn = Boolean(session);
  const displayName = getUserDisplayName(session);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed left-1/2 top-0 z-50 w-full max-w-7xl -translate-x-1/2 border-b border-transparent bg-transparent md:transition-all md:ease-out",
        {
          "border-border bg-background/95 shadow supports-[backdrop-filter]:bg-background/60 backdrop-blur-lg md:top-4 md:max-w-6xl md:rounded-md md:border":
            scrolled && !open,
          "bg-background/95 shadow": open,
        },
      )}
    >
      <nav
        className={cn(
          "flex h-14 w-full items-center justify-between px-4 md:grid md:h-12 md:grid-cols-[auto_1fr_auto] md:transition-all md:ease-out",
          {
            "md:px-2": scrolled,
          },
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[#252b3a] text-[#c8f5ff] shadow-sm ring-1 ring-slate-900/10"
            aria-hidden="true"
          >
            <Atom className="size-6" strokeWidth={1.85} />
          </span>
          <span>智模精工</span>
        </Link>

        <div className="hidden items-center justify-center gap-1 md:flex">
          <div className="industrial-menu group relative">
            <Link
              className={buttonVariants({
                variant: "ghost",
                className: "gap-1.5",
              })}
              href="/model"
              aria-haspopup="menu"
            >
              工业模型
              <ChevronDown
                className="size-3.5 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180"
                aria-hidden="true"
              />
            </Link>
            <div
              className="industrial-menu-panel invisible absolute left-1/2 top-full z-50 mt-3 w-[22rem] max-w-[calc(100vw-2rem)] opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              role="menu"
              aria-label="工业模型入口"
            >
              {industrialLinks.map(({ Icon, ...link }) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="industrial-menu-item flex items-start gap-2.5 text-sm text-[#1d1d1f] focus:outline-none"
                  role="menuitem"
                >
                  <span className="industrial-menu-icon mt-0.5 flex size-8 shrink-0 items-center justify-center text-[#0066cc]">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-5">{link.label}</span>
                    <span className="mt-0.5 block text-xs leading-4 text-[#6e6e73]">
                      {link.description}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
          {links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              className={buttonVariants({ variant: "ghost" })}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="hidden items-center justify-end gap-2 md:flex">
          {!isLoading && isSignedIn && session ? (
            <div className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 py-1 pl-1 pr-1 shadow-sm backdrop-blur-md">
              <UserAvatarIcon key={session.user.id} userKey={session.user.id} className="size-8" />
              <span className="max-w-[92px] truncate px-1 text-sm font-medium text-[#1d1d1f]">
                {displayName}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => void signOut()}
              >
                退出
              </Button>
            </div>
          ) : (
            <Button asChild variant="outline">
              <Link href="/login">登录</Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/model">开始创作</Link>
          </Button>
        </div>

        <Button
          size="icon"
          variant="outline"
          onClick={() => setOpen(!open)}
          className="md:hidden"
          aria-label={open ? "关闭导航" : "打开导航"}
        >
          <MenuToggleIcon open={open} className="size-5" duration={300} />
        </Button>
      </nav>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 top-14 z-50 flex-col overflow-hidden border-y bg-background/95 md:hidden",
          open ? "flex" : "hidden",
        )}
      >
        <div
          data-slot={open ? "open" : "closed"}
          className={cn(
            "data-[slot=open]:animate-in data-[slot=open]:zoom-in-95 data-[slot=closed]:animate-out data-[slot=closed]:zoom-out-95 ease-out",
            "flex h-full w-full flex-col justify-between gap-y-2 p-4",
          )}
        >
          <div className="grid gap-y-2">
            <div className="grid gap-y-1 rounded-2xl border border-black/10 bg-white/60 p-2">
              <p className="px-2 pb-1 text-xs font-semibold text-[#6e6e73]">工业模型</p>
              {industrialLinks.map(({ Icon, ...link }) => (
                <Link
                  key={link.href}
                  className={buttonVariants({
                    variant: "ghost",
                    className: "h-auto justify-start gap-3 px-2 py-2.5",
                  })}
                  href={link.href}
                  onClick={() => setOpen(false)}
                >
                  <Icon className="size-4 text-[#0066cc]" />
                  <span className="grid text-left">
                    <span>{link.label}</span>
                    <span className="text-xs font-normal text-[#6e6e73]">
                      {link.description}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            {links.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                className={buttonVariants({
                  variant: "ghost",
                  className: "justify-start",
                })}
                href={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {!isLoading && isSignedIn && session ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-white/70 p-3 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <UserAvatarIcon key={session.user.id} userKey={session.user.id} />
                  <span className="min-w-0 truncate text-sm font-semibold text-[#1d1d1f]">
                    {displayName}
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  退出
                </Button>
              </div>
            ) : (
              <Button asChild variant="outline" className="w-full">
                <Link href="/login" onClick={() => setOpen(false)}>
                  登录
                </Link>
              </Button>
            )}
            <Button asChild className="w-full">
              <Link href="/model" onClick={() => setOpen(false)}>
                开始创作
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
