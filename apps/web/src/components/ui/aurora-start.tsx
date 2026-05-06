"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";

export function AuroraStart() {
  return (
    <AuroraBackground className="aurora-start">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.18,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="aurora-start-content"
      >
        <p className="aurora-kicker">
          <Sparkles size={16} />
          智模工坊
        </p>
        <h1>工业级三维智能生成平台</h1>
        <p className="aurora-subtitle">
          以自然语言驱动三维资产、工业图像、任务编排与交付归档，让创意输入转化为可预览、可追踪、可下载的工程化生成结果。
        </p>
        <div className="aurora-actions">
          <Link href="/model" className="aurora-primary">
            打开三维模型生成
          </Link>
          <Link href="/image" className="aurora-secondary">
            <ImageIcon size={18} />
            打开图像方案生成
          </Link>
        </div>
      </motion.div>
    </AuroraBackground>
  );
}
