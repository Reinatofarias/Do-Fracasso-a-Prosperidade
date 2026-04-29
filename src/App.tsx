import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import './App.css'

type Profile = {
  id: string
  name: string
  type: 'PERSONAL' | 'BUSINESS'
}

type Account = {
  id: string
  profileId: string
  name: string
  type: string
  openingBalance?: string | number
}

type Category = {
  id: string
  profileId: string
  name: string
  type: 'INCOME' | 'EXPENSE'
  color: string
}

type Transaction = {
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

type Dashboard = {
  balance: number
  income: number
  expense: number
  result: number
  byCategory: Array<{ name: string; value: number; color: string }>
}

type Projection = {
  projection: Array<{ month: number; income: number; expense: number; balance: number; status: string }>
  turnPointMonth: number | null
  recommendation: string
}

type Session = {
  token: string
  user: { name: string; email: string; role: string }
}

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const demoProfiles: Profile[] = [
  { id: 'personal-default', name: 'Família', type: 'PERSONAL' },
  { id: 'business-default', name: 'Empresa', type: 'BUSINESS' },
]

const demoAccounts: Account[] = [
  { id: 'personal-account', profileId: 'personal-default', name: 'Conta principal', type: 'CHECKING' },
  { id: 'business-account', profileId: 'business-default', name: 'Caixa empresarial', type: 'CHECKING' },
]

const demoCategories: Category[] = [
  { id: 'income', profileId: 'personal-default', name: 'Receitas', type: 'INCOME', color: '#2f9e44' },
  { id: 'housing', profileId: 'personal-default', name: 'Moradia', type: 'EXPENSE', color: '#d4af37' },
  { id: 'food', profileId: 'personal-default', name: 'Alimentação', type: 'EXPENSE', color: '#52b788' },
  { id: 'debt', profileId: 'personal-default', name: 'Dívidas', type: 'EXPENSE', color: '#ef4444' },
]

const demoTransactions: Transaction[] = [
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
    status: 'PENDING',
    description: 'Mercado',
    amount: 980,
    dueDate: '2026-04-15',
    recurring: true,
    category: demoCategories[2],
    account: demoAccounts[0],
    user: { name: 'Esposa' },
  },
  {
    id: '4',
    profileId: 'personal-default',
    accountId: 'personal-account',
    categoryId: 'debt',
    type: 'EXPENSE',
    status: 'PENDING',
    description: 'Parcela de dívida',
    amount: 1650,
    dueDate: '2026-04-22',
    recurring: true,
    category: demoCategories[3],
    account: demoAccounts[0],
    user: { name: 'Usuário Principal' },
  },
]

async function api<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
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

function buildDashboard(transactions: Transaction[]): Dashboard {
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
        const name = item.category?.name || 'Sem categoria'
        acc[name] ??= { name, value: 0, color: item.category?.color || '#d4af37' }
        acc[name].value += Number(item.amount)
        return acc
      }, {}),
  )

  return { balance: income - expense, income, expense, result: income - expense, byCategory }
}

function buildProjection(transactions: Transaction[]): Projection {
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
        ? `Seu plano precisa virar ${currency.format(Math.abs(income - expense))} por mês para parar o déficit.`
        : 'Seu fluxo recorrente está positivo. Priorize dívidas caras e construa reserva.',
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const saved = localStorage.getItem('prosperidade.session')
    return saved ? JSON.parse(saved) : null
  })
  const [login, setLogin] = useState({ email: 'voce@prosperidade.local', password: 'prosperidade123' })
  const [loginError, setLoginError] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>(demoProfiles)
  const [accounts, setAccounts] = useState<Account[]>(demoAccounts)
  const [categories, setCategories] = useState<Category[]>(demoCategories)
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions)
  const [activeProfile, setActiveProfile] = useState('personal-default')
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [projection, setProjection] = useState<Projection>(() => buildProjection(demoTransactions))
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'EXPENSE',
    status: 'PAID',
    categoryId: '',
    accountId: '',
    dueDate: new Date().toISOString().slice(0, 10),
    recurring: true,
  })

  const filteredTransactions = useMemo(
    () => transactions.filter((item) => item.profileId === activeProfile),
    [activeProfile, transactions],
  )
  const dashboard = useMemo(() => buildDashboard(filteredTransactions), [filteredTransactions])
  const profileAccounts = accounts.filter((item) => item.profileId === activeProfile)
  const profileCategories = categories.filter((item) => item.profileId === activeProfile)

  useEffect(() => {
    if (!session?.token) return

    Promise.all([
      api<{ profiles: Profile[]; accounts: Account[]; categories: Category[] }>('/api/bootstrap', session.token),
      api<{ transactions: Transaction[] }>(`/api/transactions?profileId=${activeProfile}`, session.token),
    ])
      .then(([bootstrap, transactionData]) => {
        setDemoMode(false)
        setProfiles(bootstrap.profiles)
        setAccounts(bootstrap.accounts)
        setCategories(bootstrap.categories)
        setTransactions(transactionData.transactions)
        setActiveProfile((current) => bootstrap.profiles.some((item) => item.id === current) ? current : bootstrap.profiles[0]?.id)
      })
      .catch(() => {
        setDemoMode(true)
      })
  }, [activeProfile, session?.token])

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setLoginError('')

    try {
      const data = await api<Session>('/api/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify(login),
      })
      localStorage.setItem('prosperidade.session', JSON.stringify(data))
      setSession(data)
      setDemoMode(false)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Não foi possível entrar.')
      setDemoMode(true)
      const demoSession = { token: 'demo', user: { name: 'Modo demonstração', email: login.email, role: 'OWNER' } }
      localStorage.setItem('prosperidade.session', JSON.stringify(demoSession))
      setSession(demoSession)
    }
  }

  async function handleAddTransaction(event: React.FormEvent) {
    event.preventDefault()
    const accountId = form.accountId || profileAccounts[0]?.id || ''
    const categoryId = form.categoryId || profileCategories.find((item) => item.type === form.type)?.id || ''
    const selectedCategory = profileCategories.find((item) => item.id === categoryId)
    const selectedAccount = profileAccounts.find((item) => item.id === accountId)
    const payload = {
      profileId: activeProfile,
      accountId,
      categoryId,
      type: form.type as 'INCOME' | 'EXPENSE',
      status: form.status as 'PENDING' | 'PAID',
      description: form.description,
      amount: Number(form.amount),
      dueDate: form.dueDate,
      recurring: form.recurring,
    }

    if (session?.token && !demoMode) {
      try {
        const data = await api<{ transaction: Transaction }>('/api/transactions', session.token, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setTransactions((current) => [data.transaction, ...current])
      } catch {
        setDemoMode(true)
      }
    }

    if (demoMode || session?.token === 'demo') {
      setTransactions((current) => [
        {
          ...payload,
          id: crypto.randomUUID(),
          category: selectedCategory,
          account: selectedAccount,
          user: { name: session?.user.name || 'Usuário' },
        },
        ...current,
      ])
    }

    setTransactionOpen(false)
    setForm((current) => ({ ...current, description: '', amount: '' }))
  }

  function openTransactionModal() {
    setForm((current) => ({
      ...current,
      accountId: current.accountId || profileAccounts[0]?.id || '',
      categoryId: current.categoryId || profileCategories.find((item) => item.type === current.type)?.id || '',
    }))
    setTransactionOpen(true)
  }

  async function openProjection() {
    setProjectionOpen(true)
    if (session?.token && !demoMode) {
      try {
        const data = await api<Projection>(`/api/projection?profileId=${activeProfile}&months=6`, session.token)
        setProjection(data)
        return
      } catch {
        setDemoMode(true)
      }
    }

    setProjection(buildProjection(filteredTransactions))
  }

  function logout() {
    localStorage.removeItem('prosperidade.session')
    setSession(null)
  }

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-hero">
          <div className="brand-mark">
            <Sparkles size={28} />
          </div>
          <p className="eyebrow">Sistema financeiro familiar e empresarial</p>
          <h1>Do Fracasso a Prosperidade</h1>
          <h2>Vivendo ao invés de sobreviver</h2>
          <blockquote>
            Vocês conhecem o amor de nosso Senhor Jesus Cristo que, sendo rico, tornou-se pobre por amor de vocês, a fim
            de que pela sua pobreza pudessem enriquecer.
            <strong>2 Coríntios 8:9</strong>
          </blockquote>
        </section>

        <form className="login-panel" onSubmit={handleLogin}>
          <ShieldCheck className="panel-icon" size={28} />
          <h3>Acesso restrito</h3>
          <p>Dois usuários: você e sua esposa. No deploy, troque as senhas pelas variáveis da Vercel.</p>
          <label>
            Email
            <input value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={login.password}
              onChange={(event) => setLogin({ ...login, password: event.target.value })}
            />
          </label>
          {loginError ? <span className="form-error">{loginError} Entrando em demonstração.</span> : null}
          <button type="submit">
            Entrar
            <ArrowUpRight size={18} />
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={22} />
          </div>
          <div>
            <strong>Prosperidade</strong>
            <span>Do Fracasso a Prosperidade</span>
          </div>
        </div>

        <nav>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className={profile.id === activeProfile ? 'active' : ''}
              onClick={() => setActiveProfile(profile.id)}
              type="button"
            >
              {profile.type === 'PERSONAL' ? <UserRound size={18} /> : <Building2 size={18} />}
              {profile.name}
            </button>
          ))}
        </nav>

        <div className="verse">
          <span>Base</span>
          <p>2 Coríntios 8:9</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Vivendo ao invés de sobreviver</p>
            <h1>Dashboard financeiro</h1>
          </div>
          <div className="topbar-actions">
            {demoMode ? <span className="demo-pill">Demonstração</span> : null}
            <button className="ghost" type="button" onClick={logout}>
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </header>

        <section className="metrics">
          <Metric title="Saldo projetado" value={dashboard.balance} icon={<WalletCards size={22} />} tone="gold" />
          <Metric title="Receitas" value={dashboard.income} icon={<ArrowUpRight size={22} />} tone="green" />
          <Metric title="Despesas" value={dashboard.expense} icon={<ArrowDownLeft size={22} />} tone="red" />
          <Metric title="Resultado" value={dashboard.result} icon={<TrendingUp size={22} />} tone="green" />
        </section>

        <section className="actions-row">
          <button type="button" onClick={openTransactionModal}>
            <Plus size={18} />
            Novo lançamento
          </button>
          <button className="secondary" type="button" onClick={openProjection}>
            <Target size={18} />
            Projeção financeira
          </button>
        </section>

        <section className="grid">
          <div className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <span>Fluxo</span>
                <h3>Receitas x despesas</h3>
              </div>
              <CalendarDays size={20} />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={[{ name: 'Atual', receitas: dashboard.income, despesas: dashboard.expense }]}>
                <CartesianGrid stroke="#243127" vertical={false} />
                <XAxis dataKey="name" stroke="#8fa99a" />
                <YAxis stroke="#8fa99a" />
                <Tooltip contentStyle={{ background: '#11170f', border: '1px solid #31402b' }} />
                <Bar dataKey="receitas" fill="#2f9e44" radius={[6, 6, 0, 0]} />
                <Bar dataKey="despesas" fill="#d4af37" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <span>Categorias</span>
                <h3>Onde o dinheiro está indo</h3>
              </div>
              <CircleDollarSign size={20} />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={dashboard.byCategory} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92}>
                  {dashboard.byCategory.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => currency.format(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>Últimos movimentos</span>
              <h3>Lançamentos</h3>
            </div>
            <Landmark size={20} />
          </div>
          <div className="transactions">
            {filteredTransactions.map((item) => (
              <article key={item.id} className="transaction">
                <div className={`transaction-icon ${item.type.toLowerCase()}`}>
                  {item.type === 'INCOME' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                </div>
                <div>
                  <strong>{item.description}</strong>
                  <span>{item.category?.name || 'Sem categoria'} · {item.account?.name || 'Conta'}</span>
                </div>
                <span className={item.status === 'PAID' ? 'status paid' : 'status pending'}>
                  {item.status === 'PAID' ? 'Pago' : 'Pendente'}
                </span>
                <strong className={item.type === 'INCOME' ? 'money-positive' : 'money-negative'}>
                  {item.type === 'INCOME' ? '+' : '-'} {currency.format(Number(item.amount))}
                </strong>
              </article>
            ))}
          </div>
        </section>
      </section>

      {transactionOpen ? (
        <Modal title="Novo lançamento" onClose={() => setTransactionOpen(false)}>
          <form className="transaction-form" onSubmit={handleAddTransaction}>
            <label>
              Descrição
              <input
                required
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <label>
              Valor
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Tipo
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      type: event.target.value,
                      categoryId:
                        profileCategories.find((item) => item.type === event.target.value)?.id || form.categoryId,
                    })
                  }
                >
                  <option value="EXPENSE">Despesa</option>
                  <option value="INCOME">Receita</option>
                </select>
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="PAID">Pago</option>
                  <option value="PENDING">Pendente</option>
                </select>
              </label>
            </div>
            <label>
              Categoria
              <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                {profileCategories
                  .filter((item) => item.type === form.type)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Conta
              <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
                {profileAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(event) => setForm({ ...form, recurring: event.target.checked })}
              />
              Repetir na projeção mensal
            </label>
            <button type="submit">
              <CheckCircle2 size={18} />
              Salvar lançamento
            </button>
          </form>
        </Modal>
      ) : null}

      {projectionOpen ? (
        <Modal title="Projeção financeira" onClose={() => setProjectionOpen(false)}>
          <div className="projection">
            <div className="projection-callout">
              <Target size={24} />
              <div>
                <strong>
                  {projection.turnPointMonth
                    ? `Virada estimada no mês ${projection.turnPointMonth}`
                    : 'Ainda sem virada no horizonte projetado'}
                </strong>
                <p>{projection.recommendation}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={projection.projection}>
                <CartesianGrid stroke="#243127" vertical={false} />
                <XAxis dataKey="month" tickFormatter={(value) => `M${value}`} stroke="#8fa99a" />
                <YAxis stroke="#8fa99a" />
                <Tooltip formatter={(value) => currency.format(Number(value))} />
                <Area type="monotone" dataKey="balance" stroke="#2f9e44" fill="#2f9e4440" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="practice-list">
              <span>Boas práticas</span>
              <p>Corte o que é variável antes de atrasar compromissos fixos.</p>
              <p>Ao ficar positivo, direcione parte do excedente para reserva de emergência.</p>
              <p>Separe lançamentos pessoais e empresariais para enxergar a origem do problema.</p>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  )
}

function Metric({
  title,
  value,
  icon,
  tone,
}: {
  title: string
  value: number
  icon: React.ReactNode
  tone: 'gold' | 'green' | 'red'
}) {
  return (
    <article className={`metric ${tone}`}>
      <span>{icon}</span>
      <p>{title}</p>
      <strong>{currency.format(value)}</strong>
    </article>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar modal">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export default App
