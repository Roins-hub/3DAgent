import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";

export function AuroraStart() {
  return (
    <AuroraBackground className="aurora-start">
      <div className="aurora-start-content">
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
      </div>
    </AuroraBackground>
  );
}
