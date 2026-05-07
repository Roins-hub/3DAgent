"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
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
          智模精工
        </p>
        <h1>智模精工</h1>
        <p className="aurora-subtitle">
          精密机械元件AI工业设计先锋者
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
