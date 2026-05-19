import { AuthGate } from "@/components/auth/AuthGate";
import { CADAMWorkbench } from "@/components/industrial/CADAMWorkbench";
import { Header } from "@/components/ui/header-2";

export default function CadamPage() {
  return (
    <AuthGate>
      <main className="cadam-page">
        <Header />
        <CADAMWorkbench />
      </main>
    </AuthGate>
  );
}
