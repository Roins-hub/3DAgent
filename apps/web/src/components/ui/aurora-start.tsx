import Link from "next/link";
import {
  Boxes,
  ChevronDown,
  DraftingCompass,
  Image as ImageIcon,
  WandSparkles,
} from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Typewriter } from "@/components/ui/typewriter";

const heroActions = [
  {
    href: "/model",
    label: "三维模型生成",
    description: "家具、文具、工业、文创 3D 资产生成",
    Icon: Boxes,
  },
  {
    href: "/industrial/cadam",
    label: "智模AI CAD",
    description: "一句工程描述生成参数化 STEP",
    Icon: WandSparkles,
  },
  {
    href: "/industrial/chili3d",
    label: "智模Web CAD",
    description: "浏览器端草图、实体编辑与导入导出",
    Icon: DraftingCompass,
  },
];

export function AuroraStart() {
  return (
    <AuroraBackground className="aurora-start">
      <div className="aurora-start-content">
        <h1>智模精工</h1>
        <p className="aurora-subtitle aurora-typewriter-line">
          <Typewriter
            text={[
              "一句话生成可交付 CAD，也能在浏览器里继续建模与复核。",
              "一句话生成三维模型，快速预览并下载工业资产。",
              "一句话生成图片方案，用参考图与比例约束完成视觉验证。",
            ]}
            speed={64}
            waitTime={1600}
            deleteSpeed={34}
            cursorChar="_"
            cursorClassName="aurora-typewriter-cursor"
            startFromFullText
          />
        </p>
        <div className="aurora-actions">
          <div className="aurora-action-menu">
            <Link href="/model" className="aurora-primary aurora-primary-menu-trigger" aria-haspopup="menu">
              <Boxes size={18} />
              打开三维模型生成
              <ChevronDown size={16} />
            </Link>
            <div className="aurora-action-menu-panel" role="menu" aria-label="创作入口">
              {heroActions.map(({ Icon, ...action }) => (
                <Link href={action.href} className="aurora-action-menu-item" key={action.href} role="menuitem">
                  <span>
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <Link href="/image" className="aurora-secondary">
            <ImageIcon size={18} />
            打开图片生成
          </Link>
        </div>
      </div>
    </AuroraBackground>
  );
}
