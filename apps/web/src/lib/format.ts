const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unitIndex]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}