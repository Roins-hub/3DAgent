"use client";

import type { GenerationJob } from "@3dagent/shared";
import { ContactShadows, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { RotateCcw, ZoomIn } from "lucide-react";
import { Component, Suspense, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { Group, Mesh } from "three";

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

function ModelAsset({ url }: { url: string }) {
  const group = useRef<Group>(null);
  const gltf = useGLTF(url);

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

function GeneratedAsset({ activeJob }: { activeJob: GenerationJob | null }) {
  const ref = useRef<Mesh>(null);
  const isGenerating =
    activeJob?.status === "queued" ||
    activeJob?.status === "running" ||
    activeJob?.status === "postprocessing";

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * (isGenerating ? 0.85 : 0.28);
    ref.current.rotation.x = Math.sin(Date.now() / 1400) * 0.04;
  });

  const completed = activeJob?.status === "completed";

  return (
    <group>
      <mesh ref={ref} position={[0, 0.75, 0]} castShadow>
        <dodecahedronGeometry args={[completed ? 1.08 : 0.9, 1]} />
        <meshStandardMaterial
          color={completed ? "#c77a2f" : "#9bc8c1"}
          metalness={completed ? 0.42 : 0.16}
          roughness={0.38}
          wireframe={isGenerating}
        />
      </mesh>
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.42, 0.12, 6]} />
        <meshStandardMaterial color="#2d332f" roughness={0.6} />
      </mesh>
    </group>
  );
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
  const hasGeneratedModel =
    activeJob?.status === "completed" &&
    Boolean(modelUrl) &&
    modelUrl !== "/models/demo-asset.glb";
  const camera = isZoomed
    ? { position: [2.15, 1.65, 2.55] as [number, number, number], fov: 34 }
    : { position: [3.6, 2.6, 4.2] as [number, number, number], fov: 42 };

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-lg bg-[#151815]">
      {!hasGeneratedModel && <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <div className="relative h-64 w-64">
          <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[28px] border border-[#c77a2f]/70 bg-[#c77a2f]/25 shadow-2xl shadow-[#c77a2f]/20" />
          <div className="absolute bottom-8 left-1/2 h-6 w-48 -translate-x-1/2 rounded-[50%] bg-black/35 blur-md" />
          <div className="absolute bottom-11 left-1/2 h-8 w-44 -translate-x-1/2 rounded-[50%] border border-white/10 bg-white/[0.04]" />
        </div>
      </div>}
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <button
          aria-label="重置视角"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 text-white transition hover:bg-white/18"
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 text-white transition hover:bg-white/18 aria-pressed:bg-[#20766f]"
          onClick={() => {
            setIsZoomed((value) => !value);
            setKey((value) => value + 1);
          }}
          title={isZoomed ? "恢复默认视角" : "放大预览模型"}
        >
          <ZoomIn size={16} />
        </button>
      </div>
      <div className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
        {activeJob?.status === "completed"
          ? "生成预览"
          : activeJob
            ? "正在生成"
            : "就绪"}
      </div>
      <Canvas
        key={`${key}-${isZoomed ? "zoom" : "default"}`}
        camera={camera}
        shadows
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 6, 3]} intensity={2} castShadow />
        {activeJob?.status === "completed" && modelUrl ? (
          <ModelErrorBoundary
            fallback={<GeneratedAsset activeJob={activeJob} />}
            resetKey={modelUrl}
          >
            <Suspense fallback={<GeneratedAsset activeJob={activeJob} />}>
              <ModelAsset url={modelUrl} />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          <GeneratedAsset activeJob={activeJob} />
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
