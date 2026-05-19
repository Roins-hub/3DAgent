"use client";

import {
  ArrowUpIcon,
  CircleUserRound,
  Code2,
  FileUp,
  ImageIcon,
  Layers,
  MonitorIcon,
  Palette,
  Paperclip,
  Rocket,
} from "lucide-react";
import React, { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

export type RuixenQuickAction = {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  prompt?: string;
  onClick?: () => void;
};

type RuixenMoonChatProps = {
  title?: string;
  subtitle?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  quickActions?: RuixenQuickAction[];
  statusChips?: string[];
  isSubmitting?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  disabled?: boolean;
  footerNote?: string;
  className?: string;
  children?: React.ReactNode;
};

const defaultQuickActions: RuixenQuickAction[] = [
  { icon: Code2, label: "Generate Code" },
  { icon: Rocket, label: "Launch App" },
  { icon: Layers, label: "UI Components" },
  { icon: Palette, label: "Theme Ideas" },
  { icon: CircleUserRound, label: "User Dashboard" },
  { icon: MonitorIcon, label: "Landing Page" },
  { icon: FileUp, label: "Upload Docs" },
  { icon: ImageIcon, label: "Image Assets" },
];

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity),
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

export default function RuixenMoonChat({
  title = "Ruixen AI",
  subtitle = "Build something amazing — just start typing below.",
  value,
  onChange,
  onSubmit,
  placeholder = "Type your request...",
  quickActions = defaultQuickActions,
  statusChips = [],
  isSubmitting = false,
  submitLabel = "Send",
  submittingLabel = "Working",
  disabled = false,
  footerNote,
  className,
  children,
}: RuixenMoonChatProps) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 92,
    maxHeight: 190,
  });
  const canSubmit = Boolean(value.trim()) && !disabled && !isSubmitting;

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, value]);

  return (
    <div className={cn("ruixen-moon-chat", className)}>
      <div className="ruixen-starfield" />
      <div className="ruixen-orb ruixen-orb-left" />
      <div className="ruixen-orb ruixen-orb-right" />
      <div className="ruixen-moon-arc" />
      <div className="ruixen-moon-arc ruixen-moon-arc-inner" />

      <div className="ruixen-chat-content">
        <div className="ruixen-chat-title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="ruixen-chat-console">
          <div className="ruixen-input-shell">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                adjustHeight();
              }}
              placeholder={placeholder}
              className={cn(
                "min-h-[92px] resize-none border-none bg-transparent px-5 py-4 text-base text-white",
                "placeholder:text-white/42 focus-visible:ring-0 focus-visible:ring-offset-0",
              )}
              style={{ overflow: "hidden" }}
            />

            <div className="ruixen-input-footer">
              <div className="ruixen-input-tools">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/82 hover:bg-white/10 hover:text-white"
                  type="button"
                  aria-label="Attach file"
                >
                  <Paperclip />
                </Button>
                {footerNote ? <span>{footerNote}</span> : null}
              </div>

              <Button
                className="ruixen-send-button"
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                aria-label={submitLabel}
              >
                <ArrowUpIcon />
                <span className="sr-only">{isSubmitting ? submittingLabel : submitLabel}</span>
              </Button>
            </div>
          </div>

          <div className="ruixen-quick-actions" aria-label="Quick actions">
            {quickActions.map(({ icon: Icon = Code2, label, onClick }) => (
              <Button
                key={label}
                variant="outline"
                className="ruixen-action-pill"
                type="button"
                onClick={onClick}
              >
                <Icon />
                <span>{label}</span>
              </Button>
            ))}
          </div>

          {statusChips.length > 0 ? (
            <div className="ruixen-status-chips" aria-label="Capabilities">
              {statusChips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </div>
  );
}
