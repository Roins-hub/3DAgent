import {
  ArrowRight,
  Boxes,
  BrainCircuit,
  Download,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const workflows = [
  "输入生成需求",
  "选择 3D 或图片工作台",
  "调用后端 API 生成结果",
  "预览、复用历史、下载资产",
];

const capabilities = [
  {
    title: "3D 模型生成",
    body: "通过腾讯云混元生 3D 国内站接口提交文本生成任务，并在浏览器里预览、导出模型。",
    icon: Boxes,
  },
  {
    title: "免费图片生成",
    body: "通过 Pollinations 免费文生图接口生成图片，后端代理图片流，避免浏览器跨域和重定向问题。",
    icon: ImageIcon,
  },
  {
    title: "任务历史与下载",
    body: "模型和图片各自保留独立历史，方便回看提示词、恢复预览和下载生成资产。",
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
          <Link href="/studio">3D 工作台</Link>
          <Link href="/image">图片生成</Link>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl items-center gap-10 px-5 pb-12 pt-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="max-w-[660px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-sm font-semibold text-[#20766f]">
            <span className="h-2 w-2 rounded-full bg-[#20766f]" />
            AI 资产生成工作台
          </div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-[#171817] sm:text-5xl lg:text-[56px] xl:text-[62px]">
            <span className="block">用一句描述生成</span>
            <span className="block">3D 模型与图片资产</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#5b574f]">
            Forma Agent 现在包含两个独立工作台：3D 模型生成用于创建可导出的
            GLB 资产，图片生成用于快速产出概念图、参考图和视觉素材。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/studio">
              <Button className="w-full sm:w-auto">
                打开 3D 工作台
                <ArrowRight size={17} />
              </Button>
            </Link>
            <Link href="/image">
              <Button variant="secondary" className="w-full sm:w-auto">
                <ImageIcon size={17} />
                打开图片生成
              </Button>
            </Link>
          </div>
        </div>

        <div className="surface relative overflow-hidden rounded-lg p-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="dark-surface overflow-hidden rounded-lg">
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-sm font-semibold">3D 模型工作台</p>
                <p className="text-xs text-white/55">文本到可导出模型</p>
              </div>
              <div className="relative min-h-[360px] p-5">
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

            <div className="dark-surface overflow-hidden rounded-lg">
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-sm font-semibold">图片生成工作台</p>
                <p className="text-xs text-white/55">免费文生图预览</p>
              </div>
              <div className="relative min-h-[360px] p-5">
                <div className="absolute inset-5 rounded-lg border border-white/10 bg-[#101511]" />
                <div className="absolute left-10 top-10 h-28 w-40 rounded-md bg-[#9bc8c1]/70 shadow-2xl shadow-[#9bc8c1]/20" />
                <div className="absolute bottom-12 right-10 h-44 w-36 rounded-md bg-[#c77a2f]/70 shadow-2xl shadow-[#c77a2f]/20" />
                <div className="absolute bottom-20 left-16 right-16 h-20 rounded-[50%] bg-white/10 blur-xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="mb-2 text-sm font-bold uppercase text-[#20766f]">
              生成流程
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              从一句提示词到可下载资产。
            </h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {workflows.map((step, index) => (
            <div className="surface rounded-lg p-5" key={step}>
              <p className="mb-8 text-sm font-bold text-[#c77a2f]">
                0{index + 1}
              </p>
              <h3 className="text-xl font-semibold">{step}</h3>
            </div>
          ))}
        </div>
      </section>

      <section id="capabilities" className="mx-auto max-w-7xl px-5 pb-20">
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
