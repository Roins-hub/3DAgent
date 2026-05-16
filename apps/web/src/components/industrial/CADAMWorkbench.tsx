"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  AlertCircle,
  Box,
  Braces,
  Clipboard,
  Download,
  FileDown,
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

type ModelKind = "bracket" | "enclosure" | "gear" | "flange" | "screw";

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
type CadamMode = "openscad" | "paramcad";

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
const OPENSCAD_INIT_TIMEOUT_MS = 20_000;
let openScadPromise: Promise<OpenSCADInstance> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberFromPrompt(prompt: string, fallback: number, index = 0) {
  const matches = prompt.match(/\d+(?:\.\d+)?/g);
  if (!matches?.[index]) return fallback;
  return Number(matches[index]);
}

function fastenerLengthFromPrompt(prompt: string, fallback: number) {
  const lengthMatch = prompt.match(/(?:长度|长|length)\D{0,12}(\d+(?:\.\d+)?)/i);
  if (lengthMatch) {
    return Number(lengthMatch[1]);
  }

  const metricMatch = prompt.match(/\bm\s*\d+(?:\.\d+)?(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?/i);
  if (metricMatch?.[1]) {
    return Number(metricMatch[1]);
  }

  return fallback;
}

function inferSpec(prompt: string, current: CadSpec): CadSpec {
  const normalized = prompt.toLowerCase();
  const hasGear = /齿轮|gear/.test(normalized);
  const hasFlange = /法兰|flange|连接盘/.test(normalized);
  const hasEnclosure = /外壳|盒|壳体|enclosure|case/.test(normalized);
  const hasScrew =
    /螺钉|螺丝|螺栓|内六角|socket|screw|bolt|cap screw/.test(normalized) ||
    /\bm\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+/i.test(prompt);
  const metricMatch = prompt.match(/\bm\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?/i);
  const metricDiameter = metricMatch ? Number(metricMatch[1]) : numberFromPrompt(prompt, 6, 0);
  const metricLength = fastenerLengthFromPrompt(prompt, numberFromPrompt(prompt, 20, 1));
  const kind: ModelKind = hasScrew
    ? "screw"
    : hasGear
      ? "gear"
      : hasFlange
        ? "flange"
        : hasEnclosure
          ? "enclosure"
          : "bracket";

  if (kind === "screw") {
    const diameter = clamp(metricDiameter, 2, 24);
    const length = clamp(metricLength, 6, 120);
    const headDiameter = clamp(diameter * 1.65, diameter * 1.35, diameter * 2.2);
    const headHeight = clamp(diameter, 2.5, 24);

    return {
      ...current,
      kind,
      name: `m${String(diameter).replace(".", "_")}_socket_head_screw`,
      width: length,
      height: headDiameter,
      depth: headHeight,
      thickness: diameter,
      holeDiameter: clamp(diameter * 0.62, 1.5, 18),
      cornerRadius: clamp(diameter * 0.12, 0.4, 3),
    };
  }

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
  if (spec.kind === "screw") {
    return `module ${spec.name}(length=${spec.width}, head_d=${spec.height}, head_h=${spec.depth}, shaft_d=${spec.thickness}, socket_d=${spec.holeDiameter}) {
  difference() {
    union() {
      cylinder(d=head_d, h=head_h, $fn=96);
      translate([0, 0, -length])
        cylinder(d=shaft_d, h=length, $fn=72);
      translate([0, 0, -length])
        cylinder(d=shaft_d * 0.88, h=length, $fn=18);
    }
    translate([0, 0, head_h * 0.38])
      cylinder(d=socket_d, h=head_h, $fn=6);
    translate([0, 0, head_h - 0.35])
      cylinder(d1=head_d * 0.92, d2=head_d * 0.84, h=0.6, $fn=96);
  }
}

${spec.name}();`;
  }

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
  openScadPromise ??= withTimeout(
    import("openscad-wasm").then(async ({ createOpenSCAD }) => createOpenSCAD()),
    OPENSCAD_INIT_TIMEOUT_MS,
    "OpenSCAD WASM 初始化超时，请刷新页面后重试。",
  );
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

function isOpenScadConsoleError(args: unknown[]) {
  const message = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" ");
  return /\[OpenSCAD Error\]|Parser error|syntax error|input\.scad/i.test(message);
}

async function withoutOpenScadConsoleOverlay<T>(task: () => Promise<T>) {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (isOpenScadConsoleError(args)) {
      return;
    }
    originalConsoleError(...args);
  };

  try {
    return await task();
  } finally {
    console.error = originalConsoleError;
  }
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
  const [mode, setMode] = React.useState<CadamMode>("openscad");
  const [prompt, setPrompt] = React.useState(examples[0]);
  const [spec, setSpec] = React.useState<CadSpec>(initialSpec);
  const [code, setCode] = React.useState(() => scadForSpec(initialSpec));
  const [stl, setStl] = React.useState<string | null>(null);
  const [paramcadResult, setParamcadResult] = React.useState<Awaited<ReturnType<typeof api.paramcadRun>> | null>(null);
  const [runFea, setRunFea] = React.useState(true);
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
      const renderedStl = await withoutOpenScadConsoleOverlay(() =>
        withTimeout(
          openScad.renderToStl(source),
          OPENSCAD_COMPILE_TIMEOUT_MS,
          "OpenSCAD WASM 编译超时，请简化代码或检查几何结构。",
        ),
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
    setParamcadResult(null);

    try {
      if (mode === "paramcad") {
        const result = await api.paramcadRun({ requirement: prompt, runFea });
        setParamcadResult(result);
        setGeneratorMeta(`${result.provider} · ${result.model}`);
        setCompileStatus("ready");
        setCompileNote("工程 CAD 流水线已完成，可查看优化参数、FEA 指标并下载 STEP 文件。");
        return;
      }

      const result = await api.cadamGenerate({
        prompt,
        parameters: spec,
      });
      const inferredSpec = inferSpec(prompt, spec);
      const nextSpec = inferredSpec.kind === "screw" ? {
        ...inferredSpec,
        name: result.name && /screw|bolt|螺/.test(result.name) ? result.name : inferredSpec.name,
        width: Number(result.parameters.width ?? inferredSpec.width),
        height: Number(result.parameters.height ?? inferredSpec.height),
        depth: Number(result.parameters.depth ?? inferredSpec.depth),
        thickness: Number(result.parameters.thickness ?? inferredSpec.thickness),
        holeDiameter: Number(
          result.parameters.holeDiameter ?? result.parameters.hole_diameter ?? inferredSpec.holeDiameter,
        ),
      } : {
        ...inferredSpec,
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
      if (compiled) {
        setCompileNote("已生成参数化 OpenSCAD，并通过本地 WASM 编译，可预览和导出 STL。");
      } else if (candidateScad !== stableScad) {
        setCode(stableScad);
        setGeneratorMeta(`${result.provider.toUpperCase()} · ${result.model} · 已回退本地内核`);
        const fallbackCompiled = await compileScad(stableScad);
        setCompileNote(
          fallbackCompiled
            ? "已自动切换为同参数的稳定 CAD 内核，并通过本地 WASM 编译，可预览和导出 STL。"
            : "OpenSCAD 未通过本地 WASM 编译，请检查代码或参数。",
        );
      } else {
        setCompileNote(null);
      }
    } catch (generateError) {
      if (mode === "paramcad") {
        setCompileStatus("failed");
        setStl(null);
        setGeneratorMeta("AI-ParamCAD");
        const message = generateError instanceof Error ? generateError.message : "AI-ParamCAD 引擎调用失败。";
        setError(message);
        setCompileNote("AI-ParamCAD 引擎未连接或没有正常响应。请先启动 engines/AI-ParamCAD 服务，再运行工程 CAD。工程 CAD 模式不会回退到 OpenSCAD 本地预览。");
        return;
      }

      const fallbackSpec = inferSpec(prompt, spec);
      const stableScad = scadForSpec(fallbackSpec);
      setSpec(fallbackSpec);
      setCode(stableScad);
      setGeneratorMeta("本地参数化内核");
      const fallbackCompiled = await compileScad(stableScad);
      setCompileNote(
        fallbackCompiled
          ? "大模型接口暂不可用，已根据文本和参数使用本地 CAD 内核生成模型，并通过本地 WASM 编译。"
          : "大模型接口暂不可用，本地 CAD 内核也未通过 WASM 编译，请检查参数。",
      );
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
    setParamcadResult(null);
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
          <span>文本生成 CAD、OpenSCAD 预览、STL 导出与工程 STEP 输出</span>
        </div>
        <div className="cadam-toolbar">
          <div className="cadam-status">
            {compileStatus === "compiling" ? <Loader2 size={15} /> : <Sparkles size={15} />}
            <span>{mode === "paramcad" ? "AI-ParamCAD" : compileStatus === "ready" ? "STL 就绪" : "OpenSCAD WASM"}</span>
          </div>
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

          <div className="cadam-mode-tabs" role="tablist" aria-label="CAD mode">
            <button className={mode === "openscad" ? "active" : ""} type="button" onClick={() => setMode("openscad")}>
              <FileCode2 size={15} />
              <span>OpenSCAD</span>
            </button>
            <button className={mode === "paramcad" ? "active" : ""} type="button" onClick={() => setMode("paramcad")}>
              <FileDown size={15} />
              <span>工程 CAD</span>
            </button>
          </div>

          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} />

          {mode === "paramcad" ? (
            <label className="cadam-fea-toggle">
              <input type="checkbox" checked={runFea} onChange={(event) => setRunFea(event.target.checked)} />
              <span>运行 FEA 校核</span>
            </label>
          ) : null}

          {mode === "openscad" ? <div className="cadam-params">
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
          </div> : null}

          <div className="cadam-action-row">
            <button className="cadam-primary-action" type="button" onClick={generate} disabled={isGenerating}>
              {isGenerating ? <Loader2 size={17} /> : <Play size={17} />}
              {mode === "paramcad" ? "运行工程 CAD" : "生成并编译"}
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

          {mode === "paramcad" ? (
            <div className="cadam-panel paramcad-result-panel">
              <div className="cadam-code-header">
                <div>
                  <FileDown size={18} />
                  <span>AI-ParamCAD 工程结果</span>
                </div>
                {paramcadResult?.stepFile ? (
                  <a href={api.paramcadOutputUrl(paramcadResult.stepFile)} download>
                    <Download size={15} />
                    STEP
                  </a>
                ) : null}
              </div>
              {paramcadResult ? (
                <div className="paramcad-result-grid">
                  <div><span>标题</span><strong>{paramcadResult.title ?? "-"}</strong></div>
                  <div><span>材料</span><strong>{paramcadResult.material ?? "-"}</strong></div>
                  <div><span>几何类型</span><strong>{paramcadResult.geometryType ?? "-"}</strong></div>
                  <div><span>优化分数</span><strong>{paramcadResult.score?.toFixed(1) ?? "-"}</strong></div>
                  <div><span>迭代次数</span><strong>{paramcadResult.iterations ?? "-"}</strong></div>
                  <div><span>安全系数</span><strong>{paramcadResult.safetyFactor?.toFixed(2) ?? "-"}</strong></div>
                  <div><span>最大应力</span><strong>{paramcadResult.maxStress?.toFixed(1) ?? "-"} MPa</strong></div>
                  <div><span>FEA</span><strong>{paramcadResult.feaPassed == null ? "-" : paramcadResult.feaPassed ? "通过" : "未通过"}</strong></div>
                </div>
              ) : (
                <div className="paramcad-empty">运行工程 CAD 流水线后，这里会显示优化参数、FEA 指标和 STEP 下载。</div>
              )}
              {paramcadResult && Object.keys(paramcadResult.parameters).length > 0 ? (
                <div className="paramcad-parameters">
                  {Object.entries(paramcadResult.parameters).map(([key, value]) => (
                    <span key={key}>{key}: {Number(value).toFixed(2)}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
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
          )}
        </aside>

        <section className="cadam-preview-column">
          <div className="cadam-panel cadam-preview-panel">
            <div className="cadam-preview-header">
              <div>
                <p>{mode === "paramcad" ? (paramcadResult?.title ?? "AI-ParamCAD") : spec.name}</p>
                <span>
                  {mode === "paramcad"
                    ? paramcadResult
                      ? `${paramcadResult.material ?? "材料"} / ${paramcadResult.geometryType ?? "几何"} / ${generatorMeta}`
                      : "等待运行工程 CAD 流水线"
                    : `${spec.width} x ${spec.height} x ${spec.depth} mm / ${generatorMeta}`}
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
              {mode === "paramcad" ? (
                <div className="paramcad-preview-summary">
                  <FileDown size={34} />
                  <strong>{paramcadResult?.title ?? "AI-ParamCAD 工程结果"}</strong>
                  <span>{paramcadResult?.stepFile ? "STEP 文件已生成，可下载到 CAD 软件继续编辑。" : "运行后会返回优化参数、FEA 指标和 STEP 文件。"}</span>
                </div>
              ) : previewScene()}
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
