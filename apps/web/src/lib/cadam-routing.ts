import type { ParamcadRunResponse } from "@/lib/api";

type CadamPreviewResult = Pick<
  ParamcadRunResponse,
  "title" | "geometryType" | "stepFile" | "sourceFile" | "provider" | "model"
>;

export function buildCadamLoadingHref(requirement: string, requestId: string) {
  const params = new URLSearchParams();
  params.set("requirement", requirement);
  params.set("requestId", requestId);
  return `/industrial/cadam/loading?${params.toString()}`;
}

export function buildCadamPreviewHref(result: CadamPreviewResult) {
  const params = new URLSearchParams();
  if (result.title) params.set("title", result.title);
  if (result.geometryType) params.set("geometry", result.geometryType);
  if (result.stepFile) params.set("step", result.stepFile);
  if (result.sourceFile) params.set("source", result.sourceFile);
  params.set("provider", result.provider);
  params.set("model", result.model);
  return `/industrial/cadam/preview?${params.toString()}`;
}
