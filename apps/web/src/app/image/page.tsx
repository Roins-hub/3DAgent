import { Header } from "@/components/ui/header-2";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { CircularRevealHeading } from "@/components/ui/circular-reveal-heading";

const imageTypes = [
  {
    href: "/image/workspace?type=home",
    text: "家居设计图",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
  },
  {
    href: "/image/workspace?type=stationery",
    text: "文具设计图",
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80",
  },
  {
    href: "/image/workspace?type=industrial",
    text: "工业模型图",
    image:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
  },
  {
    href: "/image/workspace?type=poster",
    text: "文创海报",
    image:
      "https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=900&q=80",
  },
  {
    href: "/image/workspace?type=painting",
    text: "艺术绘画",
    image:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
  },
];

export default function ImageGatewayPage() {
  return (
    <main className="model-gateway image-gateway">
      <Header />
      <AuroraBackground className="model-gateway-hero" aria-labelledby="image-gateway-title">
        <div className="model-gateway-copy">
          <p>图片生成大厅</p>
          <h1 id="image-gateway-title">选择图片生成类型</h1>
        </div>

        <div className="model-gateway-stage">
          <CircularRevealHeading
            items={imageTypes}
            centerText={
              <div className="model-gateway-center">
                <strong>图片生成</strong>
                <span>选择下方类型</span>
              </div>
            }
            size="xl"
          />
        </div>
      </AuroraBackground>
    </main>
  );
}
