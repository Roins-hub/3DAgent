import { HelpAssistant } from "@/components/help/HelpAssistant";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Header } from "@/components/ui/header-2";

export default function HelpPage() {
  return (
    <main className="help-page">
      <Header />
      <AuroraBackground className="help-shell">
        <HelpAssistant />
      </AuroraBackground>
    </main>
  );
}
