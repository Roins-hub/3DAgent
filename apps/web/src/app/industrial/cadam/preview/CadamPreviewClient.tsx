"use client";

import Link from "next/link";
import { Center, ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Download,
  FileCode2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Component, Suspense, useEffect, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { BufferGeometry } from "three";
import { MeshStandardMaterial, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type DownloadState = "idle" | "downloading" | "done" | "error";

class PreviewErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
    onError: () => void;
    resetKey: string;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CADAM preview failed", error, info);
    this.props.onError();
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export type CadamPreviewClientProps = {
  title: string;
  geometry: string;
  provider: string;
  model: string;
  stepFile: string;
  sourceFile: string;
  stepUrl: string;
  previewUrl: string;
};

function normalizeStlGeometry(geometry: BufferGeometry) {
  const nextGeometry = geometry.clone();
  nextGeometry.computeBoundingBox();
  const box = nextGeometry.boundingBox;
  if (!box) return { geometry: nextGeometry, scale: 1 };

  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  nextGeometry.translate(-center.x, -center.y, -center.z);

  const maxAxis = Math.max(size.x, size.y, size.z, 1);
  return { geometry: nextGeometry, scale: 2.8 / maxAxis };
}

function CadamStlModel({
  url,
  resetKey,
  handleLoaded,
  handleError,
}: {
  url: string;
  resetKey: number;
  handleLoaded: () => void;
  handleError: (message: string) => void;
}) {
  const [asset, setAsset] = useState<{
    key: string;
    geometry: BufferGeometry;
  } | null>(null);
  const assetKey = `${url}?view=${resetKey}`;
  const loadedGeometry = asset?.key === assetKey ? asset.geometry : null;
  const { geometry, scale } = useMemo(
    () => (loadedGeometry ? normalizeStlGeometry(loadedGeometry) : { geometry: null, scale: 1 }),
    [loadedGeometry],
  );
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#d7dde2",
        metalness: 0.18,
        roughness: 0.34,
      }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadStlPreview() {
      try {
        const response = await fetch(assetKey, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const nextGeometry = new STLLoader().parse(buffer);
        if (!controller.signal.aborted) {
          setAsset({ key: assetKey, geometry: nextGeometry });
          handleLoaded();
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        handleError(error instanceof Error ? error.message : "STEP 预览解析失败");
      }
    }

    void loadStlPreview();

    return () => {
      controller.abort();
    };
  }, [assetKey, handleError, handleLoaded]);

  if (!geometry) return null;

  return (
    <Center>
      <mesh
        castShadow
        receiveShadow
        geometry={geometry}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={scale}
      />
    </Center>
  );
}

function PreviewFallback({ text }: { text: string }) {
  return (
    <div className="cadam-preview-loading">
      <Loader2 size={28} />
      <span>{text}</span>
    </div>
  );
}

export function CadamPreviewClient({
  title,
  geometry,
  provider,
  model,
  stepFile,
  sourceFile,
  stepUrl,
  previewUrl,
}: CadamPreviewClientProps) {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadError, setDownloadError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const canDownload = Boolean(stepUrl);
  const canPreview = Boolean(previewUrl) && !previewFailed;
  const downloadLabel =
    downloadState === "downloading"
      ? "正在导出"
      : downloadState === "done"
        ? "已开始下载"
        : downloadState === "error"
          ? "重试导出"
          : "下载 STEP";

  async function downloadStep() {
    if (!canDownload || downloadState === "downloading") return;

    setDownloadState("downloading");
    setDownloadError("");

    try {
      const response = await fetch(stepUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = stepFile || "cadam-model.step";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setDownloadState("done");
      window.setTimeout(() => setDownloadState("idle"), 1800);
    } catch (error) {
      setDownloadState("error");
      setDownloadError(error instanceof Error ? error.message : "导出失败");
    }
  }

  return (
    <main className="cadam-preview-page">
      <header className="cadam-preview-topbar">
        <div className="cadam-preview-titlebar">
          <Link href="/industrial/cadam">返回生成页</Link>
          <strong title={title}>{title}</strong>
        </div>
        <div className="cadam-preview-actions">
          {sourceFile ? (
            <span className="cadam-preview-utility">
              <FileCode2 size={15} />
              源码已生成
            </span>
          ) : null}
          <button
            className={`cadam-preview-download cadam-preview-download-${downloadState}`}
            disabled={!canDownload || downloadState === "downloading"}
            onClick={() => void downloadStep()}
            type="button"
          >
            {downloadState === "downloading" ? (
              <Loader2 size={15} />
            ) : downloadState === "done" ? (
              <CheckCircle2 size={15} />
            ) : downloadState === "error" ? (
              <AlertCircle size={15} />
            ) : (
              <Download size={15} />
            )}
            {downloadLabel}
          </button>
        </div>
      </header>

      <section className="cadam-preview-stage">
        <div className="cadam-preview-viewport">
          {canPreview ? (
            <>
              <div className="cadam-preview-tools">
                <button
                  aria-label="重置预览"
                  onClick={() => {
                    setPreviewFailed(false);
                    setPreviewLoading(true);
                    setResetKey((value) => value + 1);
                  }}
                  title="重置预览"
                  type="button"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <PreviewErrorBoundary
                fallback={<PreviewFallback text="预览加载失败，可先下载 STEP" />}
                onError={() => setPreviewFailed(true)}
                resetKey={`${previewUrl}-${resetKey}`}
              >
                <Suspense fallback={<PreviewFallback text="正在解析 STEP 预览" />}>
                  <Canvas camera={{ position: [3.2, 2.2, 3.6], fov: 42 }} shadows>
                    <color attach="background" args={["#101418"]} />
                    <ambientLight intensity={0.85} />
                    <directionalLight castShadow intensity={2.2} position={[4, 6, 4]} />
                    <CadamStlModel
                      handleError={(message) => {
                        setDownloadError(message);
                        setPreviewFailed(true);
                        setPreviewLoading(false);
                      }}
                      handleLoaded={() => setPreviewLoading(false)}
                      resetKey={resetKey}
                      url={previewUrl}
                    />
                    <Grid
                      args={[8, 8]}
                      cellColor="#4f5b64"
                      cellSize={0.5}
                      fadeDistance={10}
                      fadeStrength={1}
                      position={[0, -1.45, 0]}
                      sectionColor="#8b98a3"
                    />
                    <ContactShadows blur={2.5} opacity={0.38} position={[0, -1.4, 0]} />
                    <OrbitControls enableDamping enablePan={false} minDistance={1.8} maxDistance={7} />
                  </Canvas>
                </Suspense>
              </PreviewErrorBoundary>
              {previewLoading ? <PreviewFallback text="正在解析 STEP 预览" /> : null}
            </>
          ) : (
            <div className="cadam-preview-object">
              <Box size={86} />
              <span>{previewFailed ? "预览加载失败，可先下载 STEP" : "等待可预览模型"}</span>
            </div>
          )}
        </div>

        <aside className="cadam-preview-inspector">
          <h2>模型信息</h2>
          <dl>
            <div>
              <dt>几何类型</dt>
              <dd title={geometry}>{geometry}</dd>
            </div>
            <div>
              <dt>生成器</dt>
              <dd title={provider}>{provider}</dd>
            </div>
            <div>
              <dt>内核</dt>
              <dd title={model}>{model}</dd>
            </div>
            <div>
              <dt>文件</dt>
              <dd title={stepFile || "-"}>{stepFile || "-"}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{canPreview ? "可预览" : "已生成"}</dd>
            </div>
          </dl>
          {downloadError ? <p className="cadam-preview-error">导出失败：{downloadError}</p> : null}
        </aside>
      </section>
    </main>
  );
}
