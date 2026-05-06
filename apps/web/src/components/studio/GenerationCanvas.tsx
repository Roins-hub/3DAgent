"use client";

import type { GenerationJob } from "@3dagent/shared";
import { ContactShadows, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Loader2, RotateCcw, ZoomIn } from "lucide-react";
import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { Group, Mesh } from "three";
import { getAuthHeaders } from "@/lib/supabase";

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string | null },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("模型加载失败", error, info);
  }

  componentDidUpdate(previousProps: { resetKey: string | null }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function ModelAsset({
  url,
  onLoaded,
}: {
  url: string;
  onLoaded: () => void;
}) {
  const group = useRef<Group>(null);
  const gltf = useGLTF(url);

  useEffect(() => {
    onLoaded();
  }, [onLoaded]);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.22;
  });

  return (
    <primitive
      ref={group}
      object={gltf.scene}
      position={[0, 0.25, 0]}
      scale={1.35}
    />
  );
}

function AuthenticatedModelAsset({
  activeJob,
  url,
  onLoaded,
}: {
  activeJob: GenerationJob;
  url: string;
  onLoaded: () => void;
}) {
  const [assetState, setAssetState] = useState<{
    sourceUrl: string;
    objectUrl: string | null;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let nextObjectUrl: string | null = null;

    async function loadModel() {
      try {
        const startedAt = performance.now();
        const response = await fetch(url, {
          headers: await getAuthHeaders(),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail ?? `模型预览加载失败 ${response.status}`);
        }

        const blob = await response.blob();
        console.info("模型文件下载完成", Math.round(performance.now() - startedAt), "ms");
        nextObjectUrl = window.URL.createObjectURL(blob);
        setAssetState({ sourceUrl: url, objectUrl: nextObjectUrl, error: null });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setAssetState({
          sourceUrl: url,
          objectUrl: null,
          error: error instanceof Error ? error : new Error("模型预览加载失败"),
        });
      }
    }

    void loadModel();

    return () => {
      controller.abort();
      if (nextObjectUrl) {
        window.URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [url]);

  if (assetState?.sourceUrl === url && assetState.error) {
    throw assetState.error;
  }

  if (assetState?.sourceUrl !== url || !assetState.objectUrl) {
    return <PreviewAsset activeJob={activeJob} mode="loading" />;
  }

  return <ModelAsset url={assetState.objectUrl} onLoaded={onLoaded} />;
}

function PreviewAsset({
  activeJob,
  mode = "idle",
}: {
  activeJob: GenerationJob | null;
  mode?: "idle" | "loading";
}) {
  const ref = useRef<Mesh>(null);
  const isGenerating =
    activeJob?.status === "queued" ||
    activeJob?.status === "running" ||
    activeJob?.status === "postprocessing";

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * (isGenerating || mode === "loading" ? 0.72 : 0.22);
    ref.current.rotation.x = Math.sin(Date.now() / 1400) * 0.04;
  });

  return (
    <group>
      <mesh ref={ref} position={[0, 0.75, 0]} castShadow>
        <dodecahedronGeometry args={[mode === "loading" ? 0.82 : 0.9, 1]} />
        <meshStandardMaterial
          color={mode === "loading" ? "#9bc8c1" : "#c8d7ff"}
          metalness={0.16}
          roughness={0.34}
          wireframe={isGenerating || mode === "loading"}
        />
      </mesh>
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.42, 0.12, 6]} />
        <meshStandardMaterial color="#2d332f" roughness={0.6} />
      </mesh>
    </group>
  );
}

function getOverlayCopy(activeJob: GenerationJob | null, isModelLoading: boolean) {
  if (isModelLoading) {
    return {
      title: "模型文件加载中",
      body: "任务已经完成，正在下载并解析 GLB 文件",
    };
  }

  if (!activeJob) {
    return {
      title: "等待生成提示词",
      body: "输入描述后这里会显示模型预览",
    };
  }

  if (activeJob.status === "failed") {
    return {
      title: "模型生成失败",
      body: activeJob.error || "请调整提示词后重试",
    };
  }

  if (activeJob.status === "completed") {
    return {
      title: "模型预览准备中",
      body: "正在整理模型文件并载入预览",
    };
  }

  return {
    title: "模型正在生成",
    body: `当前进度 ${activeJob.progress}%`,
  };
}

export function GenerationCanvas({
  activeJob,
  modelUrl,
}: {
  activeJob: GenerationJob | null;
  modelUrl?: string | null;
}) {
  const [key, setKey] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [loadedModelUrl, setLoadedModelUrl] = useState<string | null>(null);
  const isRealModel =
    activeJob?.status === "completed" &&
    Boolean(modelUrl) &&
    modelUrl !== "/models/demo-asset.glb";
  const isModelLoading = Boolean(isRealModel && loadedModelUrl !== modelUrl);
  const overlayCopy = useMemo(
    () => getOverlayCopy(activeJob, isModelLoading),
    [activeJob, isModelLoading],
  );
  const camera = isZoomed
    ? { position: [2.15, 1.65, 2.55] as [number, number, number], fov: 34 }
    : { position: [3.6, 2.6, 4.2] as [number, number, number], fov: 42 };

  return (
    <div className="studio-preview-canvas">
      {(isModelLoading || !isRealModel) && (
        <div className="studio-preview-overlay">
          <div className="studio-preview-loader">
            {isModelLoading ? <Loader2 className="animate-spin" size={26} /> : null}
          </div>
          <div>
            <p>{overlayCopy.title}</p>
            <span>{overlayCopy.body}</span>
          </div>
        </div>
      )}

      <div className="studio-preview-tools">
        <button
          aria-label="重置视角"
          onClick={() => {
            setIsZoomed(false);
            setKey((value) => value + 1);
          }}
          title="重置视角"
        >
          <RotateCcw size={16} />
        </button>
        <button
          aria-label={isZoomed ? "恢复缩放" : "放大预览"}
          aria-pressed={isZoomed}
          onClick={() => {
            setIsZoomed((value) => !value);
            setKey((value) => value + 1);
          }}
          title={isZoomed ? "恢复视角" : "放大预览"}
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="studio-preview-state">
        {activeJob?.status === "completed"
          ? isModelLoading
            ? "加载模型"
            : "生成预览"
          : activeJob
            ? "正在生成"
            : "就绪"}
      </div>

      <Canvas
        key={`${key}-${isZoomed ? "zoom" : "default"}`}
        camera={camera}
        dpr={[1, 1.5]}
        shadows
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 6, 3]} intensity={2} castShadow />
        {activeJob?.status === "completed" && modelUrl ? (
          <ModelErrorBoundary
            fallback={<PreviewAsset activeJob={activeJob} mode="loading" />}
            resetKey={modelUrl}
          >
            <Suspense fallback={<PreviewAsset activeJob={activeJob} mode="loading" />}>
              <AuthenticatedModelAsset
                activeJob={activeJob}
                url={modelUrl}
                onLoaded={() => setLoadedModelUrl(modelUrl)}
              />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          <PreviewAsset activeJob={activeJob} />
        )}
        <Grid
          args={[10, 10]}
          cellColor="#46524c"
          cellSize={0.5}
          fadeDistance={12}
          fadeStrength={1}
          sectionColor="#6f7a73"
        />
        <ContactShadows blur={2.5} opacity={0.4} position={[0, -0.05, 0]} />
        <OrbitControls enablePan={false} minDistance={2.8} maxDistance={8} />
      </Canvas>
    </div>
  );
}
