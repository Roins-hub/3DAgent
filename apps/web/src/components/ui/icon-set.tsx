"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";
import {
  Apple,
  Dribbble,
  Figma,
  Github,
  Gitlab,
  Linkedin,
  Slack,
  Twitch,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface IconGridItem {
  id: string;
  icon: React.ReactNode;
  name: string;
}

export interface IconGridProps {
  items: IconGridItem[];
  className?: string;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

const IconWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="h-12 w-12 text-foreground/80 transition-transform duration-300 group-hover:scale-110 group-hover:text-foreground">
    {children}
  </div>
);

const avatarIconDefinitions: Array<{ id: string; icon: LucideIcon; name: string }> = [
  { id: "apple", icon: Apple, name: "Apple" },
  { id: "twitter", icon: Twitter, name: "Twitter" },
  { id: "github", icon: Github, name: "GitHub" },
  { id: "figma", icon: Figma, name: "Figma" },
  { id: "slack", icon: Slack, name: "Slack" },
  { id: "gitlab", icon: Gitlab, name: "GitLab" },
  { id: "youtube", icon: Youtube, name: "YouTube" },
  { id: "linkedin", icon: Linkedin, name: "LinkedIn" },
  { id: "dribbble", icon: Dribbble, name: "Dribbble" },
  { id: "twitch", icon: Twitch, name: "Twitch" },
];

export const userAvatarIcons: IconGridItem[] = avatarIconDefinitions.map((item) => {
  const Icon = item.icon;

  return {
    id: item.id,
    icon: (
      <IconWrapper>
        <Icon className="h-full w-full" />
      </IconWrapper>
    ),
    name: item.name,
  };
});

export const userAvatarIconDefinitions = avatarIconDefinitions;

export function useStableRandomAvatar(userKey?: string | null) {
  const [avatarIndex] = React.useState(() => {
    if (!userKey || typeof window === "undefined") return 0;

    const storageKey = `forma-agent-avatar-${userKey}`;
    const savedValue = window.localStorage.getItem(storageKey);
    const savedIndex = savedValue === null ? Number.NaN : Number(savedValue);

    if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < userAvatarIcons.length) {
      return savedIndex;
    }

    const nextIndex = Math.floor(Math.random() * userAvatarIcons.length);
    window.localStorage.setItem(storageKey, String(nextIndex));
    return nextIndex;
  });

  return userAvatarIcons[avatarIndex] ?? userAvatarIcons[0];
}

export function UserAvatarIcon({
  userKey,
  className,
}: {
  userKey?: string | null;
  className?: string;
}) {
  const item = useStableRandomAvatar(userKey);
  const definition =
    userAvatarIconDefinitions.find((avatar) => avatar.id === item.id) ?? userAvatarIconDefinitions[0];
  const Icon = definition.icon;

  return (
    <span
      className={cn(
        "group inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/85 text-[#3f3f46] shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white",
        className,
      )}
      aria-label={definition.name}
      title={definition.name}
    >
      <span className="size-5 transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-full w-full" />
      </span>
    </span>
  );
}

const IconGrid = React.forwardRef<HTMLDivElement, IconGridProps>(
  ({ items, className }, ref) => {
    return (
      <motion.div
        ref={ref}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn(
          "grid grid-cols-3 gap-4 text-center sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
          className,
        )}
      >
        {items.map((item) => (
          <motion.div
            key={item.id}
            variants={itemVariants}
            className="group relative flex flex-col items-center justify-center"
            aria-label={item.name}
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-lg border bg-card p-4 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:bg-card/60 hover:shadow-md">
              {item.icon}
            </div>
          </motion.div>
        ))}
      </motion.div>
    );
  },
);

IconGrid.displayName = "IconGrid";

export { IconGrid };
