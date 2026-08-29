// Модуль вредных привычек: отказ от курения и других срывов.
// Логика: считаем срывы по дням (сколько выкурил/съел), стрики «чистых дней» и краткую статистику.
export type BadHabit = { id: number; name: string; limit: number }
export type BadLog = { date: string; counts: Record<string, number> }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayISO = () => iso(new Date())
export const daysAgoISO = (n: number) => iso(new Date(Date.now() - n * 86400000))

// последние 7 дат (сегодня последняя), для мини-статистики
export function last7Dates(): string[] {
  const out: string[] = []
  for (let i = 6; i >= 0; i--) out.push(daysAgoISO(i))
  return out
}

export function countOn(logs: BadLog[], habitId: number, date: string): number {
  const entry = logs.find(l => l.date === date)
  return entry ? entry.counts[habitId] || 0 : 0
}

export function addCount(logs: BadLog[], habitId: number, date: string, delta: number): BadLog[] {
  const entry = logs.find(l => l.date === date)
  if (entry) {
    return logs.map(l =>
      l.date === date ? { ...l, counts: { ...l.counts, [habitId]: Math.max(0, (l.counts[habitId] || 0) + delta) } } : l
    )
  }
  return [...logs, { date, counts: { [habitId]: Math.max(0, delta) } }]
}

export function dayLabel(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  return days[d.getDay()] + ' ' + d.getDate()
}

// Награды и штрафы (XP)
export const BAD_XP = {
  saved: 2, // нажал «не выкурил» — сберёг стик
  smoke: 3, // выкурил сверх лимита — штраф (снимается)
  cleanDay: 20, // завершил день без срывов — бонус утром
}