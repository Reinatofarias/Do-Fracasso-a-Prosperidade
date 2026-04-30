export type Profile = {
  id: string
  name: string
  type: 'PERSONAL' | 'BUSINESS'
}

export type Account = {
  id: string
  profileId: string
  name: string
  type: string
  openingBalance?: string | number
}

export type Category = {
  id: string
  profileId: string
  name: string
  type: 'INCOME' | 'EXPENSE'
  color: string
}

export type Transaction = {
  id: string
  profileId: string
  accountId: string
  categoryId?: string | null
  type: 'INCOME' | 'EXPENSE'
  status: 'PENDING' | 'PAID'
  description: string
  amount: string | number
  dueDate: string
  recurring: boolean
  category?: Category | null
  account?: Account
  user?: { name: string }
}

export type TransactionInput = {
  description: string
  amount: string
  dueDate: string
}

export type NormalizedTransactionInput = {
  profileId: string
  accountId: string
  categoryId?: string | null
  type: 'INCOME' | 'EXPENSE'
  status: 'PAID'
  description: string
  amount: number
  dueDate: string
  recurring: boolean
}

export type Dashboard = {
  balance: number
  income: number
  expense: number
  result: number
  byCategory: Array<{ name: string; value: number; color: string }>
}

export type Projection = {
  projection: Array<{ month: number; income: number; expense: number; balance: number; status: string }>
  turnPointMonth: number | null
  recommendation: string
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function parseCurrencyInput(value: string) {
  const normalized = value.trim()
  const isNegative = normalized.startsWith('-')
  const plainNumber = normalized.replace('-', '').trim()

  if (/^\d+(\.\d+)?$/.test(plainNumber)) {
    const parsed = Number(plainNumber)
    return isNegative ? -parsed : parsed
  }

  const digits = normalized.replace(/\D/g, '')
  const parsed = Number(digits) / 100

  if (!Number.isFinite(parsed)) return Number.NaN
  return isNegative ? -parsed : parsed
}

export const demoProfiles: Profile[] = [
  { id: 'personal-default', name: 'Família', type: 'PERSONAL' },
  { id: 'business-default', name: 'Empresa', type: 'BUSINESS' },
]

export const demoAccounts: Account[] = [
  { id: 'personal-account', profileId: 'personal-default', name: 'Conta principal', type: 'CHECKING' },
  { id: 'business-account', profileId: 'business-default', name: 'Caixa empresarial', type: 'CHECKING' },
]

export const demoCategories: Category[] = [
  { id: 'income', profileId: 'personal-default', name: 'Receitas', type: 'INCOME', color: '#2f9e44' },
  { id: 'housing', profileId: 'personal-default', name: 'Moradia', type: 'EXPENSE', color: '#64748b' },
  { id: 'food', profileId: 'personal-default', name: 'Alimentação', type: 'EXPENSE', color: '#f97316' },
  { id: 'transport', profileId: 'personal-default', name: 'Transporte', type: 'EXPENSE', color: '#0ea5e9' },
  { id: 'debt', profileId: 'personal-default', name: 'Dívidas', type: 'EXPENSE', color: '#ef4444' },
]

export const demoTransactions: Transaction[] = [
  {
    id: '1',
    profileId: 'personal-default',
    accountId: 'personal-account',
    categoryId: 'income',
    type: 'INCOME',
    status: 'PAID',
    description: 'Salário',
    amount: 5200,
    dueDate: '2026-04-05',
    recurring: true,
    category: demoCategories[0],
    account: demoAccounts[0],
    user: { name: 'Usuário Principal' },
  },
  {
    id: '2',
    profileId: 'personal-default',
    accountId: 'personal-account',
    categoryId: 'housing',
    type: 'EXPENSE',
    status: 'PAID',
    description: 'Aluguel',
    amount: 1800,
    dueDate: '2026-04-08',
    recurring: true,
    category: demoCategories[1],
    account: demoAccounts[0],
    user: { name: 'Usuário Principal' },
  },
  {
    id: '3',
    profileId: 'personal-default',
    accountId: 'personal-account',
    categoryId: 'food',
    type: 'EXPENSE',
    status: 'PAID',
    description: 'Mercado',
    amount: 980,
    dueDate: '2026-04-15',
    recurring: true,
    category: demoCategories[2],
    account: demoAccounts[0],
    user: { name: 'Esposa' },
  },
]

export async function api<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Erro inesperado.' }))
    throw new Error(body.error || 'Erro inesperado.')
  }

  if (response.status === 204) return undefined as T
  return response.json()
}

export function buildDashboard(transactions: Transaction[]): Dashboard {
  const income = transactions
    .filter((item) => item.type === 'INCOME')
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const expense = transactions
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum + Number(item.amount), 0)

  const byCategory = Object.values(
    transactions
      .filter((item) => item.type === 'EXPENSE')
      .reduce<Record<string, { name: string; value: number; color: string }>>((acc, item) => {
        const name = item.category?.name || 'Outros'
        acc[name] ??= { name, value: 0, color: item.category?.color || '#64748b' }
        acc[name].value += Number(item.amount)
        return acc
      }, {}),
  )

  return { balance: income - expense, income, expense, result: income - expense, byCategory }
}

export function buildProjection(transactions: Transaction[]): Projection {
  const recurring = transactions.filter((item) => item.recurring)
  const income = recurring
    .filter((item) => item.type === 'INCOME')
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const expense = recurring
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum + Number(item.amount), 0)

  let running = 0
  const projection = Array.from({ length: 6 }).map((_, index) => {
    running += income - expense
    return {
      month: index + 1,
      income,
      expense,
      balance: running,
      status: running < 0 ? 'red' : income - expense < income * 0.1 ? 'yellow' : 'green',
    }
  })

  return {
    projection,
    turnPointMonth: projection.find((item) => item.balance >= 0)?.month ?? null,
    recommendation:
      income - expense < 0
        ? `Você precisa virar R$ ${Math.abs(income - expense).toFixed(2)} por mês para parar o déficit.`
        : 'Se continuar assim, você fechará o mês positivo.',
  }
}

export function suggestCategory(description: string, amount: number, categories: Category[]) {
  const text = description.toLowerCase()
  const type = amount >= 0 ? 'INCOME' : 'EXPENSE'
  const rules: Array<{ words: string[]; category: string }> = [
    { words: ['salário', 'salario', 'pix recebido', 'recebido', 'venda'], category: 'Receitas' },
    { words: ['aluguel', 'condomínio', 'condominio', 'luz', 'energia', 'água', 'agua'], category: 'Moradia' },
    { words: ['mercado', 'supermercado', 'ifood', 'restaurante', 'padaria'], category: 'Alimentação' },
    { words: ['uber', '99', 'ônibus', 'onibus', 'combustível', 'combustivel'], category: 'Transporte' },
    { words: ['cartão', 'cartao', 'parcela', 'empréstimo', 'emprestimo', 'dívida', 'divida'], category: 'Dívidas' },
  ]
  const match = rules.find((rule) => rule.words.some((word) => text.includes(word)))
  return (
    categories.find((item) => item.type === type && item.name === match?.category) ||
    categories.find((item) => item.type === type) ||
    null
  )
}

export function normalizeTransactionInput(
  input: TransactionInput,
  profileId: string,
  accounts: Account[],
  categories: Category[],
  preferredAccountId?: string | null,
): NormalizedTransactionInput {
  const description = input.description.trim()
  const amount = parseCurrencyInput(input.amount)
  const preferredAccount = accounts.find((item) => item.id === preferredAccountId)
  const accountId = preferredAccount?.id || accounts.find((item) => item.profileId === profileId)?.id || ''
  const resolvedProfileId = preferredAccount?.profileId || profileId
  const type = amount >= 0 ? 'INCOME' : 'EXPENSE'
  const category = suggestCategory(description, amount, categories.filter((item) => item.profileId === resolvedProfileId))

  return {
    profileId: resolvedProfileId,
    accountId,
    categoryId: category?.id || null,
    type,
    status: 'PAID',
    description,
    amount: Math.abs(amount),
    dueDate: input.dueDate || todayIso(),
    recurring: true,
  }
}

export function validateTransactionInput(input: TransactionInput) {
  if (!input.description.trim()) return 'Informe uma descrição simples, como "Mercado" ou "Salário".'
  if (input.description.trim().length < 2) return 'A descrição precisa ter pelo menos 2 letras.'
  if (!input.amount.trim()) return 'Informe o valor.'

  const amount = parseCurrencyInput(input.amount)
  if (!Number.isFinite(amount) || amount === 0) return 'Informe um valor válido maior que zero.'
  if (!input.dueDate) return 'Informe a data do movimento.'

  return ''
}

export function findDuplicate(transactions: Transaction[], input: NormalizedTransactionInput, editingId?: string | null) {
  return transactions.find(
    (item) =>
      item.id !== editingId &&
      item.description.trim().toLowerCase() === input.description.toLowerCase() &&
      Number(item.amount) === input.amount &&
      item.dueDate.slice(0, 10) === input.dueDate,
  )
}

export function attachLocalRelations(
  transaction: NormalizedTransactionInput & { id: string },
  accounts: Account[],
  categories: Category[],
  userName: string,
): Transaction {
  return {
    ...transaction,
    account: accounts.find((item) => item.id === transaction.accountId),
    category: categories.find((item) => item.id === transaction.categoryId) || null,
    user: { name: userName },
  }
}
