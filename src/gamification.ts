export type Stats = {
  tasksDone: number;
  habitsDone: number;
  habitsStreakBest: number;
  habitsTotal: number;
  workouts: number;
  txs: number;
  savedR: number;
  level: number;
  water: number;
  sleepOk: number;
  steps10k: number;
  cleanBest: number;
  food: number;
};

export const LEVELS: { level: number; name: string; xpFrom: number }[] = [
  { level: 1, name: 'Новичок', xpFrom: 0 },
  { level: 2, name: 'Ученик', xpFrom: 100 },
  { level: 3, name: 'Любитель', xpFrom: 250 },
  { level: 4, name: 'Практик', xpFrom: 450 },
  { level: 5, name: 'Профи', xpFrom: 700 },
  { level: 6, name: 'Эксперт', xpFrom: 1000 },
  { level: 7, name: 'Мастер', xpFrom: 1400 },
  { level: 8, name: 'Легенда', xpFrom: 1900 },
  { level: 9, name: 'Титан', xpFrom: 2500 },
  { level: 10, name: 'Абсолют', xpFrom: 3200 },
];

export function levelFor(xp: number): {
  level: number;
  name: string;
  xpFrom: number;
  nextXp: number;
  pct: number;
} {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (lvl.xpFrom <= xp) {
      current = lvl;
    } else {
      break;
    }
  }

  const isMax = current.level === LEVELS[LEVELS.length - 1].level;
  const nextXp = isMax ? current.xpFrom + 800 : LEVELS[current.level].xpFrom;

  let pct = Math.floor(((xp - current.xpFrom) / (nextXp - current.xpFrom)) * 100);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;

  return {
    level: current.level,
    name: current.name,
    xpFrom: current.xpFrom,
    nextXp,
    pct,
  };
}

export const XPS: Record<
  'taskDone' | 'habitDone' | 'workoutAdded' | 'foodLogged' | 'questCreated' | 'txAdded' | 'smokeSaved' | 'smokeBad' | 'cleanDay' | 'water' | 'sleepOk' | 'stepsDay' | 'mood',
  number
> = {
  taskDone: 15,
  habitDone: 10,
  workoutAdded: 20,
  foodLogged: 5,
  questCreated: 20,
  txAdded: 2,
  smokeSaved: 2,
  smokeBad: 3,
  cleanDay: 20,
  water: 1,
  sleepOk: 15,
  stepsDay: 5,
  mood: 2,
};

export type AchievementDef = {
  id: string;
  name: string;
  icon: 'flame' | 'wallet' | 'calendar' | 'activity' | 'dumbbell' | 'book' | 'crown' | 'star' | 'droplets' | 'bed' | 'footprints' | 'shield' | 'utensils';
  hint: string;
  test: (stats: Stats) => boolean;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-workout',
    name: 'Первая тренировка',
    icon: 'dumbbell',
    hint: 'Запиши первую тренировку в разделе Спорт',
    test: (stats) => stats.workouts >= 1,
  },
  {
    id: 'streak-7',
    name: '7 дней подряд',
    icon: 'flame',
    hint: 'Отмечай привычки 7 дней подряд',
    test: (stats) => stats.habitsStreakBest >= 7,
  },
  {
    id: 'first-week',
    name: 'Первая неделя учёта',
    icon: 'calendar',
    hint: 'Добавь 7 записей расходов',
    test: (stats) => stats.txs >= 7,
  },
  {
    id: 'saved-10k',
    name: 'Доход 10 000 ₽',
    icon: 'wallet',
    hint: 'Внеси доходы (положительные суммы) на 10 000 ₽',
    test: (stats) => stats.savedR >= 10000,
  },
  {
    id: 'habits-3',
    name: '3 привычки в деле',
    icon: 'book',
    hint: 'Создай три привычки',
    test: (stats) => stats.habitsTotal >= 3,
  },
  {
    id: 'level-5',
    name: 'Докачался до Профи',
    icon: 'crown',
    hint: 'Набери 700 XP',
    test: (stats) => stats.level >= 5,
  },
  {
    id: 'tasks-10',
    name: '10 задач выполнено',
    icon: 'activity',
    hint: 'Отметь 10 задач в разделе Планы',
    test: (stats) => stats.tasksDone >= 10,
  },
  {
    id: 'xp-1000',
    name: 'Тысяча опыта',
    icon: 'star',
    hint: 'Набери 1000 XP',
    test: (stats) => stats.level >= 6,
  },
  {
    id: 'water-50',
    name: '50 стаканов воды',
    icon: 'droplets',
    hint: 'Выпей 50 стаканов воды (12,5 л) за всё время',
    test: (stats) => stats.water >= 50,
  },
  {
    id: 'sleep-ok',
    name: 'Сон в норме',
    icon: 'bed',
    hint: 'Выспись 7 дней (7+ часов сна)',
    test: (stats) => stats.sleepOk >= 7,
  },
  {
    id: 'steps-10k',
    name: '10 000 шагов',
    icon: 'footprints',
    hint: 'Пройди 10 000 шагов за один день',
    test: (stats) => stats.steps10k >= 1,
  },
  {
    id: 'clean-7',
    name: 'Неделя без срывов',
    icon: 'shield',
    hint: '7 дней подряд без вредных привычек',
    test: (stats) => stats.cleanBest >= 7,
  },
  {
    id: 'food-30',
    name: '30 записей еды',
    icon: 'utensils',
    hint: 'Запиши еду 30 раз',
    test: (stats) => stats.food >= 30,
  },
];
