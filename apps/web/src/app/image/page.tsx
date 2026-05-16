import { Header } from "@/components/ui/header-2";
import {
  InteractiveSelector,
  type InteractiveSelectorOption,
} from "@/components/ui/interactive-selector";

const imageTypes: InteractiveSelectorOption[] = [
  {
    title: "机械零件图",
    description: "机械结构、精密零件与装配效果图",
    href: "/image/workspace?type=industrial",
    image: "/gateway-types/image-mechanical-parts.jpeg",
    icon: "factory",
  },
  {
    title: "白色家电图",
    description: "洗衣机、冰箱、厨电等白色家电产品图",
    href: "/image/workspace?type=appliance",
    image: "/gateway-types/image-white-appliances.jpg",
    icon: "washing-machine",
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
