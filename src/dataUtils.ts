export type BackupData = Record<string, unknown>;

const PREFIX = 'lifeos:';

export function collectBackup(): BackupData {
  const result: BackupData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || !key.startsWith(PREFIX)) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (raw === null) {
      continue;
    }
    try {
      result[key] = JSON.parse(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

export function applyBackup(data: BackupData): void {
  for (const [key, value] of Object.entries(data)) {
    try {
      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch {
        serialized = String(value);
      }
      localStorage.setItem(key, serialized);
    } catch {
      // ignore per-entry errors so one failure does not break the rest
    }
  }
}

export function downloadBackup(): void {
  const json = JSON.stringify(collectBackup());
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'life-os-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBackupFile(text: string): BackupData {
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Неверный формат файла');
  }
  return parsed as BackupData;
}

export function bmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) {
    return 0;
  }
  return Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10;
}

export function weightTrend(log: { date: string; value: number }[]): { d: string; v: number }[] {
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((entry) => {
    const [year, month, day] = entry.date.split('-');
    return { d: `${day}.${month}`, v: entry.value };
  });
}

export function calorieProgress(todayKcal: number, goal: number): number {
  if (goal <= 0) {
    return 0;
  }
  return Math.round((todayKcal / goal) * 100);
}
