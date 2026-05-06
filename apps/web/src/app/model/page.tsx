import { Header } from "@/components/ui/header-2";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { CircularRevealHeading } from "@/components/ui/circular-reveal-heading";

const modelTypes = [
  {
    title: "家具模型",
    href: "/studio?type=furniture",
    text: "家具模型",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "文具模型",
    href: "/studio?type=stationery",
    text: "文具模型",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "工业制作模型",
    href: "/studio?type=industrial",
    text: "工业制作模型",
    image:
      "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "文创设计模型",
    href: "/studio?type=cultural",
    text: "文创设计模型",
    image:
      "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=900&q=80",
  },
];

export default function ModelGatewayPage() {
  return (
    <main className="model-gateway">
      <Header />
      <AuroraBackground className="model-gateway-hero" aria-labelledby="model-gateway-title">
        <div className="model-gateway-copy">
          <p>3D模型生成大厅</p>
          <h1 id="model-gateway-title">选择生产模型类型</h1>
        </div>

        <div className="model-gateway-stage">
          <CircularRevealHeading
            items={modelTypes.map(({ text, image, href }) => ({ text, image, href }))}
            centerText={
              <div className="model-gateway-center">
                <strong>3D模型生成</strong>
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
