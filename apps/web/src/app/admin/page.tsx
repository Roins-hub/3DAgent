import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { AdminConsole } from "@/components/admin/AdminConsole";

export default function AdminPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <AdminConsole />
      </Suspense>
    </AuthGate>
  );
}
