import { Suspense } from "react";
import { RegisterShell } from "@/components/auth/RegisterShell";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterShell />
    </Suspense>
  );
}
