// Дневные лимиты XP: защита от «фарма» повторяющимися действиями.
// Каждый ключ действия имеет дневной кэп; сверх лимита XP не начисляется.
export function xpGain(
  setXp: (fn: (x: number) => number) => void,
  amount: number,
  key: string,
  cap: number
) {
  const today = new Date().toISOString().slice(0, 10)
  let d: { day: string; counts: Record<string, number> } = { day: '', counts: {} }
  try {
    const raw = localStorage.getItem('lifeos:xp_daily')
    if (raw) d = JSON.parse(raw)
  } catch { /* ignore */ }
  if (!d || d.day !== today) d = { day: today, counts: {} }
  const used = d.counts[key] || 0
  const grant = Math.max(0, Math.min(amount, cap - used))
  if (grant <= 0) return
  d.counts[key] = used + grant
  localStorage.setItem('lifeos:xp_daily', JSON.stringify(d))
  setXp(x => x + grant)
}

export const XP_CAPS = { habit: 50, task: 100, food: 60, workout: 100 }