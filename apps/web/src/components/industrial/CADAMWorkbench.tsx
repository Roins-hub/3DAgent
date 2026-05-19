"use client";

import {
  CircleUserRound,
  Code2,
  FileUp,
  ImageIcon,
  Layers,
  MonitorIcon,
  Palette,
  Rocket,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import RuixenMoonChat, { type RuixenQuickAction } from "@/components/ui/ruixen-moon-chat";
import { buildCadamLoadingHref } from "@/lib/cadam-routing";
import { createClientRequestId } from "@/lib/api";

const defaultPrompt =
  "创建一个圆柱轴承座，底部带安装法兰，中心孔直径 30mm，用于 6206 轴承安装。整体高度 80mm，法兰长 120mm，宽 60mm，法兰厚 10mm。法兰上有 4 个安装孔，孔径 9mm，孔中心矩形分布，材料为铝合金。";

const quickActions = [
  {
    icon: Code2,
    label: "阶梯轴",
    prompt:
      "生成一个阶梯轴，总长 160mm，三段直径分别为 20mm、32mm、24mm，中间段长度 60mm，两端倒角 1.5mm，中间段顶部开一个 6mm 宽的键槽。",
  },
  {
    icon: Rocket,
    label: "法兰盘",
    prompt:
      "生成一个直径 90mm 的圆形法兰盘，厚度 10mm，中心 30mm 通孔，在 70mm 分布圆上均布 6 个 8mm 安装孔，外圆上下边倒角 1mm。",
  },
  {
    icon: Layers,
    label: "支架结构",
    prompt:
      "生成一个铝合金电机安装支架，底座长 120mm，宽 80mm，厚度 8mm，四角有 6mm 安装孔，立板高度 70mm，立板中间有 30mm 轴孔，两侧加加强筋。",
  },
  {
    icon: Palette,
    label: "外壳盒体",
    prompt:
      "做一个传感器外壳，长 90mm，宽 54mm，高 28mm，壁厚 3mm，开口朝上，内部四角有 M3 安装柱，外侧四角圆角 4mm。",
  },
  { icon: CircleUserRound, label: "轴承座", prompt: defaultPrompt },
  {
    icon: MonitorIcon,
    label: "夹具工装",
    prompt:
      "生成一个轻量化夹板，长 140mm，宽 50mm，厚度 8mm，两端各有 10mm 安装孔，中间有三个椭圆减重孔，所有外边倒圆 3mm。",
  },
  { icon: FileUp, label: "导入需求", prompt: defaultPrompt },
  {
    icon: ImageIcon,
    label: "参考图片",
    prompt:
      "根据参考图片描述生成一个机械零件，保留主要轮廓、安装孔、厚度约束和倒角，输出真实 STEP 文件。",
  },
];

const specs = ["build123d", "STEP", "参数化", "可预览"];

export function CADAMWorkbench() {
  const router = useRouter();
  const [message, setMessage] = useState(defaultPrompt);
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    const requirement = message.trim();
    if (!requirement) {
      setError("请先输入生成需求。");
      return;
    }

    setError(null);
    router.push(buildCadamLoadingHref(requirement, createClientRequestId()));
  };

  const moonActions: RuixenQuickAction[] = quickActions.map(({ icon, label, prompt }) => ({
    icon,
    label,
    onClick: () => setMessage(prompt),
  }));

  return (
    <section className="cadam-moon-shell" aria-label="智模AI CAD">
      <RuixenMoonChat
        title="智模CAD"
        subtitle="一句工程描述，生成可交付 CAD。"
        value={message}
        onChange={setMessage}
        onSubmit={generate}
        placeholder="描述零件、尺寸、孔位、倒角、材料和制造约束..."
        quickActions={moonActions}
        statusChips={specs}
        isSubmitting={false}
        submitLabel="生成"
        submittingLabel="生成中"
        footerNote="支持机械零件、夹具、外壳、法兰与轴类结构"
      >
        {error ? <div className="cadam-moon-error">{error}</div> : null}
      </RuixenMoonChat>
    </section>
  );
}
