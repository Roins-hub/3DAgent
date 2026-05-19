"use client";

import type { GenerationJob } from "@3dagent/shared";
import { Center, ContactShadows, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Loader2, RotateCcw, ZoomIn } from "lucide-react";
import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Box3, Vector3 } from "three";
import type { Group, Mesh, Object3D } from "three";
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
    console.error("模型渲染失败", error, info);
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

function getModelScale(scene: Object3D) {
  let meshCount = 0;
  scene.traverse((child) => {
    if ((child as Mesh).isMesh) {
      meshCount += 1;
    }
  });

  const box = new Box3().setFromObject(scene);
  if (meshCount === 0 || box.isEmpty()) {
    return null;
  }

  const size = box.getSize(new Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z, 1);
  return 2.8 / maxAxis;
}

function ModelAsset({
  url,
  onLoaded,
  onError,
}: {
  url: string;
  onLoaded: () => void;
  onError: (message: string) => void;
}) {
  const group = useRef<Group>(null);
  const gltf = useGLTF(url);
  const modelScale = useMemo(() => getModelScale(gltf.scene), [gltf.scene]);

  useEffect(() => {
    if (!modelScale) {
      onError("模型文件没有可显示的网格。");
      return;
    }
    onLoaded();
  }, [modelScale, onError, onLoaded]);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.22;
  });

  if (!modelScale) {
    return null;
  }

  return (
    <Center ref={group}>
      <primitive object={gltf.scene} scale={modelScale} />
    </Center>
  );
}

function AuthenticatedModelAsset({
  activeJob,
  url,
  onLoaded,
  onError,
}: {
  activeJob: GenerationJob;
  url: string;
  onLoaded: () => void;
  onError: (message: string) => void;
}) {
  const [assetState, setAssetState] = useState<{
    sourceUrl: string;
    objectUrl: string | null;
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
          onError(body?.detail ?? `模型预览加载失败：HTTP ${response.status}`);
          return;
        }

        const blob = await response.blob();
        console.info("模型文件下载完成", Math.round(performance.now() - startedAt), "ms");
        nextObjectUrl = window.URL.createObjectURL(blob);
        setAssetState({ sourceUrl: url, objectUrl: nextObjectUrl });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        onError(error instanceof Error ? error.message : "模型预览加载失败");
      }
    }

    void loadModel();

    return () => {
      controller.abort();
      if (nextObjectUrl) {
        window.URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [onError, url]);

  if (assetState?.sourceUrl !== url || !assetState.objectUrl) {
    return <PreviewAsset activeJob={activeJob} mode="loading" />;
  }

  return <ModelAsset url={assetState.objectUrl} onLoaded={onLoaded} onError={onError} />;
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

function getOverlayCopy(
  activeJob: GenerationJob | null,
  isModelLoading: boolean,
  modelError: string | null,
) {
  if (modelError) {
    return {
      title: "模型文件不可用",
      body: modelError,
    };
  }

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
  const [modelError, setModelError] = useState<{
    sourceUrl: string;
    message: string;
  } | null>(null);
  const currentModelError =
    modelError && modelError.sourceUrl === modelUrl ? modelError.message : null;
  const hasPreviewModel =
    activeJob?.status === "completed" &&
    Boolean(modelUrl);
  const isModelLoading = Boolean(
    hasPreviewModel && loadedModelUrl !== modelUrl && !currentModelError,
  );
  const overlayCopy = useMemo(
    () => getOverlayCopy(activeJob, isModelLoading, currentModelError),
    [activeJob, isModelLoading, currentModelError],
  );
  const camera = isZoomed
    ? { position: [2.15, 1.65, 2.55] as [number, number, number], fov: 34 }
    : { position: [3.6, 2.6, 4.2] as [number, number, number], fov: 42 };

  return (
    <div className="studio-preview-canvas">
      {(currentModelError || isModelLoading || !hasPreviewModel) && (
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
          ? currentModelError
            ? "文件不可用"
            : isModelLoading
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
        {activeJob?.status === "completed" && modelUrl && !currentModelError ? (
          <ModelErrorBoundary
            fallback={<PreviewAsset activeJob={activeJob} mode="loading" />}
            resetKey={modelUrl}
          >
            <Suspense fallback={<PreviewAsset activeJob={activeJob} mode="loading" />}>
              <AuthenticatedModelAsset
                activeJob={activeJob}
                url={modelUrl}
                onLoaded={() => setLoadedModelUrl(modelUrl)}
                onError={(message) => setModelError({ sourceUrl: modelUrl, message })}
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
