import { Chili3DWorkbench } from "@/components/industrial/Chili3DWorkbench";
import { Header } from "@/components/ui/header-2";

export default function Chili3DPage() {
  return (
    <main className="chili-page">
      <Header />
      <Chili3DWorkbench />
    </main>
  );
}
