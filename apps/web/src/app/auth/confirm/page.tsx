import { Suspense } from "react";
import { AuthConfirmShell } from "@/components/auth/AuthConfirmShell";

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <AuthConfirmShell />
    </Suspense>
  );
}
