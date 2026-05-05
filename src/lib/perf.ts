const perfLogsEnabled =
  process.env.NODE_ENV !== "production" || process.env.AICARE_PERF_LOGS === "1";

export async function measureAsync<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!perfLogsEnabled) return work();

  const start = performance.now();
  try {
    return await work();
  } finally {
    const duration = performance.now() - start;
    console.info(`[perf] ${label}: ${duration.toFixed(1)}ms`);
  }
}

export function measureSync<T>(label: string, work: () => T): T {
  if (!perfLogsEnabled) return work();

  const start = performance.now();
  try {
    return work();
  } finally {
    const duration = performance.now() - start;
    console.info(`[perf] ${label}: ${duration.toFixed(1)}ms`);
  }
}
