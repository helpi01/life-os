// Динамические инсайты Life OS: алгоритмические, без ИИ, работают офлайн.
// Чистый TypeScript без React, без сетевых вызовов.

import type { Tx, FoodEntry, Workout, Habit, Task } from './data'
import type { BadLog } from './badHabits'

// --- Локальные типы для SleepEntry (из App.tsx) ---
export type SleepEntry = { id: number; date: string; bed: number; woke: number }

// --- Входные данные для генерации инсайтов ---
export interface InsightsInput {
  txs: Tx[]
  food: FoodEntry[]
  workouts: Workout[]
  habits: Habit[]
  sleepLog: SleepEntry[]
  mood: Record<string, number> // date -> 1..5
  badLogs: BadLog[]
  tasks: Task[]
}

// --- Вспомогательные функции для дат ---
function todayISO(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function parseDate(d: string): Date {
  return new Date(d + 'T00:00:00')
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = parseDate(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = (now.getTime() - d.getTime()) / 86400000
  return diff >= 0 && diff <= days
}

function sumBy<T>(arr: T[], key: (t: T) => number): number {
  return arr.reduce((s, t) => s + (key(t) || 0), 0)
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  return arr.reduce((acc, t) => {
    const k = key(t)
    ;(acc[k] ||= []).push(t)
    return acc
  }, {} as Record<string, T[]>)
}

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// --- Основная функция генерации инсайтов ---
export function generateInsights(input: InsightsInput): string[] {
  const insights: string[] = []
  const now = todayISO()
  const last7 = (arr: any[], dateKey: keyof any) => arr.filter(d => isWithinDays(d[dateKey] as string, 7))
  const last14 = (arr: any[], dateKey: keyof any) => arr.filter(d => isWithinDays(d[dateKey] as string, 14))

  // 1. Топ-категория расходов за 7 дней
  const recentTxs = last7(input.txs, 'date')
  if (recentTxs.length >= 3) {
    const byCat = groupBy(recentTxs, t => t.cat)
    let topCat = ''
    let topSum = 0
    let total = 0
    for (const [cat, items] of Object.entries(byCat)) {
      const s = sumBy(items, t => t.amount)
      total += s
      if (s > topSum) { topSum = s; topCat = cat }
    }
    if (topCat && total > 0) {
      const share = Math.round((topSum / total) * 100)
      insights.push(`Топ трата за 7 дней: ${topCat} — ${share}% от всех расходов (${topSum} ₽)`)
    }
  }

  // 2. Сон: среднее < 7 ч и связь со срывами
  const recentSleep = last14(input.sleepLog, 'date')
  if (recentSleep.length >= 3) {
    const durations = recentSleep.map(s => {
      const bed = s.bed || 0
      const woke = s.woke || 0
      // bed/woke — часы от полуночи (0-24). Если woke < bed — переходит через полночь
      let h = woke - bed
      if (h < 0) h += 24
      return h
    }).filter(h => h > 0 && h < 16) // адекватные значения

    if (durations.length >= 3) {
      const avgSleep = avg(durations)
      if (avgSleep < 7) {
        insights.push(`Спишь в среднем ${avgSleep.toFixed(1)} ч/ночь — меньше нормы 7 ч`)

        // Дни с сном < 6 ч
        const shortSleepDays = recentSleep
          .filter(s => {
            const bed = s.bed || 0, woke = s.woke || 0
            let h = woke - bed
            if (h < 0) h += 24
            return h > 0 && h < 6
          })
          .map(s => s.date)

        if (shortSleepDays.length > 0) {
          // Считаем badLogs в эти дни
          let badCountShort = 0
          let badCountNormal = 0
          const shortSet = new Set(shortSleepDays)

          for (const log of input.badLogs) {
            const counts = Object.values(log.counts).reduce((a, b) => a + b, 0)
            if (shortSet.has(log.date)) badCountShort += counts
            else if (isWithinDays(log.date, 14)) badCountNormal += counts
          }

          const shortDays = shortSleepDays.length
          const normalDays = Math.max(1, recentSleep.length - shortDays)
          const avgBadShort = badCountShort / shortDays
          const avgBadNormal = badCountNormal / normalDays

          if (avgBadShort > avgNormal * 1.5 && avgBadShort > 0) {
            insights.push(`После ночей <6 ч срывов привычек в ${avgBadShort.toFixed(1)}× больше (${shortDays} таких ночей за 2 недели)`)
          }
        }
      }
    }
  }

  // 3. Пропуск тренировок: 7 дней без тренировок
  const recentWorkouts = last7(input.workouts, 'date')
  if (recentWorkouts.length === 0 && input.workouts.length > 0) {
    // Есть тренировки вообще, но за последние 7 дней — ноль
    insights.push('Нет тренировок 7 дней подряд — верни режим, даже 15 мин важны')
  } else if (recentWorkouts.length === 0 && input.workouts.length === 0) {
    // Тренировок никогда не было — не выдаём инсайт (мало данных)
  } else if (recentWorkouts.length < 2 && input.workouts.length >= 3) {
    insights.push(`Только ${recentWorkouts.length} тренировка(и) за 7 дней — цель: минимум 3 в неделю`)
  }

  // 4. Привычки: процент выполненных за день, лучший стрик
  if (input.habits.length >= 3) {
    const doneToday = input.habits.filter(h => h.done).length
    const totalHabits = input.habits.length
    const pct = Math.round((doneToday / totalHabits) * 100)
    const bestStreak = Math.max(...input.habits.map(h => h.streak || 0), 0)

    if (pct === 100) {
      insights.push(`Привычки сегодня: ${pct}% выполнено — идеальный день! 🔥`)
    } else if (pct >= 70) {
      insights.push(`Привычки сегодня: ${pct}% выполнено (${doneToday}/${totalHabits})`)
    } else if (totalHabits > 0) {
      insights.push(`Привычки сегодня: ${pct}% — попробуй закрыть хотя бы ещё одну`)
    }

    if (bestStreak >= 7) {
      insights.push(`Лучший стрик: ${bestStreak} дней подряд — серия не срывается!`)
    } else if (bestStreak >= 3) {
      insights.push(`Текущий лучший стрик: ${bestStreak} дня — держи темп`)
    }
  }

  // 5. Выполнение задач: доля выполненных из всех
  if (input.tasks.length >= 3) {
    const doneTasks = input.tasks.filter(t => t.done).length
    const totalTasks = input.tasks.length
    const pct = Math.round((doneTasks / totalTasks) * 100)
    insights.push(`Задачи: выполнено ${doneTasks} из ${totalTasks} (${pct}%)`)
  }

  // 6. Расходы vs прошлая неделя (рост/падение в %)
  const thisWeekTxs = last7(input.txs, 'date')
  const prevWeekTxs = input.txs.filter(t => {
    const d = parseDate(t.date)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const diff = (now.getTime() - d.getTime()) / 86400000
    return diff > 7 && diff <= 14
  })
  if (thisWeekTxs.length >= 2 && prevWeekTxs.length >= 2) {
    const thisSum = sumBy(thisWeekTxs, t => t.amount)
    const prevSum = sumBy(prevWeekTxs, t => t.amount)
    if (prevSum > 0) {
      const diffPct = Math.round(((thisSum - prevSum) / prevSum) * 100)
      if (diffPct > 10) {
        insights.push(`Расходы выросли на ${diffPct}% vs прошлая неделя (${thisSum} vs ${prevSum} ₽)`)
      } else if (diffPct < -10) {
        insights.push(`Расходы снизились на ${Math.abs(diffPct)}% vs прошлая неделя (${thisSum} vs ${prevSum} ₽) — хорошо!`)
      }
    }
  }

  // 7. Настроение: average и связь с тренировками/сном
  const recentMood = Object.entries(input.mood).filter(([d]) => isWithinDays(d, 14))
  if (recentMood.length >= 4) {
    const moodVals = recentMood.map(([, v]) => v)
    const avgMood = avg(moodVals)
    insights.push(`Среднее настроение за 2 недели: ${avgMood.toFixed(1)}/5`)

    // Дни с тренировкой
    const workoutDays = new Set(input.workouts.filter(w => isWithinDays(w.date, 14)).map(w => w.date))
    const moodWithWorkout = recentMood.filter(([d]) => workoutDays.has(d)).map(([, v]) => v)
    const moodWithoutWorkout = recentMood.filter(([d]) => !workoutDays.has(d)).map(([, v]) => v)

    if (moodWithWorkout.length >= 2 && moodWithoutWorkout.length >= 2) {
      const avgWith = avg(moodWithWorkout)
      const avgWithout = avg(moodWithoutWorkout)
      if (avgWith > avgWithout + 0.3) {
        insights.push(`В дни тренировок настроение выше: ${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}`)
      }
    }

    // Дни с хорошим сном (>=7.5 ч)
    const goodSleepDays = new Set(
      input.sleepLog
        .filter(s => isWithinDays(s.date, 14))
        .filter(s => {
          const bed = s.bed || 0, woke = s.woke || 0
          let h = woke - bed
          if (h < 0) h += 24
          return h >= 7.5
        })
        .map(s => s.date)
    )
    const moodGoodSleep = recentMood.filter(([d]) => goodSleepDays.has(d)).map(([, v]) => v)
    const moodBadSleep = recentMood.filter(([d]) => !goodSleepDays.has(d)).map(([, v]) => v)

    if (moodGoodSleep.length >= 2 && moodBadSleep.length >= 2) {
      const avgGood = avg(moodGoodSleep)
      const avgBad = avg(moodBadSleep)
      if (avgGood > avgBad + 0.3) {
        insights.push(`После сна 7.5+ ч настроение лучше: ${avgGood.toFixed(1)} vs ${avgBad.toFixed(1)}`)
      }
    }
  }

  // Ограничиваем до 5 инсайтов, обрезаем длину
  return insights.slice(0, 5).map(s => s.length > 90 ? s.slice(0, 87) + '…' : s)
}