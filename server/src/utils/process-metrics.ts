function toRoundedMegabytes(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export interface ProcessMemorySnapshot {
  rssMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

export function captureProcessMemoryUsage(): ProcessMemorySnapshot {
  const usage = process.memoryUsage();
  return {
    rssMb: toRoundedMegabytes(usage.rss),
    heapTotalMb: toRoundedMegabytes(usage.heapTotal),
    heapUsedMb: toRoundedMegabytes(usage.heapUsed),
    externalMb: toRoundedMegabytes(usage.external),
    arrayBuffersMb: toRoundedMegabytes(usage.arrayBuffers),
  };
}

export function formatProcessMemoryUsage(): string {
  const usage = captureProcessMemoryUsage();
  return `rss=${usage.rssMb}MB heapUsed=${usage.heapUsedMb}MB heapTotal=${usage.heapTotalMb}MB external=${usage.externalMb}MB arrayBuffers=${usage.arrayBuffersMb}MB`;
}
