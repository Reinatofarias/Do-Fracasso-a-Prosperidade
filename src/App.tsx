import { useCallback, useEffect, useMemo, useState } from 'react'
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
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  Landmark,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useTransactions } from './hooks/useTransactions'
import {
  api,
  suggestCategory,
  todayIso,
  type Projection,
  type Profile,
  type Transaction,
  type TransactionInput,
} from './services/transactionService'
import { createNarrative, generateFinancialInsights, wouldCreateNegativeBalance } from './services/financialInsightsService'
import './App.css'

type Session = {
  token: string
  user: { name: string; email: string; role: string }
}

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const demoLoginEnabled = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true'

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const saved = localStorage.getItem('prosperidade.session')
    return saved ? JSON.parse(saved) : null
  })
  const [login, setLogin] = useState({ email: 'voce@prosperidade.local', password: 'prosperidade123' })
  const [loginError, setLoginError] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [activeProfile, setActiveProfile] = useState('personal-default')
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [projection, setProjection] = useState<Projection | null>(null)
  const [form, setForm] = useState<TransactionInput>({ description: '', amount: '', dueDate: todayIso() })
  const [formError, setFormError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [toast, setToast] = useState('')
  const [sessionChecked, setSessionChecked] = useState(() => !localStorage.getItem('prosperidade.session'))

  const handleDemoMode = useCallback(() => setDemoMode(true), [])
  const handleProfilesLoaded = useCallback((profiles: Profile[]) => {
    setActiveProfile((current) => (profiles.some((item) => item.id === current) ? current : profiles[0]?.id || current))
  }, [])

  const {
    profiles,
    categories,
    transactions,
    dashboard,
    loading,
    error,
    deletedTransaction,
    emptyInput,
    saveTransaction,
    deleteTransaction,
    undoDelete,
    loadProjection,
  } = useTransactions({
    token: session?.token,
    userName: session?.user.name || 'Usuário',
    demoMode,
    activeProfile,
    onDemoMode: handleDemoMode,
    onProfilesLoaded: handleProfilesLoaded,
  })

  const insights = useMemo(() => generateFinancialInsights(transactions, dashboard), [dashboard, transactions])
  const narrative = useMemo(() => createNarrative(dashboard), [dashboard])
  const suggestions = useMemo(
    () => Array.from(new Set(transactions.map((item) => item.description))).slice(0, 8),
    [transactions],
  )

  useEffect(() => {
    if (!session?.token) return

    let cancelled = false
    const token = session.token

    async function validateSession() {
      if (token === 'demo') {
        if (demoLoginEnabled) {
          if (!cancelled) {
            setDemoMode(true)
            setSessionChecked(true)
          }
          return
        }

        localStorage.removeItem('prosperidade.session')
        if (!cancelled) {
          setSession(null)
          setDemoMode(false)
          setSessionChecked(true)
        }
        return
      }

      try {
        await api<{ user: Session['user'] }>('/api/me', token)
        if (!cancelled) setSessionChecked(true)
      } catch {
        localStorage.removeItem('prosperidade.session')
        if (!cancelled) {
          setSession(null)
          setDemoMode(false)
          setSessionChecked(true)
        }
      }
    }

    validateSession()

    return () => {
      cancelled = true
    }
  }, [session?.token])

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
    } catch (caught) {
      setLoginError(caught instanceof Error ? caught.message : 'Não foi possível entrar.')
      if (demoLoginEnabled) {
        const demoSession = { token: 'demo', user: { name: 'Modo demonstração', email: login.email, role: 'OWNER' } }
        localStorage.setItem('prosperidade.session', JSON.stringify(demoSession))
        setSession(demoSession)
        setDemoMode(true)
      }
    }
  }

  function openCreateTransaction() {
    setEditingTransaction(null)
    setForm(emptyInput)
    setFormError('')
    setDuplicateWarning(false)
    setTransactionOpen(true)
  }

  function openEditTransaction(transaction: Transaction) {
    setEditingTransaction(transaction)
    setForm({
      description: transaction.description,
      amount: transaction.type === 'EXPENSE' ? `-${Number(transaction.amount)}` : String(transaction.amount),
      dueDate: transaction.dueDate.slice(0, 10),
    })
    setFormError('')
    setDuplicateWarning(false)
    setTransactionOpen(true)
  }

  async function handleSaveTransaction(event: React.FormEvent, allowDuplicate = false) {
    event.preventDefault()
    setFormError('')

    const result = await saveTransaction(form, { editingId: editingTransaction?.id, allowDuplicate })
    if (!result.ok) {
      setFormError(result.error)
      setDuplicateWarning(Boolean(result.duplicate))
      return
    }

    setToast(editingTransaction ? 'Movimento atualizado.' : 'Movimento adicionado.')
    setTransactionOpen(false)
    setEditingTransaction(null)
    setForm(emptyInput)
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    const confirmed = window.confirm(`Excluir "${transaction.description}"? Você poderá desfazer logo em seguida.`)
    if (!confirmed) return

    const deleted = await deleteTransaction(transaction)
    if (deleted) {
      setTransactionOpen(false)
      setEditingTransaction(null)
      setToast('Lançamento removido')
    }
  }

  async function handleUndoDelete() {
    await undoDelete()
    setToast('Exclusão desfeita.')
  }

  async function openProjection() {
    setProjectionOpen(true)
    setProjection(await loadProjection())
  }

  function logout() {
    localStorage.removeItem('prosperidade.session')
    setSession(null)
    setDemoMode(false)
  }

  const normalizedAmount = Number(form.amount.replace(',', '.'))
  const possibleNegativeDate =
    Number.isFinite(normalizedAmount) && normalizedAmount < 0
      ? wouldCreateNegativeBalance(transactions, {
          amount: Math.abs(normalizedAmount),
          type: 'EXPENSE',
          dueDate: form.dueDate || todayIso(),
        })
      : null
  const selectedCategory = Number.isFinite(normalizedAmount)
    ? suggestCategory(form.description, normalizedAmount, categories)
    : null

  if (!sessionChecked) {
    return (
      <main className="login-shell">
        <section className="login-hero">
          <div className="brand-mark">
            <Sparkles size={28} />
          </div>
          <p className="eyebrow">Sistema financeiro familiar e empresarial</p>
          <h1>Do Fracasso a Prosperidade</h1>
          <h2>Validando sessão...</h2>
        </section>
      </main>
    )
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
          <p>Entre para cuidar dos ganhos e gastos sem precisar conhecer termos financeiros.</p>
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
          {loginError ? <span className="form-error">{loginError}</span> : null}
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
            <p className="eyebrow">Visão simples do seu dinheiro</p>
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

        <section className="hero-actions">
          <div className="narrative">
            <span>Resumo do mês</span>
            <strong>{narrative}</strong>
          </div>
          <button className="primary-action" type="button" onClick={openCreateTransaction}>
            <Plus size={20} />
            Adicionar movimento
          </button>
        </section>

        {error ? (
          <section className="state error-state">
            <AlertTriangle size={22} />
            <strong>Não foi possível carregar tudo agora.</strong>
            <span>{error}</span>
          </section>
        ) : null}

        <section className="metrics">
          <Metric title="Saldo" value={dashboard.balance} icon={<WalletCards size={22} />} tone="gold" />
          <Metric title="Entradas" value={dashboard.income} icon={<ArrowUpRight size={22} />} tone="green" />
          <Metric title="Saídas" value={dashboard.expense} icon={<ArrowDownLeft size={22} />} tone="red" />
          <Metric title="Sobrou" value={dashboard.result} icon={<TrendingUp size={22} />} tone={dashboard.result >= 0 ? 'green' : 'red'} />
        </section>

        <section className="insights">
          {insights.map((insight) => (
            <article key={insight.id} className={`insight ${insight.tone}`}>
              <Sparkles size={18} />
              <div>
                <strong>{insight.title}</strong>
                <span>{insight.message}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="actions-row">
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
                <h3>Entradas x saídas</h3>
              </div>
              <CalendarDays size={20} />
            </div>
            {loading ? <LoadingState /> : null}
            {!loading && transactions.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[{ name: 'Atual', entradas: dashboard.income, saidas: dashboard.expense }]}>
                  <CartesianGrid stroke="#d9e2dc" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Bar dataKey="entradas" fill="#2f9e44" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="saidas" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
            {!loading && !transactions.length ? <EmptyChartState /> : null}
          </div>

          <div className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <span>Categorias</span>
                <h3>Onde o dinheiro saiu</h3>
              </div>
              <CircleDollarSign size={20} />
            </div>
            {dashboard.byCategory.length ? (
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
            ) : (
              <EmptyChartState />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>Toque em um item para editar</span>
              <h3>Movimentos</h3>
            </div>
            <Landmark size={20} />
          </div>
          {loading ? <LoadingState /> : null}
          {!loading && !transactions.length ? (
            <section className="empty-state">
              <WalletCards size={28} />
              <strong>Você ainda não adicionou nenhum movimento.</strong>
              <span>Comece adicionando seu primeiro ganho ou gasto.</span>
              <button type="button" onClick={openCreateTransaction}>
                <Plus size={18} />
                Adicionar movimento
              </button>
            </section>
          ) : null}
          {!loading && transactions.length ? (
            <div className="transactions">
              {transactions.map((item) => (
                <button key={item.id} className="transaction" type="button" onClick={() => openEditTransaction(item)}>
                  <div className={`transaction-icon ${item.type.toLowerCase()}`}>
                    {item.type === 'INCOME' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </div>
                  <div>
                    <strong>{item.description}</strong>
                    <span>{item.category?.name || 'Categoria sugerida'} · {item.dueDate.slice(0, 10)}</span>
                  </div>
                  <span className="status paid">Pago</span>
                  <strong className={item.type === 'INCOME' ? 'money-positive' : 'money-negative'}>
                    {item.type === 'INCOME' ? '+' : '-'} {currency.format(Number(item.amount))}
                  </strong>
                  <Edit3 className="row-action" size={17} />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      <button className="fab" type="button" onClick={openCreateTransaction} aria-label="Adicionar movimento">
        <Plus size={28} />
      </button>

      {toast ? (
        <div className="toast" role="status">
          <span>{toast}</span>
          {deletedTransaction ? (
            <button type="button" onClick={handleUndoDelete}>
              Desfazer
            </button>
          ) : (
            <button type="button" onClick={() => setToast('')}>
              Fechar
            </button>
          )}
        </div>
      ) : null}

      {transactionOpen ? (
        <Modal title={editingTransaction ? 'Editar movimento' : 'Adicionar movimento'} onClose={() => setTransactionOpen(false)}>
          <form className="transaction-form" onSubmit={handleSaveTransaction}>
            <label>
              Descrição
              <input
                required
                list="transaction-suggestions"
                placeholder="Ex: Salário, mercado, aluguel"
                value={form.description}
                onChange={(event) => {
                  setDuplicateWarning(false)
                  setForm({ ...form, description: event.target.value })
                }}
              />
              <datalist id="transaction-suggestions">
                {suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </label>
            <label>
              Valor
              <input
                required
                type="number"
                step="0.01"
                placeholder="100 entra, -16 sai"
                value={form.amount}
                onChange={(event) => {
                  setDuplicateWarning(false)
                  setForm({ ...form, amount: event.target.value })
                }}
              />
            </label>
            <label>
              Data
              <input
                required
                type="date"
                value={form.dueDate}
                onChange={(event) => {
                  setDuplicateWarning(false)
                  setForm({ ...form, dueDate: event.target.value })
                }}
              />
            </label>
            <div className="smart-help">
              <CheckCircle2 size={18} />
              <span>
                Valor positivo vira entrada. Valor negativo vira saída. O movimento será salvo como pago.
                {selectedCategory ? ` Categoria sugerida: ${selectedCategory.name}.` : ''}
              </span>
            </div>
            {possibleNegativeDate ? (
              <div className="smart-help warning">
                <AlertTriangle size={18} />
                <span>Esse gasto pode te deixar negativo em {possibleNegativeDate.slice(8, 10)}/{possibleNegativeDate.slice(5, 7)}.</span>
              </div>
            ) : null}
            {formError ? <span className="form-error">{formError}</span> : null}
            <div className="modal-actions">
              {editingTransaction ? (
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => handleDeleteTransaction(editingTransaction)}
                >
                  <Trash2 size={18} />
                  Excluir
                </button>
              ) : null}
              {duplicateWarning ? (
                <button className="secondary-submit" type="button" onClick={(event) => handleSaveTransaction(event, true)}>
                  Salvar mesmo assim
                </button>
              ) : null}
              <button type="submit">
                <CheckCircle2 size={18} />
                Salvar
              </button>
            </div>
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
                  {projection?.turnPointMonth
                    ? `Virada estimada no mês ${projection.turnPointMonth}`
                    : 'Ainda sem virada no horizonte projetado'}
                </strong>
                <p>{projection?.recommendation || 'Calculando sua projeção...'}</p>
              </div>
            </div>
            {projection ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={projection.projection}>
                  <CartesianGrid stroke="#d9e2dc" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(value) => `M${value}`} stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Area type="monotone" dataKey="balance" stroke="#2f9e44" fill="#2f9e4440" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <LoadingState />
            )}
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

function LoadingState() {
  return (
    <section className="state">
      <span className="loader" />
      <strong>Carregando seus movimentos...</strong>
    </section>
  )
}

function EmptyChartState() {
  return (
    <section className="state empty-mini">
      <WalletCards size={24} />
      <strong>Sem dados para mostrar.</strong>
    </section>
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
