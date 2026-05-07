"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  AlertCircle,
  Box,
  Braces,
  Clipboard,
  Download,
  FileCode2,
  Loader2,
  Maximize2,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import React from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { api } from "@/lib/api";

type ModelKind = "bracket" | "enclosure" | "gear" | "flange";

type CadSpec = {
  kind: ModelKind;
  name: string;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  holeDiameter: number;
  cornerRadius: number;
  teeth: number;
};

type CompileStatus = "idle" | "compiling" | "ready" | "stale" | "failed";

type OpenSCADInstance = {
  renderToStl(code: string): Promise<string>;
};

const examples = [
  "生成一个带安装孔的铝合金电机支架，厚度 6mm，四角倒圆。",
  "做一个传感器外壳，长 90mm，宽 54mm，高 28mm，带四个螺丝孔。",
  "生成一个 32 齿小齿轮，中心孔 8mm，厚度 10mm。",
  "生成一个法兰连接盘，外径 96mm，中心孔 24mm，6 个安装孔。",
];

const initialSpec: CadSpec = {
  kind: "bracket",
  name: "motor_bracket",
  width: 96,
  height: 64,
  depth: 38,
  thickness: 6,
  holeDiameter: 8,
  cornerRadius: 5,
  teeth: 32,
};

const OPENSCAD_COMPILE_TIMEOUT_MS = 45_000;
let openScadPromise: Promise<OpenSCADInstance> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberFromPrompt(prompt: string, fallback: number, index = 0) {
  const matches = prompt.match(/\d+(?:\.\d+)?/g);
  if (!matches?.[index]) return fallback;
  return Number(matches[index]);
}

function inferSpec(prompt: string, current: CadSpec): CadSpec {
  const normalized = prompt.toLowerCase();
  const hasGear = /齿轮|gear/.test(normalized);
  const hasFlange = /法兰|flange|连接盘/.test(normalized);
  const hasEnclosure = /外壳|盒|壳体|enclosure|case/.test(normalized);
  const kind: ModelKind = hasGear ? "gear" : hasFlange ? "flange" : hasEnclosure ? "enclosure" : "bracket";

  if (kind === "gear") {
    return {
      ...current,
      kind,
      name: "parametric_gear",
      width: clamp(numberFromPrompt(prompt, 72, 0), 36, 160),
      height: clamp(numberFromPrompt(prompt, 72, 0), 36, 160),
      depth: clamp(numberFromPrompt(prompt, 10, 2), 4, 40),
      holeDiameter: clamp(numberFromPrompt(prompt, 8, 1), 3, 36),
      teeth: clamp(Math.round(numberFromPrompt(prompt, 32, 0)), 12, 72),
    };
  }

  if (kind === "flange") {
    return {
      ...current,
      kind,
      name: "mounting_flange",
      width: clamp(numberFromPrompt(prompt, 96, 0), 48, 180),
      height: clamp(numberFromPrompt(prompt, 96, 0), 48, 180),
      depth: clamp(numberFromPrompt(prompt, 12, 2), 5, 36),
      holeDiameter: clamp(numberFromPrompt(prompt, 8, 1), 4, 24),
    };
  }

  if (kind === "enclosure") {
    return {
      ...current,
      kind,
      name: "sensor_enclosure",
      width: clamp(numberFromPrompt(prompt, 90, 0), 48, 180),
      height: clamp(numberFromPrompt(prompt, 54, 1), 36, 140),
      depth: clamp(numberFromPrompt(prompt, 28, 2), 16, 90),
      thickness: clamp(numberFromPrompt(prompt, 3, 3), 2, 10),
      cornerRadius: 6,
    };
  }

  return {
    ...current,
    kind,
    name: "motor_bracket",
    width: clamp(numberFromPrompt(prompt, 96, 0), 48, 180),
    height: clamp(numberFromPrompt(prompt, 64, 1), 36, 140),
    depth: clamp(numberFromPrompt(prompt, 38, 2), 20, 100),
    thickness: clamp(numberFromPrompt(prompt, 6, 0), 3, 18),
    holeDiameter: clamp(numberFromPrompt(prompt, 8, 1), 4, 24),
    cornerRadius: /倒圆|圆角|fillet|radius/.test(normalized) ? 6 : current.cornerRadius,
  };
}

function scadForSpec(spec: CadSpec) {
  if (spec.kind === "gear") {
    return `module ${spec.name}(outer_d=${spec.width}, thickness=${spec.depth}, bore=${spec.holeDiameter}, teeth=${spec.teeth}) {
  difference() {
    union() {
      cylinder(d=outer_d * 0.78, h=thickness, $fn=96);
      for (i = [0:teeth-1]) {
        rotate([0, 0, i * 360 / teeth])
          translate([outer_d * 0.42, 0, thickness / 2])
            cube([outer_d * 0.12, outer_d * 0.055, thickness], center=true);
      }
    }
    translate([0, 0, -1])
      cylinder(d=bore, h=thickness + 2, $fn=64);
  }
}

${spec.name}();`;
  }

  if (spec.kind === "flange") {
    return `module ${spec.name}(outer_d=${spec.width}, thickness=${spec.depth}, bore=${Math.round(spec.width * 0.25)}, hole_d=${spec.holeDiameter}, holes=6) {
  difference() {
    cylinder(d=outer_d, h=thickness, $fn=128);
    translate([0, 0, -1])
      cylinder(d=bore, h=thickness + 2, $fn=96);
    for (i = [0:holes-1]) {
      rotate([0, 0, i * 360 / holes])
        translate([outer_d * 0.34, 0, -1])
          cylinder(d=hole_d, h=thickness + 2, $fn=48);
    }
  }
}

${spec.name}();`;
  }

  if (spec.kind === "enclosure") {
    return `module ${spec.name}(w=${spec.width}, h=${spec.height}, d=${spec.depth}, wall=${spec.thickness}, hole_d=${spec.holeDiameter}) {
  difference() {
    cube([w, h, d], center=true);
    translate([0, 0, wall])
      cube([w - wall * 2, h - wall * 2, d], center=true);
    for (x = [-1, 1], y = [-1, 1]) {
      translate([x * (w / 2 - 12), y * (h / 2 - 12), -d / 2 - 1])
        cylinder(d=hole_d, h=d + 2, $fn=36);
    }
  }
}

${spec.name}();`;
  }

  return `module ${spec.name}(width=${spec.width}, height=${spec.height}, depth=${spec.depth}, thickness=${spec.thickness}, hole_diameter=${spec.holeDiameter}) {
  difference() {
    union() {
      cube([width, depth, thickness]);
      cube([width, thickness, height]);
    }
    for (x = [12, width - 12], y = [12, depth - 12]) {
      translate([x, y, -1])
        cylinder(d=hole_diameter, h=thickness + 2, $fn=48);
    }
  }
}

${spec.name}();`;
}

function getOpenScad() {
  openScadPromise ??= import("openscad-wasm").then(async ({ createOpenSCAD }) => createOpenSCAD());
  return openScadPromise;
}

function looksLikeScad(source: string) {
  return /\b(module|cube|cylinder|sphere|polyhedron|linear_extrude|rotate_extrude)\b/.test(source);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function CompiledMesh({ stl }: { stl: string }) {
  const geometry = React.useMemo(() => {
    const parsed = new STLLoader().parse(stl);
    parsed.computeVertexNormals();
    parsed.computeBoundingBox();

    const box = parsed.boundingBox;
    if (box) {
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      parsed.translate(-center.x, -center.y, -center.z);
      const maxAxis = Math.max(size.x, size.y, size.z) || 1;
      parsed.scale(2.4 / maxAxis, 2.4 / maxAxis, 2.4 / maxAxis);
    }

    return parsed;
  }, [stl]);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color="#d8dee3" roughness={0.36} metalness={0.54} side={THREE.DoubleSide} />
    </mesh>
  );
}

function EmptyPreview({ status }: { status: CompileStatus }) {
  const message =
    status === "failed"
      ? "编译失败，请检查 OpenSCAD 代码"
      : status === "stale"
        ? "代码已更新，点击编译预览刷新真实网格"
        : "点击编译预览生成真实 CAD 网格";

  return (
    <div className="cadam-preview-empty">
      <Box size={30} />
      <span>{message}</span>
    </div>
  );
}

export function CADAMWorkbench() {
  const [prompt, setPrompt] = React.useState(examples[0]);
  const [spec, setSpec] = React.useState<CadSpec>(initialSpec);
  const [code, setCode] = React.useState(() => scadForSpec(initialSpec));
  const [stl, setStl] = React.useState<string | null>(null);
  const [generatorMeta, setGeneratorMeta] = React.useState("OpenAI-compatible");
  const [error, setError] = React.useState<string | null>(null);
  const [compileNote, setCompileNote] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = React.useState(false);
  const [compileStatus, setCompileStatus] = React.useState<CompileStatus>("idle");

  const compileScad = React.useCallback(async (source = code) => {
    setCompileStatus("compiling");
    setError(null);
    setCompileNote(null);
    try {
      if (!looksLikeScad(source)) {
        throw new Error("当前内容不像有效 OpenSCAD。");
      }
      const openScad = await getOpenScad();
      const renderedStl = await withTimeout(
        openScad.renderToStl(source),
        OPENSCAD_COMPILE_TIMEOUT_MS,
        "OpenSCAD WASM 编译超时，请简化代码或检查几何结构。",
      );
      if (!renderedStl.trim().startsWith("solid")) {
        throw new Error("OpenSCAD 没有返回有效 STL。");
      }
      setStl(renderedStl);
      setCompileStatus("ready");
      return renderedStl;
    } catch (compileError) {
      openScadPromise = null;
      setCompileStatus("failed");
      setStl(null);
      setError(compileError instanceof Error ? compileError.message : "OpenSCAD WASM 编译失败。");
      return null;
    }
  }, [code]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    setCompileNote(null);
    setCompileStatus("compiling");

    try {
      const result = await api.cadamGenerate({
        prompt,
        parameters: spec,
      });
      const nextSpec = {
        ...inferSpec(prompt, spec),
        name: result.name || spec.name,
        width: Number(result.parameters.width ?? spec.width),
        height: Number(result.parameters.height ?? spec.height),
        depth: Number(result.parameters.depth ?? spec.depth),
        thickness: Number(result.parameters.thickness ?? spec.thickness),
        holeDiameter: Number(
          result.parameters.holeDiameter ?? result.parameters.hole_diameter ?? spec.holeDiameter,
        ),
        teeth: Number(result.parameters.teeth ?? spec.teeth),
      };

      setSpec(nextSpec);
      const stableScad = scadForSpec(nextSpec);
      const aiScad = typeof result.scad === "string" ? result.scad : "";
      const candidateScad = looksLikeScad(aiScad) ? aiScad : stableScad;
      setCode(candidateScad);
      setGeneratorMeta(`${result.provider.toUpperCase()} · ${result.model} · 参数化内核`);
      const compiled = await compileScad(candidateScad);
      if (!compiled && candidateScad !== stableScad) {
        setCode(stableScad);
        setGeneratorMeta(`${result.provider.toUpperCase()} · ${result.model} · 已回退本地内核`);
        await compileScad(stableScad);
        setCompileNote("AI 已返回 OpenSCAD，但该代码未通过本地 WASM 编译，已回退到同参数的稳定 CAD 内核。");
      } else {
        setCompileNote("AI 已生成参数化 OpenSCAD，并已通过本地 WASM 编译，可预览和导出 STL。");
      }
    } catch (generateError) {
      const fallbackSpec = inferSpec(prompt, spec);
      const stableScad = scadForSpec(fallbackSpec);
      setSpec(fallbackSpec);
      setCode(stableScad);
      setGeneratorMeta("本地参数化内核");
      await compileScad(stableScad);
      setCompileNote("大模型接口暂不可用，已根据文本和参数使用本地 CAD 内核生成可编译模型。");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateSpec = (key: keyof CadSpec, value: number) => {
    setSpec((current) => {
      const next = { ...current, [key]: value };
      setCode(scadForSpec(next));
      setGeneratorMeta("参数本地预览");
      setCompileStatus("stale");
      setCompileNote(null);
      return next;
    });
  };

  const reset = () => {
    setPrompt(examples[0]);
    setSpec(initialSpec);
    setCode(scadForSpec(initialSpec));
    setStl(null);
    setGeneratorMeta("OpenAI-compatible");
    setCompileStatus("idle");
    setError(null);
    setCompileNote(null);
  };

  const downloadScad = () => {
    downloadTextFile(`${spec.name}.scad`, code, "text/plain;charset=utf-8");
  };

  const compilePreview = async () => {
    const rendered = await compileScad();
    if (rendered) {
      return;
    }

    const repairedScad = scadForSpec(spec);
    setCode(repairedScad);
    setGeneratorMeta("参数化内核 · 已自动修复");
    await compileScad(repairedScad);
    setCompileNote("当前 OpenSCAD 未通过 WASM 编译，已自动切换为同参数的稳定 CAD 内核代码。");
  };

  const downloadStl = async () => {
    let renderedStl = stl ?? (await compileScad());
    if (!renderedStl) {
      const repairedScad = scadForSpec(spec);
      setCode(repairedScad);
      setGeneratorMeta("参数化内核 · 已自动修复");
      renderedStl = await compileScad(repairedScad);
      setCompileNote("当前 OpenSCAD 未通过 WASM 编译，已自动切换为同参数的稳定 CAD 内核代码。");
    }
    if (renderedStl) {
      downloadTextFile(`${spec.name}.stl`, renderedStl, "model/stl;charset=utf-8");
    }
  };

  React.useEffect(() => {
    if (!isPreviewFullscreen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPreviewFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewFullscreen]);

  const previewScene = (fullscreen = false) =>
    stl ? (
      <Canvas camera={{ position: fullscreen ? [3.2, 2.6, 3.8] : [2.8, 2.2, 3.3], fov: fullscreen ? 36 : 42 }} shadows>
        <color attach="background" args={["#111518"]} />
        <ambientLight intensity={0.74} />
        <directionalLight position={[4, 5, 4]} intensity={2.2} castShadow />
        <pointLight position={[-3, 2, -2]} intensity={0.9} color="#8dd6c2" />
        <CompiledMesh stl={stl} />
        <ContactShadows position={[0, -1.08, 0]} opacity={0.34} scale={5.6} blur={2.2} />
        <OrbitControls enablePan={false} minDistance={2.2} maxDistance={fullscreen ? 8 : 6} />
      </Canvas>
    ) : (
      <EmptyPreview status={compileStatus} />
    );

  return (
    <section className="cadam-workbench" aria-label="CADAM AI 生成 CAD 工作台">
      <div className="cadam-workbench-top">
        <div>
          <p>CADAM AI 生成 CAD</p>
          <span>Text-to-CAD、OpenSCAD WASM 编译、真实网格预览与 STL 导出</span>
        </div>
        <div className="cadam-status">
          {compileStatus === "compiling" ? <Loader2 size={15} /> : <Sparkles size={15} />}
          <span>{compileStatus === "ready" ? "真实 STL 网格" : "OpenSCAD WASM"}</span>
        </div>
      </div>

      <div className="cadam-layout">
        <aside className="cadam-panel cadam-prompt-panel">
          <div className="cadam-section-heading">
            <Braces size={18} />
            <div>
              <p>自然语言需求</p>
              <span>输入零件、尺寸、孔位和制造约束</span>
            </div>
          </div>

          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} />

          <div className="cadam-params">
            {[
              ["宽度", "width", 40, 180],
              ["高度", "height", 30, 160],
              ["深度", "depth", 4, 110],
              ["厚度", "thickness", 2, 20],
              ["孔径", "holeDiameter", 3, 36],
              ["齿数", "teeth", 12, 72],
            ].map(([label, key, min, max]) => (
              <label key={key} className="cadam-param">
                <span>
                  {label}
                  <strong>{spec[key as keyof CadSpec]}mm</strong>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={Number(spec[key as keyof CadSpec])}
                  onChange={(event) => updateSpec(key as keyof CadSpec, Number(event.target.value))}
                />
              </label>
            ))}
          </div>

          <div className="cadam-action-row">
            <button className="cadam-primary-action" type="button" onClick={generate} disabled={isGenerating}>
              {isGenerating ? <Loader2 size={17} /> : <Play size={17} />}
              生成并编译
            </button>
            <button className="cadam-ghost-action" type="button" onClick={reset}>
              <RotateCcw size={16} />
              重置
            </button>
          </div>

          {error ? (
            <div className="cadam-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          {compileNote ? (
            <div className="cadam-note" role="status">
              <Sparkles size={16} />
              <span>{compileNote}</span>
            </div>
          ) : null}

          <div className="cadam-panel cadam-code-panel">
            <div className="cadam-code-header">
              <div>
                <FileCode2 size={18} />
                <span>OpenSCAD 输出</span>
              </div>
              <div>
                <button type="button" onClick={() => navigator.clipboard.writeText(code)}>
                  <Clipboard size={15} />
                  复制
                </button>
                <button type="button" onClick={compilePreview} disabled={compileStatus === "compiling"}>
                  {compileStatus === "compiling" ? <Loader2 size={15} /> : <Box size={15} />}
                  编译预览
                </button>
                <button type="button" onClick={downloadScad}>
                  <Download size={15} />
                  SCAD
                </button>
                <button type="button" onClick={downloadStl} disabled={compileStatus === "compiling"}>
                  <Download size={15} />
                  STL
                </button>
              </div>
            </div>
            <textarea
              className="cadam-code-editor"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setCompileStatus("stale");
              }}
              spellCheck={false}
            />
          </div>
        </aside>

        <section className="cadam-preview-column">
          <div className="cadam-panel cadam-preview-panel">
            <div className="cadam-preview-header">
              <div>
                <p>{spec.name}</p>
                <span>
                  {spec.width} x {spec.height} x {spec.depth} mm · {generatorMeta}
                </span>
              </div>
              <button
                className="cadam-preview-expand"
                type="button"
                onClick={() => setIsPreviewFullscreen(true)}
                aria-label="全屏预览"
              >
                <Maximize2 size={17} />
              </button>
            </div>
            <div className="cadam-canvas-shell">
              {previewScene()}
            </div>
          </div>
        </section>
      </div>

      {isPreviewFullscreen ? (
        <div className="cadam-fullscreen-preview" role="dialog" aria-modal="true" aria-label="CAD 全屏预览">
          <div className="cadam-fullscreen-top">
            <div>
              <p>{spec.name}</p>
              <span>
                {spec.width} x {spec.height} x {spec.depth} mm · {generatorMeta}
              </span>
            </div>
            <button type="button" onClick={() => setIsPreviewFullscreen(false)} aria-label="关闭全屏预览">
              <X size={18} />
            </button>
          </div>
          <div className="cadam-fullscreen-canvas">{previewScene(true)}</div>
        </div>
      ) : null}
    </section>
  );
}
