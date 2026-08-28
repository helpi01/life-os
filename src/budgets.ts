export interface TxLite {
  amount: number;
  date: string;
  cat: string;
}

export type Budgets = Record<string, number>;

export type CategorySpend = {
  name: string;
  spent: number;
  limit: number | null;
  pct: number;
  over: boolean;
};

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function categorySpends(txs: TxLite[], budgets: Budgets): CategorySpend[] {
  const key = currentMonthKey();
  const monthTxs = txs.filter((t) => t.date.slice(0, 7) === key && t.amount < 0);

  const spentByCat = new Map<string, number>();
  for (const t of monthTxs) {
    spentByCat.set(t.cat, (spentByCat.get(t.cat) ?? 0) + -t.amount);
  }

  const result: CategorySpend[] = [];

  for (const name of Object.keys(budgets)) {
    const spent = Math.round(spentByCat.get(name) ?? 0);
    const limit = budgets[name];
    result.push({
      name,
      spent,
      limit,
      pct: limit ? Math.round((spent / limit) * 100) : 0,
      over: limit !== null && spent > limit,
    });
  }

  const budgetNames = new Set(Object.keys(budgets));
  const remaining = [...spentByCat.keys()]
    .filter((name) => !budgetNames.has(name))
    .sort();

  for (const name of remaining) {
    const spent = Math.round(spentByCat.get(name) ?? 0);
    result.push({
      name,
      spent,
      limit: null,
      pct: 0,
      over: false,
    });
  }

  return result;
}

export function totalSpentMonth(txs: TxLite[]): number {
  const key = currentMonthKey();
  const sum = txs
    .filter((t) => t.date.slice(0, 7) === key && t.amount < 0)
    .reduce((acc, t) => acc + -t.amount, 0);
  return Math.round(sum);
}
