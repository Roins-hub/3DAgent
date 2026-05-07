import { Header } from "@/components/ui/header-2";
import {
  InteractiveSelector,
  type InteractiveSelectorOption,
} from "@/components/ui/interactive-selector";

const imageTypes: InteractiveSelectorOption[] = [
  {
    title: "家居设计图",
    description: "室内空间、软装搭配与家居场景方案",
    href: "/image/workspace?type=home",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
    icon: "armchair",
  },
  {
    title: "文具设计图",
    description: "办公用品、学习工具与文具产品视觉",
    href: "/image/workspace?type=stationery",
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80",
    icon: "pen",
  },
  {
    title: "工业模型图",
    description: "工业产品、设备外观与机械结构概念图",
    href: "/image/workspace?type=industrial",
    image:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
    icon: "factory",
  },
  {
    title: "文创海报",
    description: "品牌活动、IP 宣发与文化创意海报",
    href: "/image/workspace?type=poster",
    image:
      "https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=900&q=80",
    icon: "file-image",
  },
  {
    title: "艺术绘画",
    description: "插画风格、艺术实验与视觉表达探索",
    href: "/image/workspace?type=painting",
    image:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
    icon: "palette",
  },
];

export default function ImageGatewayPage() {
  return (
    <main className="model-gateway image-gateway">
      <Header />
      <InteractiveSelector
        eyebrow="Image Generation"
        title="选择图片生成类型"
        subtitle="选择一个方向，进入对应的图片生成工作台。"
        ctaLabel="开始创作"
        options={imageTypes}
      />
    </main>
  );
}
