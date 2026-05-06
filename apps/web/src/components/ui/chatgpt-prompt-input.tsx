"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import {
  Globe,
  Lightbulb,
  Mic,
  Paintbrush,
  Pencil,
  Plus,
  Send,
  SlidersHorizontal,
  Square,
  Telescope,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PromptTool = {
  id: string;
  name: string;
  shortName: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  extra?: string;
};

const toolsList: PromptTool[] = [
  { id: "createImage", name: "创建图片", shortName: "图片", icon: Paintbrush },
  { id: "searchHelp", name: "搜索帮助文档", shortName: "搜索", icon: Globe },
  { id: "writePrompt", name: "优化提示词", shortName: "提示词", icon: Pencil },
  { id: "deepResearch", name: "深入排查问题", shortName: "排查", icon: Telescope },
  { id: "thinkLonger", name: "思考更完整", shortName: "思考", icon: Lightbulb },
];

export type PromptSubmitPayload = {
  message: string;
  imageDataUrl: string | null;
  selectedTool: string | null;
};

type PromptBoxProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "onSubmit"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (payload: PromptSubmitPayload) => void;
  isSubmitting?: boolean;
};

type SpeechSessionState = "idle" | "starting" | "listening" | "error";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { showArrow?: boolean }
>(({ className, sideOffset = 4, showArrow = false, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "relative z-50 max-w-[280px] rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
      {showArrow ? <TooltipPrimitive.Arrow className="-my-px fill-popover" /> : null}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-64 rounded-xl bg-popover p-2 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-[90vw] -translate-x-1/2 -translate-y-1/2 gap-4 border-none bg-transparent p-0 shadow-none animate-in fade-in-0 zoom-in-95 md:max-w-[800px]",
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">图片预览</DialogPrimitive.Title>
      <div className="relative overflow-hidden rounded-[28px] bg-card p-1 shadow-2xl">
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-full bg-background/70 p-1 transition hover:bg-accent">
          <X className="size-5 text-muted-foreground" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      </div>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function mergeSpeechTranscript(baseValue: string, transcript: string) {
  const trimmedBase = baseValue.trimEnd();
  const trimmedTranscript = transcript.trim();

  if (!trimmedTranscript) {
    return trimmedBase;
  }

  return `${trimmedBase}${trimmedBase ? " " : ""}${trimmedTranscript}`;
}

function formatSpeechElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export const PromptBox = React.forwardRef<HTMLTextAreaElement, PromptBoxProps>(
  (
    {
      className,
      value,
      onValueChange,
      onSubmit,
      placeholder = "Message...",
      isSubmitting = false,
      disabled,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);
    const [selectedTool, setSelectedTool] = React.useState<string | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isImageDialogOpen, setIsImageDialogOpen] = React.useState(false);
    const [speechSessionState, setSpeechSessionState] =
      React.useState<SpeechSessionState>("idle");
    const [speechElapsed, setSpeechElapsed] = React.useState(0);
    const [speechStartedAt, setSpeechStartedAt] = React.useState<number | null>(null);
    const [speechError, setSpeechError] = React.useState<string | null>(null);
    const speechBaseValueRef = React.useRef("");
    const {
      transcript,
      interimTranscript,
      finalTranscript,
      listening,
      resetTranscript,
      browserSupportsSpeechRecognition,
      isMicrophoneAvailable,
    } = useSpeechRecognition();

    React.useImperativeHandle(ref, () => internalTextareaRef.current as HTMLTextAreaElement, []);

    React.useLayoutEffect(() => {
      const textarea = internalTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }, [value]);

    React.useEffect(() => {
      if (speechSessionState === "idle" || !transcript) {
        return;
      }

      onValueChange(mergeSpeechTranscript(speechBaseValueRef.current, transcript));
    }, [onValueChange, speechSessionState, transcript]);

    React.useEffect(() => {
      if (listening && speechSessionState !== "listening") {
        setSpeechSessionState("listening");
      }
    }, [listening, speechSessionState]);

    React.useEffect(() => {
      if (speechStartedAt === null) {
        return;
      }

      const updateElapsed = () => {
        setSpeechElapsed(Math.max(0, Math.floor((Date.now() - speechStartedAt) / 1000)));
      };
      updateElapsed();
      const interval = window.setInterval(updateElapsed, 500);

      return () => window.clearInterval(interval);
    }, [speechStartedAt]);

    React.useEffect(() => {
      const recognition = SpeechRecognition.getRecognition();
      if (!recognition || !("addEventListener" in recognition)) {
        return;
      }

      const handleRecognitionError = (event: Event) => {
        const errorCode = String((event as Event & { error?: unknown }).error ?? "");
        if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
          setSpeechError("麦克风权限不可用");
          setSpeechSessionState("error");
          setSpeechStartedAt(null);
          return;
        }

        if (errorCode === "no-speech") {
          setSpeechError("没有检测到声音");
          return;
        }

        setSpeechError("语音识别暂时不可用");
        setSpeechSessionState("error");
      };

      recognition.addEventListener("error", handleRecognitionError);
      return () => recognition.removeEventListener("error", handleRecognitionError);
    }, []);

    const activeTool = selectedTool ? toolsList.find((tool) => tool.id === selectedTool) : null;
    const ActiveToolIcon = activeTool?.icon;
    const hasValue = value.trim().length > 0 || Boolean(imagePreview);
    const isDisabled = disabled || isSubmitting;
    const isSpeechActive =
      speechSessionState === "starting" || speechSessionState === "listening";
    const speechWaveSeed =
      (interimTranscript.length + finalTranscript.length + speechElapsed) % 7;

    function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!hasValue || isDisabled) {
        return;
      }

      onSubmit({
        message: value.trim(),
        imageDataUrl: imagePreview,
        selectedTool,
      });
      setImagePreview(null);
    }

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      if (file?.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(file);
      }
      event.target.value = "";
    }

    function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    }

    async function stopSpeechInput() {
      setSpeechSessionState("idle");
      setSpeechStartedAt(null);
      setSpeechElapsed(0);
      try {
        await SpeechRecognition.abortListening();
      } catch {
        setSpeechError("语音输入停止失败");
        setSpeechSessionState("error");
      }
    }

    async function toggleSpeechInput() {
      if (!browserSupportsSpeechRecognition || !isMicrophoneAvailable || isDisabled) {
        setSpeechError(
          !browserSupportsSpeechRecognition
            ? "当前浏览器不支持语音识别"
            : "麦克风权限不可用",
        );
        setSpeechSessionState("error");
        return;
      }

      if (isSpeechActive || listening) {
        await stopSpeechInput();
        return;
      }

      speechBaseValueRef.current = value.trimEnd();
      setSpeechError(null);
      setSpeechSessionState("starting");
      setSpeechElapsed(0);
      setSpeechStartedAt(Date.now());
      resetTranscript();
      try {
        await SpeechRecognition.startListening({
          continuous: true,
          interimResults: true,
          language: "zh-CN",
        });
        setSpeechSessionState("listening");
      } catch {
        setSpeechError("语音识别启动失败");
        setSpeechSessionState("error");
        setSpeechStartedAt(null);
      }
    }

    return (
      <form
        onSubmit={submitPrompt}
        className={cn(
          "flex w-full cursor-text flex-col rounded-[28px] border bg-white p-2 shadow-sm transition-colors",
          className,
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
        />

        {imagePreview ? (
          <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
            <div className="relative mb-1 w-fit rounded-2xl px-1 pt-1">
              <button type="button" className="transition-transform" onClick={() => setIsImageDialogOpen(true)}>
                <img src={imagePreview} alt="上传图片预览" className="size-14 rounded-2xl object-cover" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setImagePreview(null);
                }}
                className="absolute right-2 top-2 z-10 flex size-4 items-center justify-center rounded-full bg-white/70 text-black transition-colors hover:bg-accent"
                aria-label="移除图片"
              >
                <X className="size-3" />
              </button>
            </div>
            <DialogContent>
              <img src={imagePreview} alt="完整图片预览" className="max-h-[95vh] w-full rounded-[24px] object-contain" />
            </DialogContent>
          </Dialog>
        ) : null}

        <textarea
          ref={internalTextareaRef}
          rows={1}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          className="custom-scrollbar min-h-12 w-full resize-none border-0 bg-transparent p-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
          {...props}
        />

        {isSpeechActive ? (
          <div className="prompt-voice-status" role="status" aria-live="polite">
            <div className="prompt-voice-track" aria-hidden="true">
              {Array.from({ length: 34 }).map((_, index) => (
                <i
                  key={index}
                  style={{
                    animationDelay: `${((index + speechWaveSeed) % 8) * 60}ms`,
                  }}
                />
              ))}
            </div>
            <span>{formatSpeechElapsed(speechElapsed)}</span>
            <button
              type="button"
              onClick={() => void stopSpeechInput()}
              aria-label="停止语音输入"
              title="停止"
            >
              <Square className="size-3 fill-current" />
            </button>
          </div>
        ) : speechSessionState === "error" && speechError ? (
          <div className="prompt-voice-error" role="status">
            {speechError}
          </div>
        ) : null}

        <div className="mt-0.5 p-1 pt-0">
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled}
                    className="flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none disabled:opacity-50"
                  >
                    <Plus className="size-6" />
                    <span className="sr-only">上传图片</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" showArrow>
                  <p>上传图片</p>
                </TooltipContent>
              </Tooltip>

              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isDisabled}
                        className="flex h-8 items-center gap-2 rounded-full p-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none disabled:opacity-50"
                      >
                        <SlidersHorizontal className="size-4" />
                        {!selectedTool ? "Tools" : null}
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>选择工具</p>
                  </TooltipContent>
                </Tooltip>
                <PopoverContent side="top" align="start">
                  <div className="flex flex-col gap-1">
                    {toolsList.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => {
                          setSelectedTool(tool.id);
                          setIsPopoverOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-accent"
                      >
                        <tool.icon className="size-4" />
                        <span>{tool.name}</span>
                        {tool.extra ? (
                          <span className="ml-auto text-xs text-muted-foreground">{tool.extra}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {activeTool ? (
                <>
                  <div className="h-4 w-px bg-border" />
                  <button
                    type="button"
                    onClick={() => setSelectedTool(null)}
                    disabled={isDisabled}
                    className="flex h-8 cursor-pointer flex-row items-center justify-center gap-2 rounded-full px-2 text-sm text-[#2294ff] transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {ActiveToolIcon ? <ActiveToolIcon className="size-4" /> : null}
                    {activeTool.shortName}
                    <X className="size-4" />
                  </button>
                </>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void toggleSpeechInput()}
                      disabled={isDisabled}
                      aria-pressed={isSpeechActive}
                      aria-label={isSpeechActive ? "停止语音输入" : "开始语音输入"}
                      className="flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-[#2294ff]"
                    >
                      <Mic className="size-5" />
                      <span className="sr-only">{isSpeechActive ? "停止语音输入" : "开始语音输入"}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>
                      {!browserSupportsSpeechRecognition
                        ? "当前浏览器不支持语音输入"
                        : isSpeechActive
                          ? "停止语音输入"
                          : "语音输入"}
                    </p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="submit"
                      disabled={!hasValue || isDisabled}
                      className="grid size-8 place-items-center rounded-full bg-black text-sm font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:bg-black/40"
                    >
                      <Send className="size-[17px] translate-x-[0.1px] translate-y-[0.1px]" strokeWidth={2.1} />
                      <span className="sr-only">发送消息</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>发送</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>
        </div>
      </form>
    );
  },
);

PromptBox.displayName = "PromptBox";
