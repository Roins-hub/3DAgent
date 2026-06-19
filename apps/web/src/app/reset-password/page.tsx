import { Suspense } from "react";
import { ResetPasswordShell } from "@/components/auth/ResetPasswordShell";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordShell />
    </Suspense>
  );
}
