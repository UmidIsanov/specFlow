import { randomUUID } from "node:crypto";

/**
 * Фоновые задачи импорта: распознавание скана идёт минуты, и пользователь должен
 * видеть, что именно происходит и сколько осталось, а не смотреть на кнопку.
 */
export type JobProgress = {
  stage: string; // что делаем сейчас — человеческим языком
  done: number; // сколько шагов сделано
  total: number; // сколько всего (0 — неизвестно, крутим неопределённо)
};

export type Job = {
  id: string;
  status: "running" | "done" | "error";
  progress: JobProgress;
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
};

const jobs = new Map<string, Job>();
const TTL_MS = 30 * 60 * 1000;

export function createJob(stage: string): Job {
  const job: Job = { id: randomUUID(), status: "running", progress: { stage, done: 0, total: 0 }, startedAt: Date.now() };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function setProgress(job: Job, progress: Partial<JobProgress>) {
  job.progress = { ...job.progress, ...progress };
}

/** Запускает работу в фоне; результат или ошибка ложатся в задачу, старые задачи чистятся. */
export function runJob<T>(job: Job, work: (report: (p: Partial<JobProgress>) => void) => Promise<T>) {
  work((p) => setProgress(job, p))
    .then((result) => {
      job.status = "done";
      job.result = result;
      job.finishedAt = Date.now();
    })
    .catch((err: unknown) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = Date.now();
    })
    .finally(() => {
      const now = Date.now();
      for (const [id, j] of jobs) if (j.finishedAt && now - j.finishedAt > TTL_MS) jobs.delete(id);
    });
}
