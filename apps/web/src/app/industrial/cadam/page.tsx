import { CADAMWorkbench } from "@/components/industrial/CADAMWorkbench";
import { Header } from "@/components/ui/header-2";

export default function CadamPage() {
  return (
    <main className="cadam-page">
      <Header />
      <CADAMWorkbench />
    </main>
  );
}
