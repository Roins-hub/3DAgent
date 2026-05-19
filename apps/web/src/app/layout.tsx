import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { DesktopNavigationBar } from "@/components/desktop/DesktopNavigationBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "智模精工 | 智模Web CAD 与智模AI CAD",
  description: "面向工业设计需求的 Web CAD、AI CAD 与工程资产生成工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <DesktopNavigationBar />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
