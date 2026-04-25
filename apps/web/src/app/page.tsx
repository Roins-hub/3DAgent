import { ArrowRight, Boxes, BrainCircuit, Download, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const steps = [
  "描述模型需求",
  "Agent 规划流程",
  "生成网格与材质",
  "预览、修改、导出",
];

const capabilities = [
  {
    title: "聊天式生成",
    body: "把一句粗略需求整理成可执行的 3D 生成任务。",
    icon: BrainCircuit,
  },
  {
    title: "实时 3D 预览",
    body: "在浏览器里检查比例、轮廓、材质和导出状态。",
    icon: Boxes,
  },
  {
    title: "面向生产流水线",
    body: "接口预留给 Hunyuan3D、TRELLIS 和 Blender 后处理 worker。",
    icon: Download,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden subtle-grid">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#202421] text-[#f7f1e7]">
            <Sparkles size={18} />
          </span>
          <span className="text-base font-bold tracking-tight">Forma Agent</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-[#5b574f] md:flex">
          <a href="#workflow">流程</a>
          <a href="#capabilities">能力</a>
          <Link href="/studio">工作台</Link>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl items-center gap-10 px-5 pb-12 pt-4 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="max-w-[640px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-sm font-semibold text-[#20766f]">
            <span className="h-2 w-2 rounded-full bg-[#20766f]" />
            AI 3D 模型生成工作台
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-[#171817] sm:text-5xl lg:text-[56px] xl:text-[62px]">
            <span className="block">用聊天生成项目级</span>
            <span className="block">3D 模型资产</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#5b574f]">
            输入描述或参考图，Agent 会组织生成流程、展示任务状态，并在网页中预览、修改和导出模型。当前是本地 MVP，后续可替换为真实 GPU 生成服务。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/studio">
              <Button className="w-full sm:w-auto">
                进入工作台 <ArrowRight size={17} />
              </Button>
            </Link>
            <a href="#workflow">
              <Button variant="secondary" className="w-full sm:w-auto">
                查看流程
              </Button>
            </a>
          </div>
        </div>

        <div className="surface relative overflow-hidden rounded-lg p-3">
          <div className="dark-surface overflow-hidden rounded-lg">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">工作台预览</p>
                <p className="text-xs text-white/55">低多边形魔法剑</p>
              </div>
              <span className="rounded-full bg-[#20766f] px-3 py-1 text-xs font-bold text-white">
                84%
              </span>
            </div>
            <div className="grid gap-0 md:grid-cols-[220px_1fr]">
              <div className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
                <div className="mb-4 h-24 rounded-md bg-white/[0.06] p-3 text-xs leading-5 text-white/70">
                  生成一把适合 Unity 的低多边形魔法剑，带琥珀色符文。
                </div>
                <div className="space-y-2">
                  {["网格生成", "PBR 材质", "GLB 导出"].map((item) => (
                    <div
                      className="flex items-center justify-between rounded-md bg-white/[0.06] px-3 py-2 text-xs"
                      key={item}
                    >
                      <span>{item}</span>
                      <span className="text-[#9bc8c1]">就绪</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative min-h-[380px] p-5">
                <div className="absolute inset-5 rounded-lg border border-white/10 bg-[#151815]" />
                <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[28px] border border-[#c77a2f]/50 bg-[#c77a2f]/20 shadow-2xl shadow-[#c77a2f]/20" />
                <div className="absolute bottom-7 left-7 right-7 grid grid-cols-4 gap-2">
                  {[58, 82, 43, 72].map((height, index) => (
                    <span
                      className="rounded-sm bg-white/10"
                      key={index}
                      style={{ height }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="mx-auto max-w-7xl px-5 py-16 md:py-20"
      >
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="mb-2 text-sm font-bold uppercase text-[#20766f]">
              生成流程
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              从一句描述到可下载模型包。
            </h2>
          </div>
          <Link href="/studio" className="hidden md:block">
            <Button variant="dark">打开工作台</Button>
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {steps.map((step, index) => (
            <div className="surface rounded-lg p-5" key={step}>
              <p className="mb-8 text-sm font-bold text-[#c77a2f]">
                0{index + 1}
              </p>
              <h3 className="text-xl font-semibold">{step}</h3>
            </div>
          ))}
        </div>
      </section>

      <section
        id="capabilities"
        className="mx-auto max-w-7xl px-5 pb-20"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {capabilities.map((item) => (
            <article className="surface rounded-lg p-6" key={item.title}>
              <item.icon className="mb-8 text-[#20766f]" size={24} />
              <h3 className="text-xl font-semibold">{item.title}</h3>
              <p className="mt-3 leading-7 text-[#5b574f]">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
