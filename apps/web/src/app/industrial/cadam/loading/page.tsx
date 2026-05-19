import { CadamLoadingClient } from "@/app/industrial/cadam/loading/CadamLoadingClient";
import { AuthGate } from "@/components/auth/AuthGate";

type CadamLoadingPageProps = {
  searchParams: Promise<{
    requirement?: string;
    requestId?: string;
  }>;
};

export default async function CadamLoadingPage({ searchParams }: CadamLoadingPageProps) {
  const params = await searchParams;

  return (
    <AuthGate>
      <CadamLoadingClient requirement={params.requirement ?? ""} requestId={params.requestId ?? ""} />
    </AuthGate>
  );
}
