import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { ImageStudioShell } from "@/components/studio/ImageStudioShell";

export default function ImageWorkspacePage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <ImageStudioShell />
      </Suspense>
    </AuthGate>
  );
}
