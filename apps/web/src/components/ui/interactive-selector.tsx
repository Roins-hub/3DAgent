"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Armchair,
  Brush,
  Factory,
  FileImage,
  Image as ImageIcon,
  LucideIcon,
  Palette,
  PenLine,
  Sparkles,
} from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";

type SelectorIcon =
  | "armchair"
  | "brush"
  | "factory"
  | "file-image"
  | "image"
  | "palette"
  | "pen"
  | "sparkles";

export interface InteractiveSelectorOption {
  title: string;
  description: string;
  image: string;
  href: string;
  icon: SelectorIcon;
}

interface InteractiveSelectorProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  options?: InteractiveSelectorOption[];
}

const iconMap: Record<SelectorIcon, LucideIcon> = {
  armchair: Armchair,
  brush: Brush,
  factory: Factory,
  "file-image": FileImage,
  image: ImageIcon,
  palette: Palette,
  pen: PenLine,
  sparkles: Sparkles,
};

export const modelSelectorOptions: InteractiveSelectorOption[] = [
  {
    title: "机械零件生成",
    description: "机械结构、设备外观与工程零件方案",
    image: "/model-types/industrial.jpg",
    href: "/studio?type=industrial",
    icon: "factory",
  },
  {
    title: "家具模型",
    description: "空间陈设、产品家具与场景道具建模",
    image: "/model-types/furniture.png",
    href: "/studio?type=furniture",
    icon: "armchair",
  },
  {
    title: "文具模型",
    description: "办公、学习用品与精细小物生成",
    image: "/model-types/stationery.png",
    href: "/studio?type=stationery",
    icon: "pen",
  },
  {
    title: "文创设计模型",
    description: "IP 周边、展陈装置与创意产品原型",
    image: "/model-types/cultural.png",
    href: "/studio?type=cultural",
    icon: "sparkles",
  },
];

export function InteractiveSelector({
  eyebrow = "3D Model Generation",
  title = "选择生产模型类型",
  subtitle = "选择一个方向，进入对应的 3D 模型生成工作台。",
  ctaLabel = "开始生成",
  options = modelSelectorOptions,
}: InteractiveSelectorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [animatedOptions, setAnimatedOptions] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    const timers = options.map((_, index) =>
      window.setTimeout(() => {
        setAnimatedOptions((prev) => new Set(prev).add(index));
      }, 160 * index),
    );

    return () => timers.forEach(window.clearTimeout);
  }, [options]);

  return (
    <AuroraBackground className="px-4 pb-16 pt-28">
      <div className="relative z-10 w-full max-w-3xl px-3 text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
          {eyebrow}
        </p>
        <h1 className="animate-in fade-in slide-in-from-top-4 text-[clamp(2.35rem,6vw,4.9rem)] font-extrabold leading-[0.98] tracking-normal text-slate-950 drop-shadow-[0_18px_42px_rgba(15,23,42,0.10)] duration-700">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-slate-700 md:text-xl">
          {subtitle}
        </p>
      </div>

      <div className="relative z-10 mt-16 flex h-auto w-full max-w-[1180px] flex-col items-stretch overflow-hidden md:h-[420px] md:min-w-[620px] md:flex-row">
        {options.map((option, index) => {
          const isActive = activeIndex === index;
          const isVisible = animatedOptions.has(index);
          const Icon = iconMap[option.icon];

          return (
            <div
              key={option.title}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              className="group relative flex min-h-[230px] flex-col justify-end overflow-hidden border-2 bg-[#18181b] text-left outline-none transition-all duration-700 ease-in-out focus-visible:z-20 focus-visible:border-white md:min-h-[100px] md:min-w-[72px]"
              style={{
                backgroundImage: `url('${option.image}')`,
                backgroundPosition: "center",
                backgroundSize: isActive ? "auto 100%" : "auto 122%",
                borderColor: isActive ? "#ffffff" : "#292929",
                boxShadow: isActive
                  ? "0 22px 70px rgba(0,0,0,0.55)"
                  : "0 10px 30px rgba(0,0,0,0.30)",
                cursor: "pointer",
                flex: isActive ? "7 1 0%" : "1 1 0%",
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateX(0)" : "translateX(-60px)",
                zIndex: isActive ? 10 : 1,
                willChange:
                  "flex-grow, box-shadow, background-size, background-position",
              }}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveIndex(index);
                }
              }}
            >
              <span className="absolute inset-0 bg-black/10 transition duration-700 group-hover:bg-black/0" />
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-40 transition-all duration-700"
                style={{
                  boxShadow: isActive
                    ? "inset 0 -150px 150px -82px #000, inset 0 -96px 92px -78px #000"
                    : "inset 0 -120px 0 -120px #000, inset 0 -120px 0 -80px #000",
                }}
              />

              <span className="relative z-10 flex w-full items-end gap-4 px-5 pb-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-[#202020]/90 text-white shadow-[0_1px_8px_rgba(0,0,0,0.28)] backdrop-blur-md transition duration-200 group-hover:scale-105">
                  <Icon size={25} strokeWidth={2.4} />
                </span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span
                    className="block whitespace-nowrap text-xl font-extrabold leading-tight text-white transition-all duration-700"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? "translateX(0)" : "translateX(24px)",
                    }}
                  >
                    {option.title}
                  </span>
                  <span
                    className="block max-w-[460px] text-sm font-medium leading-6 text-white/78 transition-all duration-700 md:text-base"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? "translateX(0)" : "translateX(24px)",
                    }}
                  >
                    {option.description}
                  </span>
                  {isActive ? (
                    <Link
                      className="mt-3 inline-flex w-fit items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-bold text-[#18181b] shadow-lg transition hover:bg-white/88"
                      href={option.href}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {ctaLabel}
                    </Link>
                  ) : null}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </AuroraBackground>
  );
}

export default InteractiveSelector;
