// Константы и типы данных Life OS.
// Демо-данные убраны: все списки пользователь заполняет сам, они хранятся
// в localStorage браузера (ключи lifeos:*).

export const CATEGORIES = [
  { name: 'Еда', color: '#6366f1' },
  { name: 'Транспорт', color: '#10b981' },
  { name: 'Жильё', color: '#f59e0b' },
  { name: 'Развлечения', color: '#38bdf8' },
  { name: 'Здоровье', color: '#14b8a6' },
  { name: 'Прочее', color: '#f43f5e' },
]

export const MEALS = ['Завтрак', 'Обед', 'Ужин', 'Перекус']

export const TYPES = ['Акция', 'Облигация', 'Фонд']

export const HABIT_META = [
  { icon: 'dumbbell', label: 'Зарядка' },
  { icon: 'book', label: 'Чтение' },
  { icon: 'droplet', label: 'Вода 2 л' },
  { icon: 'sparkles', label: 'Медитация' },
  { icon: 'ban', label: 'Отказ от вредного' },
]

export type Tx = { id: number; name: string; cat: string; amount: number; date: string }
export type Workout = { id: number; name: string; date: string; durMin: number; kcal: number }
export type Habit = { id: number; name: string; icon: string; done: boolean; streak: number }
export type FoodEntry = { id: number; name: string; meal: string; kcal: number; date: string }
export type Task = { id: number; name: string; done: boolean; prio: string }
export type Holding = { id: number; name: string; ticker: string; type: string; price: number; qty: number }
export type Dividend = { id: number; name: string; date: string; amount: number }
export type Quest = { id: number; name: string; total: number }
export type WeightEntry = { id: number; date: string; value: number }