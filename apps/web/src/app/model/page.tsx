import { AuthGate } from "@/components/auth/AuthGate";
import { Header } from "@/components/ui/header-2";
import { InteractiveSelector } from "@/components/ui/interactive-selector";

export default function ModelGatewayPage() {
  return (
    <AuthGate>
      <main className="model-gateway">
        <Header />
        <InteractiveSelector />
      </main>
    </AuthGate>
  );
}
