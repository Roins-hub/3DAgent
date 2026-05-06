import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { StudioShell } from "@/components/studio/StudioShell";

export default function StudioPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <StudioShell />
      </Suspense>
    </AuthGate>
  );
}
