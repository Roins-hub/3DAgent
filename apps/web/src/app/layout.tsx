import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forma Agent | 3D 模型 AI 生成平台",
  description: "聊天式 3D 资产生成平台 MVP。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
