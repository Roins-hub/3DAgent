import { AuthGate } from "@/components/auth/AuthGate";
import { API_BASE_URL } from "@/lib/api";
import { CadamPreviewClient } from "./CadamPreviewClient";

type PreviewPageProps = {
  searchParams: Promise<{
    title?: string;
    geometry?: string;
    step?: string;
    source?: string;
    provider?: string;
    model?: string;
  }>;
};

export default async function CadamPreviewPage({ searchParams }: PreviewPageProps) {
  const params = await searchParams;
  const title = params.title || "CAD Core Preview";
  const geometry = params.geometry || "generated_part";
  const provider = params.provider || "cad-script-engine";
  const model = params.model || "build123d";
  const stepFile = params.step || "";
  const sourceFile = params.source || "";
  const stepUrl = stepFile ? `${API_BASE_URL}/api/paramcad/outputs/${encodeURIComponent(stepFile)}` : "";
  const previewUrl = stepFile
    ? `${API_BASE_URL}/api/paramcad/outputs/${encodeURIComponent(stepFile)}/preview.stl`
    : "";

  return (
    <AuthGate>
      <CadamPreviewClient
        geometry={geometry}
        model={model}
        previewUrl={previewUrl}
        provider={provider}
        sourceFile={sourceFile}
        stepFile={stepFile}
        stepUrl={stepUrl}
        title={title}
      />
    </AuthGate>
  );
}
