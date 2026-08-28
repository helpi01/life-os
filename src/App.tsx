import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useArtifactState } from './dsh-sdk-shim'
import {
  LayoutDashboard, Wallet, Dumbbell, Repeat, HeartPulse, Utensils, Sparkles,
  Sun, Moon, Plus, X, TrendingUp, Flame,
  Droplet, BookOpen, Ban, Activity, ArrowUpRight, ArrowDownRight, Brain,
  Camera, ScanLine, Loader2, CheckCircle2, ImagePlus, ListTodo, Target, CalendarDays,
  Settings, Crown, Flag, KeyRound, Eye, EyeOff, Check,
  MessageSquare, LineChart, Landmark, Coins, RefreshCw, Trash2,
  Download, Upload, Star,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, LineChart as RLineChart, Line,
} from 'recharts'
import { CATEGORIES, MEALS, TYPES, HABIT_META } from './data'
import { getAiSettings, chatCompletion, chatVision, chatJson, readFileAsDataUrl, AiNotConfigured, PROMPTS, loadPrompts, savePrompt, resetPrompts, extractJson } from './ai'
import { levelFor, XPS, ACHIEVEMENTS } from './gamification'
import type { Stats } from './gamification'
import { categorySpends } from './budgets'
import type { Budgets } from './budgets'
import { downloadBackup, parseBackupFile, applyBackup, bmi, weightTrend, calorieProgress } from './dataUtils'
import type { Tx, Workout, Habit, FoodEntry, Task, Holding, Dividend, Quest, WeightEntry } from './data'

const NAV = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { id: 'finance', label: 'Финансы', icon: Wallet },
  { id: 'invest', label: 'Инвестиции', icon: LineChart },
  { id: 'sport', label: 'Спорт', icon: Dumbbell },
  { id: 'habits', label: 'Привычки', icon: Repeat },
  { id: 'plans', label: 'Планы', icon: ListTodo },
  { id: 'health', label: 'Здоровье', icon: HeartPulse },
  { id: 'food', label: 'Питание', icon: Utensils },
  { id: 'ai', label: 'ИИ', icon: Sparkles },
]

const habitIcons: Record<string, any> = { dumbbell: Dumbbell, book: BookOpen, droplet: Droplet, sparkles: Sparkles, ban: Ban }
const catColor = (name: string) => (CATEGORIES.find(c => c.name === name) || CATEGORIES[CATEGORIES.length - 1]).color

/* ---------- helpers ---------- */

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.abs(n))
const fmtMoney = (n: number) => (n < 0 ? '−' : '') + fmt(n) + ' ₽'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const monthOf = (iso: string) => iso.slice(0, 7)
const diffDays = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const n = new Date(); n.setHours(0, 0, 0, 0)
  return Math.round((n.getTime() - d.getTime()) / 86400000)
}
const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const diff = diffDays(iso)
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Вчера'
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function monthTrend(txs: Tx[]) {
  const out: { m: string; v: number }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const sum = txs
      .filter(t => {
        const td = new Date(t.date + 'T00:00:00')
        return t.amount < 0 && td >= d && td < next
      })
      .reduce((s, t) => s - t.amount, 0)
    out.push({ m: MONTHS[d.getMonth()], v: Math.round(sum) })
  }
  return out
}

function lastDays(n: number) {
  const arr: { iso: string; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    arr.push({ iso, label: d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '') })
  }
  return arr
}

/* ---------- shared UI ---------- */

function StatCard({ icon: Icon, label, value, sub, tone }: any) {
  return (
    <div className="card stat">
      <div className={`stat-icon ${tone}`}><Icon size={18} /></div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  )
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <p>{text}</p>
      {action}
    </div>
  )
}

type FieldDef = {
  key: string
  label: string
  type?: 'text' | 'number' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
}

function EntryModal({ title, fields, submitLabel, initial, onSubmit, onClose }: {
  title: string
  fields: FieldDef[]
  submitLabel: string
  initial?: Record<string, string>
  onSubmit: (vals: Record<string, string>) => void
  onClose: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(initial || {})
  const set = (k: string, v: string) => setVals(p => ({ ...p, [k]: v }))
  const ready = fields.every(f => (vals[f.key] || '').trim() !== '')
  return (
    <motion.div className="overlay center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="field-stack">
          {fields.map(f => (
            <div key={f.key}>
              <label className="field-label">{f.label}</label>
              {f.type === 'select' ? (
                <select className="select" value={vals[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                  <option value="" disabled>Выбери…</option>
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  className="text-input"
                  type={f.type === 'number' ? 'number' : 'text'}
                  inputMode={f.type === 'number' ? 'decimal' : 'text'}
                  step="any"
                  value={vals[f.key] || ''}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.placeholder || ''}
                />
              )}
            </div>
          ))}
        </div>
        <button className="btn primary full" disabled={!ready} onClick={() => onSubmit(vals)}>{submitLabel}</button>
      </motion.div>
    </motion.div>
  )
}

/* ---------- views ---------- */

const INSIGHTS = [
  'Чем больше записей ты внесёшь, тем точнее будут советы ИИ.',
  'Подключи ИИ в настройках — тогда он начнёт анализировать расходы, питание и тренировки.',
]

const achIcons: Record<string, any> = { flame: Flame, wallet: Wallet, calendar: CalendarDays, activity: Activity, dumbbell: Dumbbell, book: BookOpen, crown: Crown, star: Star }

function Dashboard() {
  const [txs] = useArtifactState('lifeos_tx', [] as Tx[])
  const [food] = useArtifactState('lifeos_food', [] as FoodEntry[])
  const [workouts] = useArtifactState('lifeos_workouts', [] as Workout[])
  const [habits] = useArtifactState('lifeos_habits', [] as Habit[])
  const [quests, setQuests] = useArtifactState('lifeos_quests', [] as Quest[])
  const [tasks] = useArtifactState('lifeos_tasks', [] as Task[])
  const [xp, setXp] = useArtifactState('lifeos_xp', 0)
  const [addQ, setAddQ] = useState(false)

  const today = todayISO()
  const todaySpent = txs.filter(t => t.amount < 0 && t.date === today).reduce((s, t) => s - t.amount, 0)
  const todayKcal = food.filter(f => f.date === today).reduce((s, f) => s + f.kcal, 0)
  const weekWorkouts = workouts.filter(w => diffDays(w.date) < 7)
  const doneHabits = habits.filter(h => h.done).length
  const activityData = lastDays(7).map(day => ({
    day: day.label,
    value: workouts.filter(w => w.date === day.iso).reduce((s, w) => s + w.durMin, 0),
  }))

  const lv = levelFor(xp)
  const stats: Stats = {
    tasksDone: tasks.filter(t => t.done).length,
    habitsDone: doneHabits,
    habitsStreakBest: habits.reduce((m, h) => Math.max(m, h.streak), 0),
    habitsTotal: habits.length,
    workouts: workouts.length,
    txs: txs.length,
    savedR: txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    level: lv.level,
  }
  const unlocked = ACHIEVEMENTS.filter(a => a.test(stats)).map(a => a.id)

  const addQuest = (v: Record<string, string>) => {
    setQuests(q => [...q, { id: Date.now(), name: v.name, total: Math.max(1, Number(v.total) || 1) }])
    setXp(x => x + XPS.questCreated)
    setAddQ(false)
  }

  return (
    <div className="view">
      <div className="hero">
        <div>
          <h1>Привет 👋</h1>
          <p>Сводка за сегодня, {fmtDate(today)}</p>
        </div>
        <div className="hero-ring">
          <svg viewBox="0 0 100 100" width="92" height="92">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--ring-bg)" strokeWidth="10" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#g)" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset="66" transform="rotate(-90 50 50)" />
            <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
          </svg>
          <div className="ring-center"><strong>0%</strong><span>дня</span></div>
        </div>
      </div>

      <div className="card level-card">
        <div className="level-info">
          <div className="level-badge"><Crown size={22} /></div>
          <div className="level-body">
            <div className="level-title"><span>Уровень {lv.level}</span><span className="level-rank">{lv.name}</span></div>
            <div className="xp-bar"><div className="xp-fill" style={{ width: lv.pct + '%' }} /></div>
            <span className="stat-sub">{fmt(xp)} XP · ещё {fmt(Math.max(0, lv.nextXp - xp))} XP до уровня {lv.level + 1}</span>
          </div>
        </div>
        <div className="achievements">
          {ACHIEVEMENTS.map(a => {
            const I = achIcons[a.icon]
            const on = unlocked.includes(a.id)
            return (
              <div key={a.id} className={`ach ${on ? 'on' : ''}`} title={on ? a.name + ' — открыто!' : a.name + ' — ' + a.hint}>
                <I size={18} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid-4">
        <StatCard icon={Wallet} label="Расходы сегодня" value={fmtMoney(todaySpent)} sub="по записям" tone="violet" />
        <StatCard icon={Flame} label="Калории сегодня" value={fmt(todayKcal)} sub="ккал" tone="orange" />
        <StatCard icon={Dumbbell} label="Тренировок на неделе" value={String(weekWorkouts.length)} sub={weekWorkouts.reduce((s, w) => s + w.durMin, 0) + ' мин за неделю'} tone="green" />
        <StatCard icon={Repeat} label="Привычек сделано" value={`${doneHabits} из ${habits.length}`} sub={habits.length ? 'сегодня' : 'добавь привычки'} tone="blue" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Активность за неделю</h3><span className="chip">мин</span></div>
          <div className="chart">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis hide />
                <Tooltip cursor={{ fill: 'var(--grid)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {activityData.map((_, i) => <Cell key={i} fill={i === 5 ? '#8b5cf6' : '#6366f1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>ИИ заметил</h3><span className="chip ai"><Brain size={13} /> ИИ</span></div>
          <div className="insights">
            {INSIGHTS.map((t, i) => (
              <div key={i} className="insight"><Sparkles size={16} /><p>{t}</p></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Квесты</h3><span className="chip"><Flag size={13} /> {quests.length}</span></div>
        {quests.length === 0 ? (
          <Empty text="Добавь первый квест — например «Накопить 100 000 ₽» или «Бросить курить»" action={<button className="btn primary sm" onClick={() => setAddQ(true)}>+ Квест</button>} />
        ) : (
          <div className="quest-list">
            {quests.map(q => (
              <div key={q.id} className="quest">
                <div className="quest-icon" style={{ background: '#6366f122', color: '#6366f1' }}><Flag size={17} /></div>
                <div className="quest-body">
                  <div className="quest-head"><span className="tx-name">{q.name}</span><span className="quest-pct">0%</span></div>
                  <div className="quest-bar"><div className="quest-fill" style={{ width: '0%', background: '#6366f1' }} /></div>
                  <span className="tx-cat">0 из {q.total}</span>
                </div>
              </div>
            ))}
            <button className="btn scan" onClick={() => setAddQ(true)}>+ Квест</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Привычки сегодня</h3><span className="chip">{doneHabits} из {habits.length}</span></div>
        {habits.length === 0 ? (
          <Empty text="Добавь привычки в разделе «Привычки», и они появятся здесь" />
        ) : (
          <div className="habit-row">
            {habits.slice(0, 6).map(h => {
              const I = habitIcons[h.icon] || Repeat
              return (
                <div key={h.id} className={`habit-pill ${h.done ? 'done' : ''}`}>
                  <I size={16} />
                  <span>{h.name}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {addQ && (
        <EntryModal
          title="Новый квест"
          fields={[
            { key: 'name', label: 'Цель', placeholder: 'Например: накопить 100 000 ₽' },
            { key: 'total', label: 'Целевое значение', type: 'number', placeholder: '100000' },
          ]}
          submitLabel="Добавить квест"
          onSubmit={addQuest}
          onClose={() => setAddQ(false)}
        />
      )}
    </div>
  )
}

function Finance() {
  const [txs, setTxs] = useArtifactState('lifeos_tx', [] as Tx[])
  const [adding, setAdding] = useState(false)
  const [budgets, setBudgets] = useArtifactState('lifeos_budgets', {} as Budgets)
  const [addBudget, setAddBudget] = useState(false)
  const [xp, setXp] = useArtifactState('lifeos_xp', 0)

  const thisMonth = monthOf(todayISO())
  const monthExpenses = txs.filter(t => t.amount < 0 && monthOf(t.date) === thisMonth)
  const monthTotal = monthExpenses.reduce((s, t) => s - t.amount, 0)

  const now = new Date()
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevKey = `${prevD.getFullYear()}-${prevD.getMonth()}`
  const prevTotal = txs
    .filter(t => t.amount < 0 && monthOf(t.date) === prevKey)
    .reduce((s, t) => s - t.amount, 0)
  const delta = prevTotal ? Math.round((monthTotal - prevTotal) / prevTotal * 100) : null

  const trend = monthTrend(txs)
  const pie = CATEGORIES
    .map(c => ({ name: c.name, color: c.color, value: monthExpenses.filter(t => t.cat === c.name).reduce((s, t) => s - t.amount, 0) }))
    .filter(c => c.value > 0)
  const spends = categorySpends(txs, budgets)

  const addTx = (v: Record<string, string>) => {
    setTxs(t => [{ id: Date.now(), name: v.name, cat: v.cat, amount: -Math.abs(Number(v.amount)), date: todayISO() }, ...t])
    setXp(x => x + XPS.txAdded)
    setAdding(false)
  }

  return (
    <div className="view">
      <h1>Финансы</h1>
      <p className="sub">Твои расходы и доходы</p>

      <div className="balance card">
        <div>
          <span className="stat-label">Расходы за этот месяц</span>
          <div className="balance-value">{fmtMoney(monthTotal)}</div>
          <div className="balance-delta"><TrendingUp size={15} /> {delta === null ? 'добавь несколько записей' : (delta >= 0 ? '+' : '') + delta + '% к прошлому месяцу'}</div>
        </div>
        <div className="balance-actions">
          <button className="btn scan" onClick={() => setAdding(true)}><ScanLine size={16} /> Добавить расход</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Расходы по месяцам</h3></div>
          <div className="chart">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend}>
                <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }} />
                <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2.5} fill="url(#area)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>По категориям</h3></div>
          {pie.length === 0 ? (
            <Empty text="Траты по категориям появятся, когда добавишь расходы" />
          ) : (
            <>
              <div className="pie-wrap">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={3} stroke="none">
                      {pie.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend">
                {pie.map(c => (
                  <div key={c.name} className="legend-item"><span className="dot" style={{ background: c.color }} />{c.name}<b>{fmt(c.value)} ₽</b></div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Бюджеты по категориям</h3><button className="btn primary sm" onClick={() => setAddBudget(true)}>+ Лимит</button></div>
        {spends.length === 0 ? (
          <Empty text="Добавь месячные лимиты на категории — приложение предупредит, когда начнётся перерасход" />
        ) : (
          <div className="budget-list">
            {spends.map(s => (
              <div key={s.name} className={`budget-row ${s.over ? 'over' : ''}`}>
                <div className="budget-head">
                  <span className="tx-name">{s.name}</span>
                  <span className="tx-cat">{fmt(s.spent)} ₽{s.limit ? ' из ' + fmt(s.limit) + ' ₽' : ''}</span>
                </div>
                {s.limit && <div className="budget-bar"><div className={`budget-fill ${s.over ? 'over' : ''}`} style={{ width: Math.min(100, s.pct) + '%' }} /></div>}
                {s.over && <span className="budget-over">Перерасход на {fmt(s.spent - s.limit!)} ₽</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Операции</h3><span className="chip">{txs.length}</span></div>
        {txs.length === 0 ? (
          <Empty text="Здесь появятся твои расходы. Добавь первую запись — это займёт 10 секунд" action={<button className="btn primary sm" onClick={() => setAdding(true)}>+ Добавить расход</button>} />
        ) : (
          <div className="tx-list">
            {txs.map(t => (
              <div key={t.id} className="tx">
                <div className="tx-icon" style={{ background: catColor(t.cat) + '22', color: catColor(t.cat) }}><ArrowUpRight size={16} /></div>
                <div className="tx-body"><span className="tx-name">{t.name}</span><span className="tx-cat">{t.cat} · {fmtDate(t.date)}</span></div>
                <span className="tx-amount">{fmtMoney(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {addBudget && (
        <EntryModal
          title="Лимит на категорию"
          fields={[
            { key: 'cat', label: 'Категория', type: 'select', options: CATEGORIES.map(c => ({ value: c.name, label: c.name })) },
            { key: 'limit', label: 'Лимит в месяц, ₽', type: 'number', placeholder: '10000' },
          ]}
          submitLabel="Сохранить лимит"
          onSubmit={(v) => setBudgets(b => ({ ...b, [v.cat]: Math.max(0, Number(v.limit)) }))}
          onClose={() => setAddBudget(false)}
        />
      )}

      {adding && (
        <EntryModal
          title="Добавить расход"
          fields={[
            { key: 'name', label: 'Что купил?', placeholder: 'Например: Пятёрочка' },
            { key: 'amount', label: 'Сумма, ₽', type: 'number', placeholder: '500' },
            { key: 'cat', label: 'Категория', type: 'select', options: CATEGORIES.map(c => ({ value: c.name, label: c.name })), initial: undefined },
          ]}
          submitLabel="Добавить"
          onSubmit={addTx}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function Investments() {
  const [holdings, setHoldings] = useArtifactState('lifeos_holdings', [] as Holding[])
  const [dividends, setDividends] = useArtifactState('lifeos_dividends', [] as Dividend[])
  const [news, setNews] = useArtifactState('lifeos_news', [] as { title: string; source: string; time: string; sentiment: string }[])
  const [signals, setSignals] = useArtifactState('lifeos_signals', [] as { ticker: string; action: string; confidence: number; reason: string }[])
  const [autoTrack, setAutoTrack] = useArtifactState('invest_auto_track', false)
  const [addH, setAddH] = useState(false)
  const [addD, setAddD] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updated, setUpdated] = useState(false)

  const total = holdings.reduce((s, h) => s + h.price * h.qty, 0)
  const divSum = dividends.reduce((s, d) => s + d.amount, 0)
  const typeColor = (t: string) => (t === 'Облигация' ? '#6366f1' : t === 'Фонд' ? '#f59e0b' : '#10b981')

  const refresh = async () => {
    if (checking) return
    setChecking(true)
    setUpdated(false)
    const portfolio = holdings.filter(h => h.qty > 0)
    if (!portfolio.length) {
      setSignals(s => [...s, { ticker: '—', action: 'Держать', confidence: 50, reason: 'Добавь активы в портфель — и ИИ даст сигнал по ним' }])
      setNews(n => [{ title: 'Портфель пока пуст — добавь активы, чтобы ИИ мог анализировать рынок', source: 'ИИ-аналитика', time: 'только что', sentiment: 'neutral' }, ...n])
      setUpdated(true)
      setChecking(false)
      return
    }
    try {
      const settings = getAiSettings('text')
      const prompts = loadPrompts()
      const promptDef = PROMPTS.find(p => p.id === 'invest')
      const sys = prompts.invest || (promptDef ? promptDef.text : '')
      const desc = portfolio.map(h => `- ${h.name} (${h.ticker || '—'}), ${h.type}, ${h.qty} шт по ${h.price} ₽ ≈ ${fmt(h.price * h.qty)} ₽`).join('\n')
      const res = await chatJson<{ action: string; confidence: number; reason: string }>(settings, sys, 'Мой портфель:\n' + desc + '\n\nОцени ситуацию и дай сигнал.')
      const action = res && ['Покупать', 'Продавать'].includes(res.action) ? res.action : 'Держать'
      const conf = Math.min(100, Math.max(0, Math.round(Number(res.confidence) || 50)))
      const reason = res && res.reason ? res.reason : 'Оценка ИИ по портфелю'
      setSignals(s => [{ ticker: portfolio[0].ticker || '—', action, confidence: conf, reason }, ...s])
      setNews(n => [{ title: 'ИИ проанализировал портфель: «' + reason + '»', source: 'ИИ-аналитика', time: 'только что', sentiment: action === 'Продавать' ? 'negative' : action === 'Покупать' ? 'positive' : 'neutral' }, ...n])
    } catch (e) {
      if (e instanceof AiNotConfigured) {
        setSignals(s => [...s, { ticker: portfolio[0].ticker || '—', action: 'Держать', confidence: 50, reason: 'ИИ не подключён — подключи текстовую модель в настройках' }])
      } else {
        setNews(n => [{ title: 'Не удалось получить ответ ИИ: ' + (e instanceof Error ? e.message : 'ошибка'), source: 'Система', time: 'только что', sentiment: 'neutral' }, ...n])
      }
    }
    setUpdated(true)
    setChecking(false)
  }

  const addHolding = (v: Record<string, string>) => {
    setHoldings(h => [...h, { id: Date.now(), name: v.name, ticker: v.ticker || '—', type: v.type, price: Number(v.price), qty: Number(v.qty) }])
    setAddH(false)
  }
  const addDividend = (v: Record<string, string>) => {
    setDividends(d => [...d, { id: Date.now(), name: v.name, date: v.date || '—', amount: Number(v.amount) }])
    setAddD(false)
  }

  return (
    <div className="view">
      <h1>Инвестиции</h1>
      <p className="sub">Портфель, аналитика и сигналы ИИ</p>

      <div className="balance card">
        <div>
          <span className="stat-label">Стоимость портфеля</span>
          <div className="balance-value">{fmtMoney(total)}</div>
          <div className="balance-delta"><TrendingUp size={15} /> {holdings.length ? holdings.length + ' позиций в портфеле' : 'пока пусто — добавь первый актив'}</div>
        </div>
        <div className="balance-actions">
          <button className="btn primary" onClick={() => setAddH(true)}>Купить актив</button>
        </div>
      </div>

      <div className="grid-3">
        <StatCard icon={Wallet} label="Стоимость портфеля" value={fmtMoney(total)} sub="по текущим ценам" tone="violet" />
        <StatCard icon={LineChart} label="Позиций" value={String(holdings.length)} sub="акции и облигации" tone="blue" />
        <StatCard icon={Coins} label="Дивиденды" value={fmtMoney(divSum)} sub="в плане выплат" tone="orange" />
      </div>

      <div className="card">
        <div className="card-head"><h3>ИИ-аналитика</h3><span className="chip ai"><Brain size={13} /> ИИ</span></div>
        <div className="track-row">
          <div className="track-info">
            <span className="tx-name">Автослежение за рынком</span>
            <span className="tx-cat">{autoTrack ? 'ИИ сам проверяет новости каждый день' : 'выкл — ИИ следит только по запросу'}</span>
          </div>
          <div className={`toggle ${autoTrack ? 'on' : ''}`} onClick={() => setAutoTrack(a => !a)}><span /></div>
        </div>
        <button className="btn primary full check-btn" onClick={refresh} disabled={checking}>
          {checking ? <><Loader2 size={16} className="spin" /> Анализирую рынок…</> : updated ? <><Check size={16} /> Обновлено: только что</> : <><RefreshCw size={16} /> Проверить новости и сигналы</>}
        </button>
      </div>

      <div className="card">
        <div className="card-head"><h3>Активы</h3><span className="chip">{holdings.length}</span></div>
        {holdings.length === 0 ? (
          <Empty text="Здесь появятся твои акции и облигации" action={<button className="btn primary sm" onClick={() => setAddH(true)}>Купить актив</button>} />
        ) : (
          <div className="tx-list">
            {holdings.map(h => {
              const col = typeColor(h.type)
              return (
                <div key={h.id} className="tx">
                  <div className="tx-icon" style={{ background: col + '22', color: col }}>{h.type === 'Облигация' ? <Landmark size={16} /> : <TrendingUp size={16} />}</div>
                  <div className="tx-body">
                    <span className="tx-name">{h.name} <span className="ticker">{h.ticker}</span></span>
                    <span className="tx-cat">{h.type} · {h.qty} шт · {h.price} ₽</span>
                  </div>
                  <div className="holding-right">
                    <span className="tx-amount">{fmt(h.price * h.qty)} ₽</span>
                    <span className="tx-cat">на {fmtDate(h.date || todayISO())}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Сигналы ИИ</h3><span className="chip ai"><Brain size={13} /> ИИ</span></div>
          {signals.length === 0 ? (
            <Empty text="Сигналы появятся после нажатия «Проверить новости и сигналы»" />
          ) : (
            <div className="signal-list">
              {signals.map((s, i) => (
                <div key={i} className="signal">
                  <div className="signal-head">
                    <span className="tx-name">{s.ticker}</span>
                    <span className={`signal-action ${s.action === 'Покупать' ? 'buy' : s.action === 'Продавать' ? 'sell' : 'hold'}`}>{s.action}</span>
                  </div>
                  <div className="signal-bar"><div className="signal-fill" style={{ width: s.confidence + '%' }} /></div>
                  <span className="tx-cat">Уверенность {s.confidence}% · {s.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Новости рынка</h3><span className="chip">{news.length}</span></div>
          {news.length === 0 ? (
            <Empty text="Нажми «Проверить рынок» — ИИ соберёт свежие новости" />
          ) : (
            <div className="news-list">
              {news.map(n => (
                <div key={n.title} className="news">
                  <span className={`news-dot ${n.sentiment}`} />
                  <div className="news-body">
                    <span className="tx-name">{n.title}</span>
                    <span className="tx-cat">{n.source} · {n.time}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Дивиденды</h3><button className="btn primary sm" onClick={() => setAddD(true)}>+ Дивиденд</button></div>
        {dividends.length === 0 ? (
          <Empty text="Добавляй ожидаемые дивиденды — и сроки выплат будут под рукой" />
        ) : (
          <div className="tx-list">
            {dividends.map(d => (
              <div key={d.id} className="tx">
                <div className="tx-icon" style={{ background: '#f59e0b22', color: '#f59e0b' }}><Coins size={16} /></div>
                <div className="tx-body"><span className="tx-name">{d.name}</span><span className="tx-cat">Выплата {d.date}</span></div>
                <span className="tx-amount">{fmtMoney(d.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {addH && (
        <EntryModal
          title="Купить актив"
          fields={[
            { key: 'type', label: 'Тип', type: 'select', options: TYPES.map(t => ({ value: t, label: t })) },
            { key: 'name', label: 'Название', placeholder: 'Например: Сбербанк' },
            { key: 'ticker', label: 'Тикер', placeholder: 'SBER' },
            { key: 'price', label: 'Цена за штуку, ₽', type: 'number', placeholder: '285' },
            { key: 'qty', label: 'Количество, шт', type: 'number', placeholder: '10' },
          ]}
          submitLabel="Добавить в портфель"
          onSubmit={addHolding}
          onClose={() => setAddH(false)}
        />
      )}
      {addD && (
        <EntryModal
          title="Новый дивиденд"
          fields={[
            { key: 'name', label: 'Компания', placeholder: 'Сбербанк' },
            { key: 'date', label: 'Дата выплаты', placeholder: '12 июля' },
            { key: 'amount', label: 'Сумма, ₽', type: 'number', placeholder: '1665' },
          ]}
          submitLabel="Добавить"
          onSubmit={addDividend}
          onClose={() => setAddD(false)}
        />
      )}
    </div>
  )
}

function Sport() {
  const [workouts, setWorkouts] = useArtifactState('lifeos_workouts', [] as Workout[])
  const [adding, setAdding] = useState(false)
  const [xp, setXp] = useArtifactState('lifeos_xp', 0)

  const week = workouts.filter(w => diffDays(w.date) < 7)
  const weekKcal = week.reduce((s, w) => s + w.kcal, 0)
  const weekMin = week.reduce((s, w) => s + w.durMin, 0)

  const addWorkout = (v: Record<string, string>) => {
    setWorkouts(w => [{ id: Date.now(), name: v.name, date: todayISO(), durMin: Number(v.durMin), kcal: Number(v.kcal) }, ...w])
    setXp(x => x + XPS.workoutAdded)
    setAdding(false)
  }

  return (
    <div className="view">
      <h1>Спорт</h1>
      <p className="sub">Тренировки и активность</p>
      <div className="grid-3">
        <StatCard icon={Flame} label="Калории за неделю" value={fmt(weekKcal)} sub="ккал" tone="orange" />
        <StatCard icon={Activity} label="Тренировок" value={String(week.length)} sub="за 7 дней" tone="violet" />
        <StatCard icon={Dumbbell} label="Время" value={String(Math.round(weekMin / 60 * 10) / 10)} sub="часов за неделю" tone="green" />
      </div>
      <div className="card">
        <div className="card-head"><h3>Тренировки</h3><button className="btn primary sm" onClick={() => setAdding(true)}>+ Тренировка</button></div>
        {workouts.length === 0 ? (
          <Empty text="Добавь первую тренировку — силовую, бег, йогу или плавание" action={<button className="btn primary sm" onClick={() => setAdding(true)}>+ Тренировка</button>} />
        ) : (
          <div className="workout-list">
            {workouts.map(w => (
              <div key={w.id} className="workout">
                <div className="workout-icon"><Dumbbell size={18} /></div>
                <div className="workout-body"><span className="tx-name">{w.name}</span><span className="tx-cat">{fmtDate(w.date)}</span></div>
                <div className="workout-meta"><span>{w.durMin} мин</span><span className="kcal">{w.kcal} ккал</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <EntryModal
          title="Новая тренировка"
          fields={[
            { key: 'name', label: 'Что делал?', placeholder: 'Силовая · Грудь и спина' },
            { key: 'durMin', label: 'Длительность, мин', type: 'number', placeholder: '45' },
            { key: 'kcal', label: 'Калории (примерно)', type: 'number', placeholder: '350' },
          ]}
          submitLabel="Добавить"
          onSubmit={addWorkout}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function Habits() {
  const [habits, setHabits] = useArtifactState('lifeos_habits', [] as Habit[])
  const [adding, setAdding] = useState(false)
  const [xp, setXp] = useArtifactState('lifeos_xp', 0)

  const done = habits.filter(h => h.done).length
  const bestStreak = habits.reduce((m, h) => Math.max(m, h.streak), 0)

  const addHabit = (v: Record<string, string>) => {
    setHabits(h => [...h, { id: Date.now(), name: v.name, icon: v.icon, done: false, streak: 0 }])
    setAdding(false)
  }
  const toggle = (id: number) => {
    const h = habits.find(x => x.id === id)
    if (h && !h.done) setXp(x => x + XPS.habitDone)
    setHabits(hs => hs.map(x => x.id === id ? { ...x, done: !x.done, streak: x.done ? x.streak : x.streak + 1 } : x))
  }

  return (
    <div className="view">
      <h1>Привычки</h1>
      <p className="sub">Ежедневные ритуалы</p>
      <div className="grid-3">
        <StatCard icon={Repeat} label="Сделано сегодня" value={`${done} из ${habits.length}`} sub={habits.length ? '' : 'добавь первую'} tone="violet" />
        <StatCard icon={Flame} label="Лучшая серия" value={String(bestStreak)} sub="дней подряд" tone="orange" />
        <StatCard icon={CheckCircle2} label="Привычек" value={String(habits.length)} sub="всего" tone="green" />
      </div>
      <div className="card">
        <div className="card-head"><h3>Список</h3><button className="btn primary sm" onClick={() => setAdding(true)}>+ Привычка</button></div>
        {habits.length === 0 ? (
          <Empty text="Добавь привычку, которую хочешь закрепить: зарядка, чтение, вода…" action={<button className="btn primary sm" onClick={() => setAdding(true)}>+ Привычка</button>} />
        ) : (
          <div className="habit-list">
            {habits.map(h => {
              const I = habitIcons[h.icon] || Repeat
              return (
                <div key={h.id} className={`habit-item ${h.done ? 'done' : ''}`}>
                  <div className="habit-icon"><I size={18} /></div>
                  <div className="habit-body"><span className="tx-name">{h.name}</span><span className="tx-cat">🔥 {h.streak} дней подряд</span></div>
                  <div className={`toggle ${h.done ? 'on' : ''}`} onClick={() => toggle(h.id)}><span /></div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {adding && (
        <EntryModal
          title="Новая привычка"
          fields={[
            { key: 'name', label: 'Название', placeholder: 'Зарядка утром' },
            { key: 'icon', label: 'Иконка', type: 'select', options: HABIT_META.map(m => ({ value: m.icon, label: m.label })) },
          ]}
          submitLabel="Добавить"
          onSubmit={addHabit}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function Plans({ onPlan }: any) {
  const [tasks, setTasks] = useArtifactState('lifeos_tasks', [] as Task[])
  const [adding, setAdding] = useState(false)
  const [xp, setXp] = useArtifactState('lifeos_xp', 0)

  const done = tasks.filter(t => t.done).length

  const addTask = (v: Record<string, string>) => {
    setTasks(t => [{ id: Date.now(), name: v.name, done: false, prio: v.prio }, ...t])
    setAdding(false)
  }
  const toggle = (id: number) => {
    const t = tasks.find(x => x.id === id)
    if (t && !t.done) setXp(x => x + XPS.taskDone)
    setTasks(ts => ts.map(x => x.id === id ? { ...x, done: !x.done } : x))
  }

  return (
    <div className="view">
      <h1>Планы</h1>
      <p className="sub">Задачи и цели</p>

      <div className="plan-cta card">
        <div className="plan-cta-icon"><Sparkles size={22} /></div>
        <div className="plan-cta-body">
          <h3>Составь план с ИИ</h3>
          <p>Опиши цель — ИИ разобьёт её на шаги (пока это демо-пример)</p>
        </div>
        <button className="btn primary sm" onClick={onPlan}>Создать план</button>
      </div>

      <div className="grid-3">
        <StatCard icon={ListTodo} label="Задач" value={String(tasks.length)} sub="всего" tone="violet" />
        <StatCard icon={CheckCircle2} label="Выполнено" value={String(done)} sub={tasks.length ? 'отмечай галочкой' : ''} tone="green" />
        <StatCard icon={Target} label="Активных" value={String(tasks.length - done)} sub="" tone="orange" />
      </div>

      <div className="card">
        <div className="card-head"><h3>Задачи</h3><button className="btn primary sm" onClick={() => setAdding(true)}>+ Задача</button></div>
        {tasks.length === 0 ? (
          <Empty text="Добавь задачи на сегодня или на неделю" action={<button className="btn primary sm" onClick={() => setAdding(true)}>+ Задача</button>} />
        ) : (
          <div className="task-list">
            {tasks.map(t => (
              <div key={t.id} className={`task ${t.done ? 'done' : ''}`}>
                <div className={`task-check ${t.done ? 'on' : ''}`} onClick={() => toggle(t.id)}>{t.done && <CheckCircle2 size={16} />}</div>
                <div className="task-body"><span className="tx-name">{t.name}</span></div>
                <span className={`prio prio-${t.prio}`} />
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <EntryModal
          title="Новая задача"
          fields={[
            { key: 'name', label: 'Что нужно сделать?', placeholder: 'Оплатить счета' },
            { key: 'prio', label: 'Приоритет', type: 'select', options: [{ value: 'high', label: 'Высокий' }, { value: 'medium', label: 'Средний' }, { value: 'low', label: 'Низкий' }] },
          ]}
          submitLabel="Добавить"
          onSubmit={addTask}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function Health() {
  const [goal, setGoal] = useArtifactState('health_goal', '')
  const [log, setLog] = useArtifactState('lifeos_weight_log', [] as WeightEntry[])
  const [history, setHistory] = useState(false)
  const [input, setInput] = useState('')
  const [saved, setSaved] = useState(false)
  const [height, setHeight] = useArtifactState('health_height', '')

  const current = log.length ? log[0].value : null
  const change = log.length > 1 ? Math.round((log[0].value - log[log.length - 1].value) * 10) / 10 : null
  const bmiV = current !== null && height && Number(height) > 0 ? bmi(current, Number(height)) : null

  const saveWeight = () => {
    const num = Number(input.replace(',', '.'))
    if (!input.trim() || !isFinite(num)) return
    setLog(l => [{ id: Date.now(), date: todayISO(), value: num }, ...l])
    setInput('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="view">
      <h1>Здоровье</h1>
      <p className="sub">Вес и самочувствие · без подключения часов</p>

      <div className="grid-4">
        <StatCard icon={Activity} label="Текущий вес" value={current === null ? '—' : current + ' кг'} sub={change === null ? 'запиши первый вес' : (change > 0 ? '+' : '') + change + ' кг по записям'} tone="violet" />
        <StatCard icon={Target} label="Цель" value={goal ? goal + ' кг' : '—'} sub="задай в карточке ниже" tone="green" />
        <StatCard icon={Activity} label="ИМТ" value={bmiV === null ? '—' : String(bmiV)} sub={bmiV === null ? 'укажи рост ниже' : (bmiV < 18.5 ? 'ниже нормы' : bmiV < 25 ? 'в норме' : bmiV < 30 ? 'выше нормы' : 'высокий')} tone="orange" />
        <StatCard icon={CalendarDays} label="Записей" value={String(log.length)} sub="история ведётся автоматически" tone="blue" />
      </div>

      <div className="card">
        <div className="card-head"><h3>Вес</h3><span className="chip">Ручной ввод</span></div>
        <div className="weight-row">
          <div className="weight-input-wrap">
            <input type="number" step="0.1" inputMode="decimal" className="weight-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveWeight()} placeholder="78.4" />
            <span className="weight-unit">кг</span>
          </div>
          <button className="btn primary sm" onClick={saveWeight}>{saved ? <><Check size={15} /> Ок</> : 'Записать'}</button>
        </div>
        <label className="field-label">Цель</label>
        <div className="weight-row">
          <div className="weight-input-wrap">
            <input type="number" step="0.1" inputMode="decimal" className="weight-input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="75" />
            <span className="weight-unit">кг</span>
          </div>
        </div>
        <label className="field-label">Рост (для ИМТ)</label>
        <div className="weight-row">
          <div className="weight-input-wrap">
            <input type="number" step="1" inputMode="decimal" className="weight-input" value={height} onChange={e => setHeight(e.target.value)} placeholder="178" />
            <span className="weight-unit">см</span>
          </div>
        </div>
        <p className="weight-note">Фитнес-часы не подключаются — просто вноси вес сам, без лишней настройки.</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>История веса</h3><span className="chip">{log.length}</span></div>
        {log.length === 0 ? (
          <Empty text="Запиши первый вес — история начнёт копиться" />
        ) : (
          <div className="tx-list">
            {log.slice(0, history ? 50 : 7).map(w => (
              <div key={w.id} className="tx">
                <div className="tx-icon" style={{ background: '#6366f122', color: '#6366f1' }}><Activity size={16} /></div>
                <div className="tx-body"><span className="tx-name">{fmtDate(w.date)}</span><span className="tx-cat">замер веса</span></div>
                <span className="tx-amount">{w.value} кг</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Динамика веса</h3><span className="chip">кг</span></div>
        {log.length < 2 ? (
          <Empty text="Запиши вес хотя бы два раза — и график появится здесь" />
        ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={180}>
              <RLineChart data={weightTrend(log)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }} />
                <Line type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366f1' }} />
              </RLineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Настроение</h3></div>
        <div className="mood-row">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => (
            <div key={d} className="mood"><span className="mood-emoji">{['😐', '🙂', '😄', '🙂', '😊', '😄', '😌'][i]}</span><span>{d}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Food({ onScan }: any) {
  const [food, setFood] = useArtifactState('lifeos_food', [] as FoodEntry[])
  const [adding, setAdding] = useState(false)
  const [calGoal, setCalGoal] = useArtifactState('food_cal_goal', '')
  const [xp, setXp] = useArtifactState('lifeos_xp', 0)

  const today = todayISO()
  const todayFood = food.filter(f => f.date === today)
  const todayKcal = todayFood.reduce((s, f) => s + f.kcal, 0)

  const addFood = (v: Record<string, string>) => {
    setFood(f => [{ id: Date.now(), name: v.name, meal: v.meal, kcal: Number(v.kcal), date: today }, ...f])
    setXp(x => x + XPS.foodLogged)
    setAdding(false)
  }

  return (
    <div className="view">
      <h1>Питание</h1>
      <p className="sub">Еда и калории</p>
      <div className="grid-3">
        <StatCard icon={Flame} label="Калории сегодня" value={fmt(todayKcal)} sub="ккал" tone="orange" />
        <StatCard icon={Utensils} label="Приёмов пищи" value={String(todayFood.length)} sub="сегодня" tone="green" />
        <StatCard icon={BookOpen} label="Записей всего" value={String(food.length)} sub="дневник питания" tone="blue" />
      </div>
      <div className="card">
        <div className="card-head"><h3>Норма калорий в день</h3></div>
        <div className="weight-row">
          <div className="weight-input-wrap">
            <input type="number" inputMode="decimal" className="weight-input" value={calGoal} onChange={e => setCalGoal(e.target.value)} placeholder="2200" />
            <span className="weight-unit">ккал</span>
          </div>
        </div>
        {calGoal && Number(calGoal) > 0 && (
          <div className="calorie-bar-wrap">
            <div className="budget-head">
              <span className="tx-name">Сегодня</span>
              <span className={`tx-cat ${todayKcal > Number(calGoal) ? 'over-txt' : ''}`}>{fmt(todayKcal)} из {fmt(Number(calGoal))} ккал · {calorieProgress(todayKcal, Number(calGoal))}%</span>
            </div>
            <div className="budget-bar"><div className={`budget-fill ${todayKcal > Number(calGoal) ? 'over' : ''}`} style={{ width: Math.min(100, calorieProgress(todayKcal, Number(calGoal))) + '%' }} /></div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Дневник питания</h3>
          <div className="add-btn-row">
            <button className="btn scan sm" onClick={() => onScan('food')}><ImagePlus size={15} /> Фото</button>
            <button className="btn primary sm" onClick={() => setAdding(true)}>+ Запись</button>
          </div>
        </div>
        {food.length === 0 ? (
          <Empty text="Добавь, что сегодня съел, — или сфотографируй блюдо: ИИ посчитает калории" action={<button className="btn primary sm" onClick={() => setAdding(true)}>+ Запись</button>} />
        ) : (
          <div className="tx-list">
            {food.map(f => (
              <div key={f.id} className="tx">
                <div className="tx-icon" style={{ background: '#10b98122', color: '#10b981' }}><Utensils size={16} /></div>
                <div className="tx-body"><span className="tx-name">{f.name}</span><span className="tx-cat">{f.meal} · {fmtDate(f.date)}</span></div>
                <span className="tx-amount">{f.kcal} ккал</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <EntryModal
          title="Запись о еде"
          fields={[
            { key: 'name', label: 'Что съел?', placeholder: 'Овсянка с ягодами' },
            { key: 'meal', label: 'Приём пищи', type: 'select', options: MEALS.map(m => ({ value: m, label: m })) },
            { key: 'kcal', label: 'Калории', type: 'number', placeholder: '320' },
          ]}
          submitLabel="Добавить"
          onSubmit={addFood}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function AI() {
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: 'Привет! Я твой ИИ-ассистент. Подключи меня в настройках — и я начну анализировать твои финансы, тренировки и питание.' },
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const send = async () => {
    const q = input.trim()
    if (!q || thinking) return
    setMsgs(m => [...m, { role: 'user', text: q }])
    setInput('')
    setThinking(true)
    try {
      const settings = getAiSettings('text')
      const prompts = loadPrompts()
      const promptDef = PROMPTS.find(p => p.id === 'chat')
      const reply = await chatCompletion(settings, prompts.chat || (promptDef ? promptDef.text : ''), q)
      setMsgs(m => [...m, { role: 'ai', text: reply }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'ai', text: e instanceof AiNotConfigured ? 'Подключи текстовую модель в настройках (шестерёнка сверху) — и я начну отвечать по-настоящему.' : 'Не удалось получить ответ: ' + (e instanceof Error ? e.message : 'ошибка') + '. Проверь модель и ключ в настройках.' }])
    }
    setThinking(false)
  }
  return (
    <div className="view ai-view">
      <h1>ИИ-ассистент</h1>
      <p className="sub">Анализ твоих данных</p>
      <div className="card chat">
        <div className="chat-body">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'ai' && <div className="msg-avatar"><Sparkles size={14} /></div>}
              <div className="bubble">{m.text}</div>
            </div>
          ))}
          {thinking && (
            <div className="msg ai">
              <div className="msg-avatar"><Sparkles size={14} /></div>
              <div className="bubble"><Loader2 size={14} className="spin" /> Думаю…</div>
            </div>
          )}
        </div>
        <div className="chat-input">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Спроси, например: сколько я потратил на еду?" />
          <button className="btn primary" onClick={send}>Отправить</button>
        </div>
      </div>
      <div className="suggestions">
        {['Сколько я потратил в этом месяце?', 'Как улучшить сон?', 'План тренировок на неделю'].map(s => (
          <button key={s} className="chip click" onClick={() => { setInput(s) }}>{s}</button>
        ))}
      </div>
    </div>
  )
}

/* ---------- settings ---------- */

const VISION_PROVIDERS = [
  { id: 'gemini', name: 'Gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'] },
  { id: 'anthropic', name: 'Claude', models: ['claude-sonnet-4.5', 'claude-haiku-4.5'] },
  { id: 'minimax', name: 'MiniMax', models: ['MiniMax-VL-01', 'abab-6.5s'] },
  { id: 'custom', name: 'Свой агрегатор', models: [] },
]

const TEXT_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'] },
  { id: 'anthropic', name: 'Claude', models: ['claude-sonnet-4.5', 'claude-haiku-4.5'] },
  { id: 'minimax', name: 'MiniMax', models: ['MiniMax-Text-01', 'abab-6.5s'] },
  { id: 'custom', name: 'Свой агрегатор', models: [] },
]

function ModelChannel({ title, desc, icon: Icon, providers, provider, setProvider, model, setModel, keyVal, setKeyVal, customUrl, setCustomUrl, kind, customModels, loadingModels, modelError, onLoadModels }: any) {
  const [showKey, setShowKey] = useState(false)
  const cur = providers.find((p: any) => p.id === provider) || providers[0]
  const isCustom = provider === 'custom'
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3><span className="chip ai"><Icon size={13} /> {isCustom ? 'Агрегатор' : cur.name}</span></div>
      <p className="settings-hint">{desc}</p>
      <div className="provider-grid">
        {providers.map((p: any) => (
          <button key={p.id} className={`provider ${provider === p.id ? 'sel' : ''}`} onClick={() => { setProvider(p.id); if (p.models[0]) setModel(p.models[0]) }}>
            <span className="provider-name">{p.name}</span>
            {provider === p.id && <Check size={16} />}
          </button>
        ))}
      </div>

      {isCustom ? (
        <>
          <label className="field-label">Base URL агрегатора (OpenRouter-совместимый)</label>
          <input className="text-input" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://api.aggregator.com/v1" />
          <div className="model-load-row">
            <button className="btn sm" onClick={onLoadModels} disabled={loadingModels}>
              {loadingModels ? <><Loader2 size={14} className="spin" /> Загружаю…</> : <><RefreshCw size={14} /> Загрузить список моделей</>}
            </button>
            {modelError && <span className="lock-err" style={{ fontSize: 12 }}>{modelError}</span>}
          </div>
          {customModels.length > 0 && (
            <>
              <label className="field-label">{kind === 'vision' ? 'Vision-модели (для фото)' : 'Текстовые модели (чат и планы)'}</label>
              <div className="model-chips">
                {customModels.filter(m => (kind === 'vision') === m.vision).slice(0, 12).map(m => (
                  <button key={m.id} className={`chip click ${model === m.id ? 'sel' : ''}`} onClick={() => setModel(m.id)}>{m.id}</button>
                ))}
              </div>
              <p className="tx-cat">Показаны первые 12 моделей. Если нужной нет — впиши её название вручную ниже.</p>
            </>
          )}
          <label className="field-label">Название модели (вручную)</label>
          <input className="text-input" value={model} onChange={e => setModel(e.target.value)} placeholder={kind === 'vision' ? 'например: openai/gpt-4o-vision…' : 'например: deepseek/deepseek-chat…'} />
        </>
      ) : (
        <>
          <label className="field-label">Модель</label>
          <select className="select" value={model} onChange={e => setModel(e.target.value)}>
            {cur.models.map((m: string) => <option key={m} value={m}>{m}</option>)}
          </select>
        </>
      )}

      <label className="field-label">API-ключ</label>
      <div className="key-input">
        <input type={showKey ? 'text' : 'password'} value={keyVal} onChange={e => setKeyVal(e.target.value)} placeholder="Вставь API-ключ…" />
        <button className="icon-btn" onClick={() => setShowKey(s => !s)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
    </div>
  )
}

function SettingsModal({ onClose, onResetAccess }: any) { 
  const [visionProvider, setVisionProvider] = useArtifactState('ai_vision_provider', 'gemini')
  const [visionModel, setVisionModel] = useArtifactState('ai_vision_model', 'gemini-2.5-flash')
  const [textProvider, setTextProvider] = useArtifactState('ai_text_provider', 'deepseek')
  const [textModel, setTextModel] = useArtifactState('ai_text_model', 'deepseek-chat')
  const [customUrl, setCustomUrl] = useArtifactState('ai_custom_url', '')
  const [aiKeys, setAiKeys] = useArtifactState('ai_keys', { vision: '', text: '' } as { vision: string; text: string })
  const visionKey = aiKeys.vision
  const textKey = aiKeys.text
  const setVisionKey = (v: string) => setAiKeys(k => ({ ...k, vision: v }))
  const setTextKey = (v: string) => setAiKeys(k => ({ ...k, text: v }))
  const [prompts, setPrompts] = useState<Record<string, string>>(loadPrompts)
  const fileRef = useRef<HTMLInputElement>(null)
  const setPrompt = (id: string, v: string) => { savePrompt(id, v); setPrompts(p => ({ ...p, [id]: v })) }
  const resetPrompt = (id: string) => { resetPrompts(id); setPrompts(p => { const n = { ...p }; delete n[id]; return n }) }
  const resetAllPrompts = () => { resetPrompts(); setPrompts(loadPrompts()) }
  const onImport = async ({ target }: { target: HTMLInputElement }) => {
    const f = target.files?.[0]
    if (!f) return
    try {
      const text = await f.text()
      applyBackup(parseBackupFile(text))
      alert('Данные загружены. Страница перезагрузится…')
      location.reload()
    } catch (err) {
      alert('Не удалось импортировать: ' + (err instanceof Error ? err.message : 'неверный формат файла'))
    }
  }
  const [saved, setSaved] = useState(false)
  const [customModels, setCustomModels] = useArtifactState('ai_custom_models', [] as { id: string; vision: boolean }[])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState('')

  const loadCustomModels = async () => {
    const url = (customUrl || '').trim().replace(/\/+$/, '')
    if (!url) { setModelError('Сначала впиши Base URL агрегатора'); return }
    setLoadingModels(true)
    setModelError('')
    try {
      const res = await fetch(url + '/models', { headers: { Authorization: visionKey ? 'Bearer ' + visionKey : (textKey ? 'Bearer ' + textKey : '') } })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      const list = (json.data || [])
        .map((m: any) => {
          const id = (m.id || m.name || '').trim()
          if (!id) return null
          const vision = m.support_vision === true || /vision|multimodal|moondream|qwen2-vl|\bvl\b|minicpm-v|\bglm-4v\b|llava/i.test(id)
          return { id, vision }
        })
        .filter(Boolean) as { id: string; vision: boolean }[]
      setCustomModels(list)
      if (!list.length) setModelError('Список пуст — возможно, у агрегатора другой формат ответа. Название можно вписать вручную.')
    } catch (e) {
      const status = e instanceof Error && /^[0-9]+$/.test(e.message) ? Number(e.message) : null
      if (status === 401) setModelError('API требует ключ (401 Unauthorized): введи API-ключ в поле ниже и проверь Base URL. Для ai.wormsoft.ru это https://ai.wormsoft.ru/api/gpt')
      else if (status === 404) setModelError('Маршрут /models не найден (404): проверь Base URL — нужен путь до раздела API, например https://ai.wormsoft.ru/api/gpt (без /v1 и без слеша в конце)')
      else setModelError('Не удалось загрузить модели' + (status ? ' (код ' + status + ')' : '') + '. Проверь Base URL и ключ; название можно вписать вручную.')
    }
    setLoadingModels(false)
  }

  const save = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const resetAll = () => {
    const ok = confirm('Удалить все данные приложения в этом браузере? Действие нельзя отменить.')
    if (!ok) return
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('lifeos:')) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
    location.reload()
  }

  return (
    <motion.div className="overlay center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal wide" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Настройки</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="settings-stack">
          <ModelChannel
            title="Vision-модель (фото)"
            desc="Обрабатывает чеки и еду: распознаёт текст, позиции, калории и БЖУ."
            icon={Camera}
            providers={VISION_PROVIDERS}
            provider={visionProvider} setProvider={setVisionProvider}
            model={visionModel} setModel={setVisionModel}
            keyVal={visionKey} setKeyVal={setVisionKey}
            customUrl={customUrl} setCustomUrl={setCustomUrl}
            kind="vision"
            customModels={customModels} loadingModels={loadingModels} modelError={modelError} onLoadModels={loadCustomModels}
          />

          <ModelChannel
            title="Текстовая модель (чат и планы)"
            desc="Отвечает на вопросы по твоим данным и раскладывает цели на шаги."
            icon={MessageSquare}
            providers={TEXT_PROVIDERS}
            provider={textProvider} setProvider={setTextProvider}
            model={textModel} setModel={setTextModel}
            keyVal={textKey} setKeyVal={setTextKey}
            customUrl={customUrl} setCustomUrl={setCustomUrl}
            kind="text"
            customModels={customModels} loadingModels={loadingModels} modelError={modelError} onLoadModels={loadCustomModels}
          />

          <div className="card">
            <div className="card-head"><h3>Рекомендация</h3><span className="chip ai"><Sparkles size={13} /> ИИ</span></div>
            <div className="insights">
              <div className="insight"><Sparkles size={16} /><p>Для фото лучше всего Gemini 2.5 Flash (дёшево и точный OCR), для текста — DeepSeek (в 5–10× дешевле при том же качестве).</p></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Промпты ИИ</h3><span className="chip ai"><Sparkles size={13} /> ИИ</span></div>
            <p className="settings-hint">Инструкции, по которым ИИ разбирает чеки, еду, планы, чат и портфель. Настрой под себя — сброс вернёт стандартные.</p>
            <div className="prompt-list">
              {PROMPTS.map(p => (
                <div key={p.id} className="prompt-row">
                  <div className="prompt-head">
                    <span className="tx-name">{p.label}</span>
                    {prompts[p.id] && <button className="icon-btn" title="Сбросить к стандартному" onClick={() => resetPrompt(p.id)}><RefreshCw size={14} /></button>}
                  </div>
                  <textarea rows={3} value={prompts[p.id] ?? p.text} onChange={e => setPrompt(p.id, e.target.value)} />
                </div>
              ))}
            </div>
            <button className="btn sm" style={{ width: '100%', justifyContent: 'center' }} onClick={resetAllPrompts}>Сбросить все промпты</button>
          </div>


          <div className="card danger-zone">
            <div className="card-head"><h3>Данные</h3><span className="chip">Этот браузер</span></div>
            <p className="settings-hint">Все показания хранятся только в этом браузере на этом устройстве. Сброс удалит расходы, тренировки, привычки и настройки.</p>
            <button className="btn danger" onClick={resetAll}><Trash2 size={16} /> Сбросить все данные</button>
            <div className="import-actions">
              <button className="btn sm" onClick={downloadBackup}><Download size={15} /> Скачать все данные (бэкап)</button>
              <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImport} />
              <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload size={15} /> Загрузить из файла</button>
              <p className="tx-cat" style={{ textAlign: 'center' }}>Так можно перенести данные на другой телефон</p>
            </div>
            <button className="btn danger" style={{ marginTop: 8, background: 'transparent' }} onClick={() => { onResetAccess(); onClose() }}><KeyRound size={16} /> Сменить пароль / сбросить доступ</button>
          </div>
        </div>

        <button className="btn primary full save-btn" onClick={save}>
          {saved ? <><Check size={16} /> Сохранено</> : <><KeyRound size={16} /> Сохранить настройки</>}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ---------- demo flows (scan / plan) ---------- */

function Scanner({ type, onClose }: { type: 'receipt' | 'food', onClose: () => void }) {
  const [step, setStep] = useState<'capture' | 'analyzing' | 'result' | 'error'>('capture')
  const [err, setErr] = useState('')
  const [real, setReal] = useState(false)
  const [items, setItems] = useState(RECEIPT_ITEMS)
  const [store, setStore] = useState('Супермаркет «Пятёрочка»')
  const [recTotal, setRecTotal] = useState(() => RECEIPT_ITEMS.reduce((s, i) => s + i.price, 0))
  const [recFood, setRecFood] = useState(FOOD_RESULT)
  const fileRef = useRef<HTMLInputElement>(null)
  const isReceipt = type === 'receipt'

  const analyze = async (dataUrl: string) => {
    setStep('analyzing')
    try {
      const settings = getAiSettings('vision')
      const prompts = loadPrompts()
      const promptDef = PROMPTS.find(p => p.id === (isReceipt ? 'receipt' : 'food'))
      const sys = prompts[isReceipt ? 'receipt' : 'food'] || (promptDef ? promptDef.text : '')
      const text = await chatVision(settings, sys, 'Разбери изображение и верни строго JSON по инструкции.', dataUrl)
      const parsed = extractJson(text) as any
      if (isReceipt) {
        if (parsed && Array.isArray(parsed.items)) {
          const clean = parsed.items
            .filter((it: any) => it && typeof it.name === 'string' && Number.isFinite(Number(it.price)))
            .map((it: any) => ({ name: String(it.name), price: Math.max(0, Math.round(Number(it.price))) }))
          if (clean.length) setItems(clean)
          if (parsed.store) setStore(String(parsed.store))
          if (parsed.total || parsed.total === 0) setRecTotal(Math.max(0, Math.round(Number(parsed.total))))
        }
      } else if (parsed && parsed.name && Number.isFinite(Number(parsed.kcal))) {
        setRecFood({
          name: String(parsed.name),
          kcal: Math.max(0, Math.round(Number(parsed.kcal))),
          protein: Math.max(0, Math.round(Number(parsed.protein || 0))),
          fat: Math.max(0, Math.round(Number(parsed.fat || 0))),
          carbs: Math.max(0, Math.round(Number(parsed.carbs || 0))),
        })
      }
      setReal(true)
      setStep('result')
    } catch (e) {
      if (e instanceof AiNotConfigured) {
        setReal(false)
        setStep('result')
      } else {
        setErr('Не удалось распознать фото: ' + (e instanceof Error ? e.message : 'ошибка'))
        setStep('error')
      }
    }
  }

  const onFile = async ({ target }: { target: HTMLInputElement }) => {
    const f = target.files?.[0]
    if (!f) return
    try {
      const dataUrl = await readFileAsDataUrl(f)
      analyze(dataUrl)
    } catch {
      setErr('Не удалось прочитать файл. Попробуй другое фото.')
      setStep('error')
    }
  }

  return (
    <>
      {step === 'capture' && (
        <div className="scan-zone">
          <div className="scan-icon">{isReceipt ? <ScanLine size={30} /> : <Camera size={30} />}</div>
          <p className="scan-title">{isReceipt ? 'Сфотографируйте чек' : 'Сфотографируйте блюдо'}</p>
          <p className="scan-hint">ИИ прочитает {isReceipt ? 'позиции и сумму' : 'калории и БЖУ'} автоматически</p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
          <button className="btn primary sm" onClick={() => fileRef.current?.click()}>Выбрать фото</button>
          <button className="btn sm" onClick={() => { setReal(false); setStep('result') }}>Посмотреть демо-пример</button>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="scan-zone analyzing">
          <Loader2 size={34} className="spin" />
          <p className="scan-title">ИИ распознаёт…</p>
          <p className="scan-hint">{isReceipt ? 'Читаю текст и определяю категории' : 'Оцениваю состав и калорийность'}</p>
        </div>
      )}

      {step === 'error' && (
        <div className="scan-zone">
          <div className="scan-icon"><X size={28} /></div>
          <p className="scan-title">Не получилось</p>
          <p className="scan-hint">{err}</p>
          <button className="btn primary sm" onClick={() => setStep('capture')}>Попробовать снова</button>
        </div>
      )}

      {step === 'result' && (
        <div className="scan-result">
          <div className="result-head">
            <CheckCircle2 size={20} className="ok" />
            <span>{real ? 'Распознано' : 'Пример распознавания'}</span>
            <span className="chip" style={{ marginLeft: 'auto' }}>{real ? 'ИИ' : 'Демо'}</span>
          </div>

          {isReceipt ? (
            <>
              <div className="result-store">{store}</div>
              <div className="receipt-items">
                {items.map((it, i) => (
                  <div key={i} className="receipt-item"><span>{it.name}</span><b>{it.price} ₽</b></div>
                ))}
              </div>
              <div className="receipt-total"><span>Итого</span><b>{recTotal} ₽</b></div>
              <div className="result-cat"><span className="chip ai"><Sparkles size={13} /> Категория: Еда</span></div>
            </>
          ) : (
            <>
              <div className="result-store">{recFood.name}</div>
              <div className="macro-grid">
                <div className="macro"><span>Калории</span><b>{recFood.kcal}</b><small>ккал</small></div>
                <div className="macro"><span>Белки</span><b>{recFood.protein}</b><small>г</small></div>
                <div className="macro"><span>Жиры</span><b>{recFood.fat}</b><small>г</small></div>
                <div className="macro"><span>Углеводы</span><b>{recFood.carbs}</b><small>г</small></div>
              </div>
            </>
          )}

          {!real && <p className="weight-note">Настоящее распознавание заработает, когда подключишь Vision-модель в настройках.</p>}
          <button className="btn primary full" onClick={onClose}>Готово</button>
        </div>
      )}
    </>
  )
}

const RECEIPT_ITEMS = [
  { name: 'Молоко 2.5%', price: 89 },
  { name: 'Хлеб бородинский', price: 45 },
  { name: 'Яйца С0 (10 шт)', price: 129 },
  { name: 'Куриное филе', price: 320 },
  { name: 'Бананы', price: 98 },
]

const FOOD_RESULT = {
  name: 'Куриная грудка с рисом и овощами',
  kcal: 520,
  protein: 42,
  fat: 12,
  carbs: 58,
}

function PlanBuilder({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input')
  const [goal, setGoal] = useState('')
  const [timeframe, setTimeframe] = useState('1 месяц')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [planData, setPlanData] = useState(PLAN)
  const [real, setReal] = useState(false)
  const [err, setErr] = useState('')
  const [generating, setGenerating] = useState(false)

  const generate = async () => {
    if (!goal.trim() || generating) return
    setStep('generating')
    setErr('')
    setGenerating(true)
    try {
      const settings = getAiSettings('text')
      const prompts = loadPrompts()
      const promptDef = PROMPTS.find(p => p.id === 'plan')
      const sys = prompts.plan || (promptDef ? promptDef.text : '')
      const res = await chatJson<{ weeks: { week: string; tasks: string[] }[] }>(settings, sys, 'Цель: ' + goal + '.\nСрок: ' + timeframe + '.\nСоставь план из 4 недель по 2-4 шага в каждой.')
      if (res && Array.isArray(res.weeks) && res.weeks.length) {
        setPlanData(res.weeks.slice(0, 6).map((w, i) => ({ week: w.week || 'Неделя ' + (i + 1), tasks: (w.tasks || []).slice(0, 6) })))
        setReal(true)
      } else {
        throw new Error('Пустой ответ')
      }
      setStep('result')
    } catch (e) {
      if (e instanceof AiNotConfigured) {
        setReal(false)
        setStep('result')
      } else {
        setErr('ИИ не ответил: ' + (e instanceof Error ? e.message : 'ошибка') + '. Показан пример плана.')
        setPlanData(PLAN)
        setReal(false)
        setStep('result')
      }
    }
    setGenerating(false)
  }

  const toggle = (key: string) => {
    setDone(d => {
      const n = new Set(d)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  return (
    <motion.div className="overlay center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal wide" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>План с ИИ</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {step === 'input' && (
          <div className="plan-input">
            <label className="field-label">Какая у тебя цель?</label>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} placeholder="Например: подготовиться к марафону, накопить 100 000 ₽, выучить английский…" rows={3} />
            <label className="field-label">Срок</label>
            <div className="timeframe">
              {['2 недели', '1 месяц', '3 месяца'].map(t => (
                <button key={t} className={`chip click ${timeframe === t ? 'sel' : ''}`} onClick={() => setTimeframe(t)}>{t}</button>
              ))}
            </div>
            {err && <p className="lock-err">{err}</p>}
            <button className="btn primary full" onClick={generate} disabled={!goal.trim() || generating}>{generating ? <><Loader2 size={16} className="spin" /> Составляю…</> : <><Sparkles size={16} /> Составить план</>}</button>
          </div>
        )}

        {step === 'generating' && (
          <div className="scan-zone analyzing">
            <Loader2 size={34} className="spin" />
            <p className="scan-title">ИИ составляет план…</p>
            <p className="scan-hint">Разбиваю «{goal}» на шаги по неделям</p>
          </div>
        )}

        {step === 'result' && (
          <div className="plan-result">
            <div className="result-head">
              <CheckCircle2 size={20} className="ok" />
              <span>{real ? 'План от ИИ' : 'Пример плана'}</span>
              <span className="chip" style={{ marginLeft: 'auto' }}>{real ? 'ИИ' : 'Демо'}</span>
            </div>
            <div className="plan-goal">{goal}</div>
            <div className="plan-meta"><CalendarDays size={14} /> {timeframe} · {planData.length} этапов</div>
            <div className="plan-weeks">
              {planData.map((w, wi) => (
                <div key={wi} className="plan-week">
                  <div className="plan-week-title">{w.week}</div>
                  {w.tasks.map((task, ti) => {
                    const key = `${wi}-${ti}`
                    const isDone = done.has(key)
                    return (
                      <div key={key} className={`plan-task ${isDone ? 'done' : ''}`} onClick={() => toggle(key)}>
                        <div className={`task-check ${isDone ? 'on' : ''}`}>{isDone && <CheckCircle2 size={15} />}</div>
                        <span>{task}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <button className="btn primary full" onClick={onClose}>Готово</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

const PLAN = [
  { week: 'Неделя 1 · Фундамент', tasks: ['Определить измеримую цель', 'Собрать ресурсы и материалы', 'Выполнить первый шаг', 'Зафиксировать стартовую точку'] },
  { week: 'Неделя 2 · Развитие', tasks: ['Увеличить нагрузку на 20%', 'Добавить регулярность', 'Отслеживать прогресс'] },
  { week: 'Неделя 3 · Закрепление', tasks: ['Довести до целевого уровня', 'Устранить слабые места', 'Проверить промежуточный результат'] },
  { week: 'Неделя 4 · Результат', tasks: ['Финальный рывок', 'Подвести итоги', 'Закрепить привычку'] },
]

/* ---------- access lock (пароль / Google Authenticator) ---------- */

type AuthCfg = { hash: string; salt: string; totpSecret?: string }

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return new Uint8Array(out)
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

const randBytes = (n: number) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a }
const strBytes = (s: string) => new TextEncoder().encode(s)
const bytesHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')

function sha1(msg: Uint8Array): Uint8Array {
  const bitLen = msg.length * 8
  const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6)
  padded.set(msg)
  padded[msg.length] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), false)
  dv.setUint32(padded.length - 8, bitLen >>> 0, false)
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0
  const w = new Uint32Array(80)
  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false)
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let j = 0; j < 80; j++) {
      let f: number, k: number
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999 }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1 }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC }
      else { f = b ^ c ^ d; k = 0xCA62C1D6 }
      const t = (rotl(a, 5) + f + e + k + w[j]) >>> 0
      e = d; d = c; c = rotl(b, 30); b = a; a = t
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const od = new DataView(out.buffer)
  od.setUint32(0, h0, false); od.setUint32(4, h1, false); od.setUint32(8, h2, false); od.setUint32(12, h3, false); od.setUint32(16, h4, false)
  return out
}

function hmacSha1(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const block = 64
  const k = key.length > block ? sha1(key) : key
  const kp = new Uint8Array(block)
  kp.set(k)
  const ipad = new Uint8Array(block), opad = new Uint8Array(block)
  for (let i = 0; i < block; i++) { ipad[i] = kp[i] ^ 0x36; opad[i] = kp[i] ^ 0x5c }
  const inner = new Uint8Array(block + msg.length)
  inner.set(ipad); inner.set(msg, block)
  const outer = new Uint8Array(block + 20)
  outer.set(opad); outer.set(sha1(inner), block)
  return sha1(outer)
}

function hashPassword(pw: string, salt: string): string {
  let h = hmacSha1(strBytes(salt), strBytes(pw))
  for (let i = 0; i < 500; i++) h = hmacSha1(strBytes(salt), h)
  return bytesHex(h)
}

function totpCode(secretB32: string, at = Date.now()): string {
  const keyData = base32Decode(secretB32)
  const counter = Math.floor(at / 30000)
  const buf = new Uint8Array(8)
  new DataView(buf.buffer).setUint32(4, counter, false)
  const sig = hmacSha1(keyData, buf)
  const off = sig[19] & 0x0f
  const code = ((sig[off] & 0x7f) * 0x1000000 + sig[off + 1] * 0x10000 + sig[off + 2] * 0x100 + sig[off + 3]) % 1000000
  return String(code).padStart(6, '0')
}

function AccessSetup({ onDone }: { onDone: (cfg: AuthCfg) => void }) {
  const [pw, setPw] = useState('')
  const [wantTotp, setWantTotp] = useState(false)
  const [ownSecret, setOwnSecret] = useState(false)
  const [secret] = useState(() => base32Encode(randBytes(20)))
  const [userSecret, setUserSecret] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  const effSecret = ownSecret ? userSecret.replace(/\s/g, '').toUpperCase() : secret
  const c = code.replace(/\s/g, '')
  const codeOk = effSecret.length >= 16 && /^[A-Z2-7]+$/.test(effSecret) && c.length === 6 && [0, 1].some(o => totpCode(effSecret, Date.now() - o * 30000) === c)

  const save = () => {
    if (pw.length < 4) { setErr('Пароль должен быть не короче 4 символов'); return }
    if (wantTotp && !codeOk) { setErr('Введи текущий 6-значный код из Google Authenticator'); return }
    const salt = bytesHex(randBytes(8))
    onDone({ hash: hashPassword(pw, salt), salt, totpSecret: wantTotp ? effSecret : undefined })
  }

  return (
    <div className="app lock-screen">
      <div className="lock-card">
        <div className="logo" style={{ justifyContent: 'center', paddingBottom: 6 }}>
          <div className="logo-mark"><Sparkles size={18} /></div><span>Life OS</span>
        </div>
        <h2>Настройка доступа</h2>
        <p className="lock-hint">Приложение только для тебя. Придумай пароль — он откроет доступ на 7 дней, потом попросит снова. На телефоне при первом входе введи тот же пароль.</p>

        <label className="field-label">Пароль</label>
        <input className="text-input" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Придумай пароль (мин. 4 символа)" />

        <div className="track-row" style={{ margin: '6px 0 4px' }}>
          <div className="track-info">
            <span className="tx-name">Google Authenticator</span>
            <span className="tx-cat">дополнительный код из приложения</span>
          </div>
          <div className={`toggle ${wantTotp ? 'on' : ''}`} onClick={() => setWantTotp(w => !w)}><span /></div>
        </div>

        {wantTotp && (
          <div className="totp-setup">
            <div className="timeframe" style={{ marginBottom: 10 }}>
              <button className={`chip click ${!ownSecret ? 'sel' : ''}`} onClick={() => setOwnSecret(false)}>Новый секрет</button>
              <button className={`chip click ${ownSecret ? 'sel' : ''}`} onClick={() => setOwnSecret(true)}>Ввести свой</button>
            </div>
            {ownSecret ? (
              <input className="text-input" value={userSecret} onChange={e => setUserSecret(e.target.value)} placeholder="Вставь секрет (Base32)" />
            ) : (
              <>
                <div className="secret-box">{(secret.match(/.{1,4}/g) || []).join(' ')}</div>
                <p className="tx-cat">Добавь секрет в Google Authenticator: «+» → «Ввести ключ настройки» — затем введи текущий код ниже.</p>
              </>
            )}
            <label className="field-label">Код из Authenticator (для проверки)</label>
            <input className="text-input" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} placeholder="6 цифр" />
            {effSecret.length >= 16 && c.length === 6 && !codeOk && <p className="lock-err">Код не совпадает — проверь и попробуй ещё раз</p>}
          </div>
        )}

        {err && <p className="lock-err">{err}</p>}
        <button className="btn primary full save-btn" data-genui-primary-action onClick={save} disabled={pw.length < 4 || (wantTotp && !codeOk)}>Сохранить доступ</button>
        <p className="tx-cat" style={{ marginTop: 10, textAlign: 'center' }}>Если забудешь пароль — очисти данные сайта в браузере (вместе с данными приложения).</p>
      </div>
    </div>
  )
}

function AccessLock({ cfg, onUnlock }: { cfg: AuthCfg; onUnlock: (days: number) => void }) {
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [days, setDays] = useState(7)

  const unlock = () => {
    const c = code.replace(/\s/g, '').toUpperCase()
    if (hashPassword(pw, cfg.salt) === cfg.hash) { onUnlock(days); return }
    if (cfg.totpSecret && c.length === 6 && [0, 1].some(o => totpCode(cfg.totpSecret!, Date.now() - o * 30000) === c)) { onUnlock(days); return }
    setErr('Неверный пароль или код')
  }

  return (
    <div className="app lock-screen">
      <div className="lock-card">
        <div className="logo" style={{ justifyContent: 'center', paddingBottom: 6 }}>
          <div className="logo-mark"><Sparkles size={18} /></div><span>Life OS</span>
        </div>
        <h2>Доступ закрыт</h2>
        <p className="lock-hint">Введи пароль{cfg.totpSecret ? ' или код из Google Authenticator' : ''}, чтобы открыть приложение.</p>

        <label className="field-label">Пароль</label>
        <input className="text-input" type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && unlock()} placeholder="Твой пароль" />

        {cfg.totpSecret && (
          <>
            <label className="field-label">Код из Authenticator</label>
            <input className="text-input" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && unlock()} placeholder="6 цифр" />
          </>
        )}

        <div className="timeframe" style={{ margin: '12px 0 4px' }}>
          {[{ d: 1, l: '1 день' }, { d: 7, l: '7 дней' }, { d: 30, l: '30 дней' }].map(o => (
            <button key={o.d} className={`chip click ${days === o.d ? 'sel' : ''}`} onClick={() => setDays(o.d)}>{o.l}</button>
          ))}
        </div>

        {err && <p className="lock-err">{err}</p>}
        <button className="btn primary full save-btn" data-genui-primary-action onClick={unlock}>Войти</button>
      </div>
    </div>
  )
}

/* ---------- app shell ---------- */

const VIEWS: Record<string, any> = { dashboard: Dashboard, finance: Finance, invest: Investments, sport: Sport, habits: Habits, plans: Plans, health: Health, food: Food, ai: AI }

const QUICK = [
  { label: 'Расход', tab: 'finance', icon: Wallet, tone: 'violet' },
  { label: 'Тренировка', tab: 'sport', icon: Dumbbell, tone: 'green' },
  { label: 'Привычка', tab: 'habits', icon: Repeat, tone: 'orange' },
  { label: 'Вес', tab: 'health', icon: HeartPulse, tone: 'blue' },
]

function AppContent({ onResetAccess }: any) {
  const [theme, setTheme] = useArtifactState('theme', 'dark')
  const [tab, setTab] = useArtifactState('tab', 'dashboard')
  const [quick, setQuick] = useState(false)
  const [scan, setScan] = useState<'receipt' | 'food' | null>(null)
  const [plan, setPlan] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const View = VIEWS[tab] || Dashboard

  return (
    <div className={`app ${theme}`}>
      <aside className="sidebar">
        <div className="logo"><div className="logo-mark"><Sparkles size={18} /></div><span>Life OS</span></div>
        <nav className="nav">
          {NAV.map(n => {
            const I = n.icon
            return (
              <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
                <I size={19} /><span>{n.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>
            <Settings size={19} /><span>Настройки</span>
          </button>
          <button className="nav-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}<span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">{NAV.find(n => n.id === tab)?.label || 'Обзор'}</div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <View onScan={setScan} onPlan={() => setPlan(true)} />
          </motion.div>
        </AnimatePresence>
      </main>

      <button className="fab" data-genui-primary-action onClick={() => setQuick(true)}><Plus size={22} /></button>

      <AnimatePresence>
        {quick && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setQuick(false)}>
            <motion.div className="sheet" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="sheet-head"><h3>Добавить запись</h3><button className="icon-btn" onClick={() => setQuick(false)}><X size={18} /></button></div>
              <div className="quick-grid">
                {QUICK.map(q => {
                  const I = q.icon
                  return (
                    <button key={q.label} className={`quick-item ${q.tone}`} onClick={() => { setQuick(false); setTab(q.tab) }}>
                      <I size={22} /><span>{q.label}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scan && <Scanner type={scan} onClose={() => setScan(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {plan && <PlanBuilder onClose={() => setPlan(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onResetAccess={onResetAccess} />}
      </AnimatePresence>

      <nav className="bottom-nav">
        {NAV.map(n => {
          const I = n.icon
          return (
            <button key={n.id} className={`bn-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
              <I size={20} />
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useArtifactState('lifeos_auth', null as AuthCfg | null)
  const [authUntil, setAuthUntil] = useArtifactState('lifeos_auth_until', 0)

  const resetAccess = () => {
    setAuth(null)
    setAuthUntil(0)
  }

  if (!auth) {
    return <AccessSetup onDone={(cfg) => { setAuth(cfg); setAuthUntil(Date.now() + 7 * 86400000) }} />
  }

  if (Date.now() > authUntil) {
    return <AccessLock cfg={auth} onUnlock={(days) => setAuthUntil(Date.now() + days * 86400000)} />
  }

  return <AppContent onResetAccess={resetAccess} />
}