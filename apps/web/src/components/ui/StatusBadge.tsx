import type { JobStatus } from "@3dagent/shared";

const labels: Record<JobStatus, string> = {
  queued: "排队中",
  running: "生成中",
  postprocessing: "后处理",
  completed: "已完成",
  failed: "失败",
};

const styles: Record<JobStatus, string> = {
  queued: "bg-black/[0.06] text-[#4d4a44]",
  running: "bg-[#20766f]/12 text-[#14534e]",
  postprocessing: "bg-[#c77a2f]/14 text-[#8b4d17]",
  completed: "bg-emerald-600/14 text-emerald-800",
  failed: "bg-red-600/12 text-red-700",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
