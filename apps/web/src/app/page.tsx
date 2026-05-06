import {
  Boxes,
  CheckCircle2,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  Image as ImageIcon,
  Layers3,
  Network,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";
import { AuroraStart } from "@/components/ui/aurora-start";
import { Header } from "@/components/ui/header-2";
import {
  AnimatedClosingMark,
  AnimatedStudioObject,
  Reveal,
} from "@/components/ui/scroll-motion";

const studios = [
  {
    href: "/model",
    label: "Text to 3D Pipeline",
    title: "三维资产生成引擎",
    body: "面向工业设计、文创建模与产品原型场景，提供提示词解析、供应商路由、PBR 材质生成、GLB FBX OBJ 格式交付的完整链路。",
    action: "进入三维生成",
    stat: "GLB",
    Icon: Boxes,
  },
  {
    href: "/image",
    label: "Industrial Image Studio",
    title: "工业图像方案引擎",
    body: "围绕比例控制、方案预览、历史追踪与下载交付组织图像生成过程，让概念表达、视觉验证和迭代管理保持一致。",
    action: "进入图像生成",
    stat: "1比1 16比9",
    Icon: ImageIcon,
  },
];

const flowDiagrams = [
  {
    eyebrow: "Generation Orchestration",
    title: "三维生成编排流程",
    Icon: GitBranch,
    nodes: [
      "提示词语义解析",
      "任务参数标准化",
      "模型供应商适配",
      "异步进度轮询",
      "资产地址回写",
    ],
  },
  {
    eyebrow: "Asset Postprocess",
    title: "资产后处理流程",
    Icon: Layers3,
    nodes: [
      "网格拓扑检查",
      "PBR 材质映射",
      "尺度与原点归一化",
      "格式转换导出",
      "历史版本沉淀",
    ],
  },
  {
    eyebrow: "Image Production",
    title: "图像方案生成流程",
    Icon: ScanSearch,
    nodes: [
      "创意目标输入",
      "画幅比例约束",
      "生成结果预览",
      "方案历史归档",
      "下载与复用",
    ],
  },
];

const capabilityTree = [
  {
    title: "前端工作台",
    items: ["响应式任务入口", "三维预览画布", "图像方案空间", "历史记录面板"],
    Icon: Cpu,
  },
  {
    title: "服务编排层",
    items: ["FastAPI 任务接口", "Provider 路由", "异步状态同步", "配置化密钥管理"],
    Icon: Database,
  },
  {
    title: "模型能力层",
    items: ["Hunyuan3D", "Neural4D", "Meshy Preview", "Mock GPU Worker"],
    Icon: FileCode2,
  },
];

const principles = [
  "统一三维模型与工业图像生成入口",
  "保留任务状态历史与可追溯交付记录",
  "支持多供应商模型服务平滑切换",
  "围绕工程资产格式建立交付闭环",
];

function PillLink({
  href,
  children,
  outline = false,
}: {
  href: string;
  children: React.ReactNode;
  outline?: boolean;
}) {
  return (
    <Link className={outline ? "apple-pill apple-pill--outline" : "apple-pill"} href={href}>
      {children}
    </Link>
  );
}

export default function Home() {
  return (
    <main className="apple-home">
      <Header />
      <AuroraStart />

      <section id="studios" className="studio-tiles" aria-label="工作台入口">
        {studios.map(({ Icon, ...studio }, index) => (
          <article
            className={index === 0 ? "studio-tile studio-tile--dark" : "studio-tile studio-tile--light"}
            key={studio.href}
          >
            <Reveal className="studio-copy" delay={0.04}>
              <span className="studio-icon">
                <Icon size={28} />
              </span>
              <p className="apple-eyebrow">{studio.label}</p>
              <h2>{studio.title}</h2>
              <p>{studio.body}</p>
              <Link href={studio.href} className="apple-text-link">
                {studio.action}
              </Link>
            </Reveal>
            <AnimatedStudioObject
              stat={studio.stat}
              dark={index === 0}
              delay={0.16}
            />
          </article>
        ))}
      </section>

      <section id="workflow" className="apple-tile apple-tile--white workflow-section" aria-labelledby="workflow-title">
        <Reveal className="apple-section-heading">
          <p className="apple-eyebrow">Workflow Architecture</p>
          <h2 id="workflow-title">专业化生成流程</h2>
          <p>平台将自然语言需求拆解为任务编排、模型调用、资产后处理和结果归档，让三维模型与图像方案都具备清晰的工程化路径。</p>
        </Reveal>
        <div className="workflow-grid">
          {flowDiagrams.map(({ Icon, ...diagram }, index) => (
            <Reveal as="article" className="workflow-card workflow-card--diagram" delay={0.12 + index * 0.1} key={diagram.title}>
              <div className="workflow-card-header">
                <span className="workflow-card-icon">
                  <Icon size={20} />
                </span>
                <p>{diagram.eyebrow}</p>
              </div>
              <h3>{diagram.title}</h3>
              <div className="workflow-flow" aria-label={diagram.title}>
                {diagram.nodes.map((node, nodeIndex) => (
                  <div className="workflow-node" key={node}>
                    <span>{String(nodeIndex + 1).padStart(2, "0")}</span>
                    <strong>{node}</strong>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="capability" className="apple-tile apple-tile--parchment capability-section" aria-labelledby="capability-title">
        <Reveal className="apple-section-heading">
          <p className="apple-eyebrow">System Capability Tree</p>
          <h2 id="capability-title">系统能力树</h2>
          <p>当前项目已经形成从前端工作台到服务编排层再到模型能力层的分层结构，便于后续接入自托管 GPU Worker 和更多工业设计流程。</p>
        </Reveal>
        <div className="capability-tree" aria-label="系统能力树">
          <div className="capability-root">
            <Network size={24} />
            <strong>3D Agent Platform</strong>
          </div>
          <div className="capability-branches">
            {capabilityTree.map(({ Icon: BranchIcon, ...branch }, index) => {
              return (
                <Reveal as="article" className="capability-branch" delay={0.12 + index * 0.1} key={branch.title}>
                  <div className="capability-branch-title">
                    <BranchIcon size={19} />
                    <h3>{branch.title}</h3>
                  </div>
                  <ul>
                    {branch.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section id="principles" className="apple-tile apple-tile--dark principles-section" aria-labelledby="principles-title">
        <Reveal className="principles-copy">
          <p className="apple-eyebrow">Design Principles</p>
          <h2 id="principles-title">面向工程交付</h2>
          <p>
            首页现在聚焦工业设计生产链路，用更明确的专业术语解释模型生成、图像方案、任务记录和资产交付之间的关系。
          </p>
        </Reveal>
        <div className="principles-list">
          {principles.map((item, index) => (
            <Reveal delay={0.12 + index * 0.08} key={item}>
              <div>
                <CheckCircle2 size={18} />
                <span>{item}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="apple-tile apple-tile--parchment closing-section">
        <Reveal>
          <p className="apple-eyebrow">Ready</p>
          <h2>进入工业生成工作台</h2>
          <div className="apple-hero-actions">
            <PillLink href="/model">打开三维模型生成</PillLink>
            <PillLink href="/image" outline>
              打开图像方案生成
            </PillLink>
          </div>
        </Reveal>
        <AnimatedClosingMark />
      </section>

      <footer className="apple-footer">
        <div>
          <strong>智模工坊</strong>
          <p>面向工业设计的 AI 三维资产与图像方案生成平台。</p>
        </div>
        <nav aria-label="页脚产品">
          <Link href="/model">三维模型生成</Link>
          <Link href="/image">图像方案生成</Link>
          <Link href="/login">登录</Link>
        </nav>
        <small>2026 智模工坊 All rights reserved</small>
      </footer>
    </main>
  );
}
