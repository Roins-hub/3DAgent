import {
  Bot,
  Boxes,
  CheckCircle2,
  Cpu,
  Database,
  DraftingCompass,
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
    title: "三维模型生成",
    body: "保留原有三维模型入口，面向家具、文具、工业与文创方向，支持提示词生成、三维预览、历史记录和模型下载。",
    action: "进入三维模型生成",
    stat: "GLB",
    Icon: Boxes,
  },
  {
    href: "/image",
    label: "Industrial Image Studio",
    title: "图片生成",
    body: "保留原有图片生成入口，围绕品类、画幅比例、参考图和生成历史组织图像方案，方便做概念表达与视觉验证。",
    action: "进入图片生成",
    stat: "1:1",
    Icon: ImageIcon,
  },
  {
    href: "/industrial/chili3d",
    label: "Browser CAD Workbench",
    title: "智模Web CAD",
    body: "把 Chili3D 浏览器建模能力整合进平台，支持草图、实体编辑、导入导出和在线检查，适合工程师直接修改与复核 CAD 结构。",
    action: "进入 Web CAD",
    stat: "CAD",
    Icon: DraftingCompass,
  },
  {
    href: "/industrial/cadam",
    label: "AI Parametric CAD",
    title: "智模AI CAD",
    body: "一句工程描述即可进入参数化建模链路，系统会生成 build123d 脚本、导出 STEP 文件，并串联加载页、预览页与历史任务记录。",
    action: "进入 AI CAD",
    stat: "STEP",
    Icon: Bot,
  },
];

const flowOverview = [
  {
    title: "需求输入",
    body: "描述零件类型、尺寸、孔位、倒角、材料或上传参考图。",
  },
  {
    title: "AI 参数化",
    body: "抽取工程约束，生成 build123d 建模脚本并自动修复。",
  },
  {
    title: "CAD 生成",
    body: "输出 STEP 和预览资产，失败时保留错误信息便于重试。",
  },
  {
    title: "Web 复核",
    body: "在智模Web CAD 中打开、检查、编辑并导出交付文件。",
  },
  {
    title: "历史归档",
    body: "记录任务状态、提示词、资产地址与下载入口。",
  },
];

const flowDiagrams = [
  {
    eyebrow: "AI CAD Pipeline",
    title: "智模AI CAD 流程",
    Icon: GitBranch,
    nodes: [
      "自然语言需求解析",
      "尺寸与结构参数抽取",
      "build123d 脚本生成",
      "STEP 文件导出",
      "预览与任务归档",
    ],
  },
  {
    eyebrow: "Web CAD Review",
    title: "智模Web CAD 流程",
    Icon: Layers3,
    nodes: [
      "浏览器端建模入口",
      "草图与实体编辑",
      "导入 STEP/模型资产",
      "结构检查与修订",
      "导出交付文件",
    ],
  },
  {
    eyebrow: "Visual Support",
    title: "图像与三维辅助流程",
    Icon: ScanSearch,
    nodes: [
      "参考图或品类输入",
      "比例与风格约束",
      "三维/图像方案生成",
      "结果预览与对比",
      "下载复用与沉淀",
    ],
  },
];

const capabilityTree = [
  {
    title: "前端工作台",
    items: ["三维模型生成", "图片生成", "智模AI CAD", "智模Web CAD"],
    Icon: Cpu,
  },
  {
    title: "服务编排层",
    items: ["FastAPI 任务接口", "CADAM 路由", "异步状态同步", "历史记录持久化"],
    Icon: Database,
  },
  {
    title: "生成能力层",
    items: ["build123d 脚本", "STEP 导出", "Hunyuan3D", "图片方案生成"],
    Icon: FileCode2,
  },
];

const principles = [
  "统一三维模型、图片生成、Web CAD 与 AI CAD 入口",
  "用可追溯任务历史承接每一次工程生成",
  "优先输出 STEP 等可交付工程资产",
  "让 AI 生成、人工复核和下载归档形成闭环",
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
          <h2 id="workflow-title">从一句需求到可交付 CAD</h2>
          <p>当前项目已经补齐智模AI CAD 的生成、加载、预览与历史链路，并把三维模型生成、图片生成和浏览器端 CAD 工作台一起放回首页入口。</p>
        </Reveal>
        <Reveal className="cad-process-map" delay={0.1}>
          {flowOverview.map((step, index) => (
            <div className="cad-process-step" key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          ))}
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
          <p>首页内容同步当前工程进展：Web CAD 页面、AI CAD 生成入口、预览页、路由测试、后端任务接口和脚本引擎已经成为新的核心能力。</p>
        </Reveal>
        <div className="capability-tree" aria-label="系统能力树">
          <div className="capability-root">
            <Network size={24} />
            <strong>智模CAD 平台</strong>
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
          <h2 id="principles-title">面向 CAD 交付</h2>
          <p>
            首页现在聚焦 CAD 生产链路，用更明确的专业术语解释需求输入、参数化建模、Web 复核、任务记录和资产交付之间的关系。
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
          <h2>进入智模CAD 工作台</h2>
          <div className="apple-hero-actions">
            <PillLink href="/model">打开三维模型生成</PillLink>
            <PillLink href="/industrial/cadam" outline>
              打开智模AI CAD
            </PillLink>
          </div>
        </Reveal>
        <AnimatedClosingMark />
      </section>

      <footer className="apple-footer">
        <div>
          <strong>智模精工</strong>
          <p>面向工业设计的三维模型、图片方案、Web CAD、AI CAD 与工程资产生成平台。</p>
        </div>
        <nav aria-label="页脚产品">
          <Link href="/model">三维模型生成</Link>
          <Link href="/image">图片生成</Link>
          <Link href="/industrial/chili3d">智模Web CAD</Link>
          <Link href="/industrial/cadam">智模AI CAD</Link>
          <Link href="/login">登录</Link>
        </nav>
        <small>2026 智模精工 All rights reserved</small>
      </footer>
    </main>
  );
}
