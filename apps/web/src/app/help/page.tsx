import { AuthGate } from "@/components/auth/AuthGate";
import { HelpAssistant } from "@/components/help/HelpAssistant";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Header } from "@/components/ui/header-2";

export default function HelpPage() {
  return (
    <AuthGate>
      <main className="help-page">
        <Header />
        <AuroraBackground className="help-shell">
          <HelpAssistant />
        </AuroraBackground>
      </main>
    </AuthGate>
  );
}
