"use client";

import type { GenerationJob } from "@3dagent/shared";
import { create } from "zustand";

interface GenerationState {
  jobs: GenerationJob[];
  activeJobId: string | null;
  setJobs: (jobs: GenerationJob[]) => void;
  upsertJob: (job: GenerationJob) => void;
  setActiveJobId: (jobId: string | null) => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  jobs: [],
  activeJobId: null,
  setJobs: (jobs) =>
    set((state) => ({
      jobs,
      activeJobId: state.activeJobId ?? jobs[0]?.id ?? null,
    })),
  upsertJob: (job) =>
    set((state) => {
      const existing = state.jobs.some((item) => item.id === job.id);
      const jobs = existing
        ? state.jobs.map((item) => (item.id === job.id ? job : item))
        : [job, ...state.jobs];
      return { jobs, activeJobId: state.activeJobId ?? job.id };
    }),
  setActiveJobId: (activeJobId) => set({ activeJobId }),
}));
