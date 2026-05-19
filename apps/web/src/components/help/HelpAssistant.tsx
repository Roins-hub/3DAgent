"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { Bot, Loader2, UserRound, X } from "lucide-react";
import { PromptBox, type PromptSubmitPayload } from "@/components/ui/chatgpt-prompt-input";
import { api, type HelpChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type ChatMessage = HelpChatMessage & {
  id: string;
  imageDataUrl?: string | null;
  status?: "sending" | "error";
};

const quickPrompts = [
  "智模AI CAD 怎么生成 STEP？",
  "智模Web CAD 怎么打开和编辑文件？",
  "生成失败或预览失败怎么排查？",
  "CAD 任务历史和下载入口在哪里？",
];

function createMessage(
  role: ChatMessage["role"],
  content: string,
  status?: ChatMessage["status"],
  imageDataUrl?: string | null,
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    imageDataUrl,
    status,
  };
}

export function HelpAssistant() {
  const [input, setInput] = React.useState("");
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    createMessage(
      "assistant",
      "你好，我是智模精工的 AI 帮助助手。你可以问我智模AI CAD 的需求写法、参数化建模、STEP 导出、预览加载、智模Web CAD 复核编辑、任务历史、模型下载和常见报错。",
    ),
  ]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function sendPrompt(payload: PromptSubmitPayload) {
    const prompt = payload.message || (payload.imageDataUrl ? "请帮我看看这张图片。" : "");
    if (!prompt || isSubmitting) {
      return;
    }

    const userMessage = createMessage("user", prompt, undefined, payload.imageDataUrl);
    const pendingMessage = createMessage("assistant", "", "sending");
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, pendingMessage]);
    setInput("");
    setIsSubmitting(true);

    try {
      let streamedMessage = "";
      await api.helpChatStream(
        {
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          selectedTool: payload.selectedTool,
          hasImage: Boolean(payload.imageDataUrl),
          imageDataUrl: payload.imageDataUrl,
        },
        {
          onDelta: (delta) => {
            streamedMessage += delta;
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === pendingMessage.id
                  ? { ...message, content: streamedMessage, status: "sending" }
                  : message,
              ),
            );
          },
        },
      );

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === pendingMessage.id
            ? {
                ...message,
                content: streamedMessage || "没有收到回复，请稍后再试。",
                status: undefined,
              }
            : message,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "帮助助手暂时不可用。";
      setMessages([...nextMessages, createMessage("assistant", message, "error")]);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleQuickPrompt(prompt: string) {
    void sendPrompt({
      message: prompt,
      imageDataUrl: null,
      selectedTool: "searchHelp",
    });
  }

  return (
    <section className="help-assistant" aria-label="智模CAD AI 帮助助手">
      <div className="help-assistant-header">
        <p>AI CAD Support</p>
        <h1>智模CAD 小助手</h1>
      </div>

      <div className="help-quick-prompts" aria-label="快捷问题">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isSubmitting}
            onClick={() => handleQuickPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="help-chat-panel">
        <div className="help-message-list" aria-live="polite">
          {messages.map((message) => {
            const isAssistant = message.role === "assistant";
            return (
              <article
                key={message.id}
                className={cn(
                  "help-message",
                  isAssistant ? "help-message--assistant" : "help-message--user",
                  message.status === "error" && "help-message--error",
                )}
              >
                <span className="help-message-avatar">
                  {isAssistant ? <Bot className="size-4" /> : <UserRound className="size-4" />}
                </span>
                <div>
                  {message.imageDataUrl ? (
                    <button
                      type="button"
                      className="help-message-image-button"
                      onClick={() => setPreviewImage(message.imageDataUrl ?? null)}
                      aria-label="查看上传图片"
                    >
                      <img src={message.imageDataUrl} alt="用户上传的图片" className="help-message-image" />
                    </button>
                  ) : null}
                  {message.content ? <p>{message.content}</p> : null}
                  {message.status === "sending" ? (
                    <small>
                      <Loader2 className="size-3 animate-spin" />
                      正在回复
                    </small>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <PromptBox
          value={input}
          onValueChange={setInput}
          onSubmit={sendPrompt}
          isSubmitting={isSubmitting}
          placeholder="询问智模AI CAD、Web CAD 编辑、STEP 下载、预览加载、账号登录或常见错误..."
          className="help-prompt-box"
        />
      </div>

      {previewImage ? (
        <div className="help-image-lightbox" role="dialog" aria-modal="true" aria-label="图片预览">
          <button
            type="button"
            className="help-image-lightbox-backdrop"
            onClick={() => setPreviewImage(null)}
            aria-label="关闭图片预览"
          />
          <div className="help-image-lightbox-content">
            <button
              type="button"
              className="help-image-lightbox-close"
              onClick={() => setPreviewImage(null)}
              aria-label="关闭图片预览"
            >
              <X className="size-5" />
            </button>
            <img src={previewImage} alt="上传图片大图预览" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
