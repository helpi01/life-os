import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useArtifactState } from './dsh-sdk-shim'
import {
  LayoutDashboard, Wallet, Dumbbell, Repeat, HeartPulse, Utensils, Sparkles,
  Sun, Moon, Plus, X, TrendingUp, Flame,
  Droplet, BookOpen, Ban, Activity, ArrowUpRight, ArrowDownRight, Brain,
  Camera, ScanLine, Loader2, CheckCircle2, ImagePlus, ListTodo, Target, CalendarDays,
  Settings, Crown, Flag, KeyRound, Eye, EyeOff, Check,
  MessageSquare, LineChart, Landmark, Coins, RefreshCw, Trash2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { CATEGORIES, MEALS, TYPES, HABIT_META } from './data'
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

const ACHIEVEMENTS = [
  { id: 1, name: 'Первая тренировка', icon: Dumbbell },
  { id: 2, name: '7 дней подряд', icon: Flame },
  { id: 3, name: 'Первая неделя учёта', icon: CalendarDays },
  { id: 4, name: 'Накопил 10 000 ₽', icon: Wallet },
  { id: 5, name: 'Прочитал 5 книг', icon: BookOpen },
  { id: 6, name: 'Пробежал 10 км', icon: Activity },
]

function Dashboard() {
  const [txs] = useArtifactState('lifeos_tx', [] as Tx[])
  const [food] = useArtifactState('lifeos_food', [] as FoodEntry[])
  const [workouts] = useArtifactState('lifeos_workouts', [] as Workout[])
  const [habits] = useArtifactState('lifeos_habits', [] as Habit[])
  const [quests, setQuests] = useArtifactState('lifeos_quests', [] as Quest[])
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

  const addQuest = (v: Record<string, string>) => {
    setQuests(q => [...q, { id: Date.now(), name: v.name, total: Math.max(1, Number(v.total) || 1) }])
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
            <div className="level-title"><span>Уровень 1</span><span className="level-rank">Новичок</span></div>
            <div className="xp-bar"><div className="xp-fill" style={{ width: '0%' }} /></div>
            <span className="stat-sub">Веди учёт — получай XP за задачи и привычки</span>
          </div>
        </div>
        <div className="achievements">
          {ACHIEVEMENTS.map(a => {
            const I = a.icon
            return (
              <div key={a.id} className="ach" title={a.name}>
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

  const addTx = (v: Record<string, string>) => {
    setTxs(t => [{ id: Date.now(), name: v.name, cat: v.cat, amount: -Math.abs(Number(v.amount)), date: todayISO() }, ...t])
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

  const refresh = () => {
    if (checking) return
    setChecking(true)
    setUpdated(false)
    setTimeout(() => {
      setChecking(false)
      setUpdated(true)
      setNews(n => [{ title: 'ИИ ещё не подключён — это демо-строка. Подключи модель в настройках.', source: 'Демо', time: 'только что', sentiment: 'neutral' }, ...n])
      setSignals(s => [...s, {
        ticker: holdings.length ? holdings[0].ticker : '—',
        action: 'Держать',
        confidence: 60,
        reason: holdings.length ? 'Демо-сигнал: точные сигналы появятся после подключения ИИ' : 'Добавь активы, чтобы ИИ мог давать сигналы',
      }])
    }, 1700)
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

  const week = workouts.filter(w => diffDays(w.date) < 7)
  const weekKcal = week.reduce((s, w) => s + w.kcal, 0)
  const weekMin = week.reduce((s, w) => s + w.durMin, 0)

  const addWorkout = (v: Record<string, string>) => {
    setWorkouts(w => [{ id: Date.now(), name: v.name, date: todayISO(), durMin: Number(v.durMin), kcal: Number(v.kcal) }, ...w])
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

  const done = habits.filter(h => h.done).length
  const bestStreak = habits.reduce((m, h) => Math.max(m, h.streak), 0)

  const addHabit = (v: Record<string, string>) => {
    setHabits(h => [...h, { id: Date.now(), name: v.name, icon: v.icon, done: false, streak: 0 }])
    setAdding(false)
  }
  const toggle = (id: number) => setHabits(h => h.map(x => x.id === id ? { ...x, done: !x.done, streak: x.done ? x.streak : x.streak + 1 } : x))

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

  const done = tasks.filter(t => t.done).length

  const addTask = (v: Record<string, string>) => {
    setTasks(t => [{ id: Date.now(), name: v.name, done: false, prio: v.prio }, ...t])
    setAdding(false)
  }
  const toggle = (id: number) => setTasks(t => t.map(x => x.id === id ? { ...x, done: !x.done } : x))

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

  const current = log.length ? log[0].value : null
  const change = log.length > 1 ? Math.round((log[0].value - log[log.length - 1].value) * 10) / 10 : null

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

      <div className="grid-3">
        <StatCard icon={Activity} label="Текущий вес" value={current === null ? '—' : current + ' кг'} sub={change === null ? 'запиши первый вес' : (change > 0 ? '+' : '') + change + ' кг по записям'} tone="violet" />
        <StatCard icon={Target} label="Цель" value={goal ? goal + ' кг' : '—'} sub="задай в карточке ниже" tone="green" />
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

  const today = todayISO()
  const todayFood = food.filter(f => f.date === today)
  const todayKcal = todayFood.reduce((s, f) => s + f.kcal, 0)

  const addFood = (v: Record<string, string>) => {
    setFood(f => [{ id: Date.now(), name: v.name, meal: v.meal, kcal: Number(v.kcal), date: today }, ...f])
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
        <div className="card-head">
          <h3>Дневник питания</h3>
          <div className="add-btn-row">
            <button className="btn scan sm" onClick={() => onScan('food')}><ImagePlus size={15} /> Фото (демо)</button>
            <button className="btn primary sm" onClick={() => setAdding(true)}>+ Запись</button>
          </div>
        </div>
        {food.length === 0 ? (
          <Empty text="Добавь, что сегодня съел, — или сфотографируй блюдо (распознавание станет настоящим после подключения ИИ)" action={<button className="btn primary sm" onClick={() => setAdding(true)}>+ Запись</button>} />
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
  const send = () => {
    if (!input.trim()) return
    setMsgs(m => [...m, { role: 'user', text: input }])
    setInput('')
    setTimeout(() => setMsgs(m => [...m, { role: 'ai', text: 'Пока я работаю в демо-режиме. Подключи текстовую модель в настройках (шестерёнка сверху) — и я буду отвечать по твоим данным.' }]), 600)
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

function ModelChannel({ title, desc, icon: Icon, providers, provider, setProvider, model, setModel, keyVal, setKeyVal, customUrl, setCustomUrl }: any) {
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
          <label className="field-label">Base URL агрегатора</label>
          <input className="text-input" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://api.aggregator.com/v1" />
          <label className="field-label">Название модели</label>
          <input className="text-input" value={model} onChange={e => setModel(e.target.value)} placeholder="например: gpt-4o, claude-3-5-sonnet…" />
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

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [visionProvider, setVisionProvider] = useArtifactState('ai_vision_provider', 'gemini')
  const [visionModel, setVisionModel] = useArtifactState('ai_vision_model', 'gemini-2.5-flash')
  const [textProvider, setTextProvider] = useArtifactState('ai_text_provider', 'deepseek')
  const [textModel, setTextModel] = useArtifactState('ai_text_model', 'deepseek-chat')
  const [customUrl, setCustomUrl] = useArtifactState('ai_custom_url', '')
  const [visionKey, setVisionKey] = useState('')
  const [textKey, setTextKey] = useState('')
  const [saved, setSaved] = useState(false)

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
          />

          <div className="card">
            <div className="card-head"><h3>Рекомендация</h3><span className="chip ai"><Sparkles size={13} /> ИИ</span></div>
            <div className="insights">
              <div className="insight"><Sparkles size={16} /><p>Для фото лучше всего Gemini 2.5 Flash (дёшево и точный OCR), для текста — DeepSeek (в 5–10× дешевле при том же качестве).</p></div>
            </div>
          </div>

          <div className="card danger-zone">
            <div className="card-head"><h3>Данные</h3><span className="chip">Этот браузер</span></div>
            <p className="settings-hint">Все показания хранятся только в этом браузере на этом устройстве. Сброс удалит расходы, тренировки, привычки и настройки.</p>
            <button className="btn danger" onClick={resetAll}><Trash2 size={16} /> Сбросить все данные</button>
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
  const [step, setStep] = useState<'capture' | 'analyzing' | 'result'>('capture')
  const start = () => {
    setStep('analyzing')
    setTimeout(() => setStep('result'), 1900)
  }
  const isReceipt = type === 'receipt'
  const total = RECEIPT_ITEMS.reduce((s, i) => s + i.price, 0)

  return (
    <motion.div className="overlay center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{isReceipt ? 'Сканер чеков' : 'Распознавание еды'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {step === 'capture' && (
          <div className="scan-zone" onClick={start}>
            <div className="scan-icon">{isReceipt ? <ScanLine size={30} /> : <Camera size={30} />}</div>
            <p className="scan-title">{isReceipt ? 'Сфотографируйте чек' : 'Сфотографируйте блюдо'}</p>
            <p className="scan-hint">ИИ прочитает {isReceipt ? 'позиции и сумму' : 'калории и БЖУ'} автоматически</p>
            <button className="btn primary sm">Сделать фото</button>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="scan-zone analyzing">
            <Loader2 size={34} className="spin" />
            <p className="scan-title">ИИ распознаёт…</p>
            <p className="scan-hint">{isReceipt ? 'Читаю текст и определяю категории' : 'Оцениваю состав и калорийность'}</p>
          </div>
        )}

        {step === 'result' && (
          <div className="scan-result">
            <div className="result-head">
              <CheckCircle2 size={20} className="ok" />
              <span>{isReceipt ? 'Пример распознавания' : 'Пример распознавания'}</span>
              <span className="chip" style={{ marginLeft: 'auto' }}>Демо</span>
            </div>

            {isReceipt ? (
              <>
                <div className="result-store">Супермаркет «Пятёрочка»</div>
                <div className="receipt-items">
                  {RECEIPT_ITEMS.map((it, i) => (
                    <div key={i} className="receipt-item"><span>{it.name}</span><b>{it.price} ₽</b></div>
                  ))}
                </div>
                <div className="receipt-total"><span>Итого</span><b>{total} ₽</b></div>
                <div className="result-cat"><span className="chip ai"><Sparkles size={13} /> Категория: Еда</span></div>
                <p className="weight-note">Настоящее распознавание заработает после подключения Vision-модели в настройках.</p>
              </>
            ) : (
              <>
                <div className="result-store">{FOOD_RESULT.name}</div>
                <div className="macro-grid">
                  <div className="macro"><span>Калории</span><b>{FOOD_RESULT.kcal}</b><small>ккал</small></div>
                  <div className="macro"><span>Белки</span><b>{FOOD_RESULT.protein}</b><small>г</small></div>
                  <div className="macro"><span>Жиры</span><b>{FOOD_RESULT.fat}</b><small>г</small></div>
                  <div className="macro"><span>Углеводы</span><b>{FOOD_RESULT.carbs}</b><small>г</small></div>
                </div>
                <p className="weight-note">Настоящее распознавание заработает после подключения Vision-модели в настройках.</p>
              </>
            )}

            <button className="btn primary full" onClick={onClose}>Готово</button>
          </div>
        )}
      </motion.div>
    </motion.div>
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

  const generate = () => {
    if (!goal.trim()) return
    setStep('generating')
    setTimeout(() => setStep('result'), 2000)
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
            <button className="btn primary full" onClick={generate} disabled={!goal.trim()}><Sparkles size={16} /> Составить план</button>
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
              <span>Пример плана</span>
              <span className="chip" style={{ marginLeft: 'auto' }}>Демо</span>
            </div>
            <div className="plan-goal">{goal}</div>
            <div className="plan-meta"><CalendarDays size={14} /> {timeframe} · 4 этапа</div>
            <div className="plan-weeks">
              {PLAN.map((w, wi) => (
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

/* ---------- app shell ---------- */

const VIEWS: Record<string, any> = { dashboard: Dashboard, finance: Finance, invest: Investments, sport: Sport, habits: Habits, plans: Plans, health: Health, food: Food, ai: AI }

const QUICK = [
  { label: 'Расход', tab: 'finance', icon: Wallet, tone: 'violet' },
  { label: 'Тренировка', tab: 'sport', icon: Dumbbell, tone: 'green' },
  { label: 'Привычка', tab: 'habits', icon: Repeat, tone: 'orange' },
  { label: 'Вес', tab: 'health', icon: HeartPulse, tone: 'blue' },
]

export default function App() {
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
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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