import { Header } from "@/components/ui/header-2";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { TestimonialCarousel } from "@/components/ui/profile-card-testimonial-carousel";

export default function ContactPage() {
  return (
    <main className="contact-page">
      <Header />
      <AuroraBackground className="contact-hero">
        <div className="contact-hero-copy">
          <p>Contact Team</p>
          <h1>联系我们</h1>
          <span>需要接入工业模型工作台、图片生成或者账号协助时，可以直接联系开发者</span>
        </div>
        <TestimonialCarousel />
      </AuroraBackground>
    </main>
  );
}
