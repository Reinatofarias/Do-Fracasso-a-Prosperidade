import type { Dashboard, Transaction } from './transactionService'

export type FinancialInsight = {
  id: string
  tone: 'good' | 'warning' | 'danger'
  title: string
  message: string
}

export function createNarrative(dashboard: Dashboard) {
  const left = dashboard.income - dashboard.expense
  const direction = left >= 0 ? 'sobrou' : 'faltou'
  const ending =
    left >= dashboard.income * 0.1
      ? 'Você está no caminho certo.'
      : left >= 0
        ? 'A margem está curta, mas ainda positiva.'
        : 'É hora de reduzir gastos ou buscar uma entrada.'

  return `Você ganhou ${formatMoney(dashboard.income)}, gastou ${formatMoney(dashboard.expense)} e ${direction} ${formatMoney(Math.abs(left))}. ${ending}`
}

export function generateFinancialInsights(transactions: Transaction[], dashboard: Dashboard): FinancialInsight[] {
  if (!transactions.length) {
    return [
      {
        id: 'empty',
        tone: 'good',
        title: 'Comece simples',
        message: 'Adicione um ganho ou gasto. O sistema calcula o resto para você.',
      },
    ]
  }

  const insights: FinancialInsight[] = []
  const nextNegativeDate = findNegativeBalanceDate(transactions)

  if (dashboard.expense > dashboard.income) {
    insights.push({
      id: 'overspending',
      tone: 'danger',
      title: 'Atenção aos gastos',
      message: 'Você está gastando mais do que ganha neste período.',
    })
  } else {
    insights.push({
      id: 'positive',
      tone: 'good',
      title: 'Fluxo positivo',
      message: 'Se continuar assim, você fechará o mês positivo.',
    })
  }

  if (nextNegativeDate) {
    insights.push({
      id: 'negative-risk',
      tone: 'warning',
      title: 'Risco de saldo negativo',
      message: `Esse ritmo pode te deixar negativo em ${formatDate(nextNegativeDate)}.`,
    })
  }

  if (dashboard.income > 0 && dashboard.result < dashboard.income * 0.1 && dashboard.result >= 0) {
    insights.push({
      id: 'low-margin',
      tone: 'warning',
      title: 'Margem apertada',
      message: 'Sobrou pouco. Antes de assumir outro gasto, confira se ele cabe no mês.',
    })
  }

  return insights.slice(0, 3)
}

export function wouldCreateNegativeBalance(transactions: Transaction[], candidate: { amount: number; type: string; dueDate: string }) {
  const signedAmount = candidate.type === 'INCOME' ? candidate.amount : -candidate.amount
  const ordered = [...transactions, { id: 'candidate', dueDate: candidate.dueDate, signedAmount }]
    .map((item) => ({
      dueDate: item.dueDate,
      signedAmount:
        'signedAmount' in item ? item.signedAmount : item.type === 'INCOME' ? Number(item.amount) : -Number(item.amount),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  let balance = 0
  for (const item of ordered) {
    balance += item.signedAmount
    if (balance < 0) return item.dueDate
  }

  return null
}

function findNegativeBalanceDate(transactions: Transaction[]) {
  const ordered = [...transactions].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  let balance = 0

  for (const item of ordered) {
    balance += item.type === 'INCOME' ? Number(item.amount) : -Number(item.amount)
    if (balance < 0) return item.dueDate
  }

  return null
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
}
