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
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  Landmark,
  LogOut,
  Plus,
  PiggyBank,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useTransactions } from './hooks/useTransactions'
import {
  api,
  buildDashboard,
  parseCurrencyInput,
  suggestCategory,
  todayIso,
  type Account,
  type Dashboard,
  type Projection,
  type Profile,
  type Transaction,
  type TransactionInput,
} from './services/transactionService'
import { generateFinancialInsights, wouldCreateNegativeBalance } from './services/financialInsightsService'
import { getFinancialPlan, type FinancialPlan } from './services/planningService'
import './App.css'

type Session = {
  token: string
  user: { name: string; email: string; role: string }
}

type CurrentAccount = {
  id: string
  name: string
  type: 'all' | 'personal' | 'business' | 'create-profile'
  profileId?: string
  accountId?: string
  aggregate?: boolean
  disabled?: boolean
  localOnly?: boolean
}

type LocalProfile = {
  id: string
  name: string
  type: 'personal' | 'business'
}

type TransactionTypeChoice = 'INCOME' | 'EXPENSE' | 'SAVE'

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatCurrencyInput(value: string | number) {
  const cents = Math.round(Math.abs(Number(value)) * 100)
  return currency.format(cents / 100)
}

function maskCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '')
  return currency.format(Number(digits || '0') / 100)
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`),
  )
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getTransactionMonthKey(transaction: Transaction) {
  const date = new Date(`${transaction.dueDate.slice(0, 10)}T00:00:00`)
  return getMonthKey(date)
}

function getMonthlyBalance(transactions: Transaction[], monthKey: string) {
  return transactions
    .filter((transaction) => getTransactionMonthKey(transaction) === monthKey)
    .reduce((sum, transaction) => {
      const amount = Number(transaction.amount)
      return transaction.type === 'INCOME' ? sum + amount : sum - amount
    }, 0)
}

function getMonthlyProgress(transactions: Transaction[]) {
  const today = new Date()
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const currentMonthKey = getMonthKey(today)
  const previousMonthKey = getMonthKey(previousMonth)
  const hasPreviousData = transactions.some((transaction) => getTransactionMonthKey(transaction) === previousMonthKey)

  if (!hasPreviousData) return null

  const currentBalance = getMonthlyBalance(transactions, currentMonthKey)
  const previousBalance = getMonthlyBalance(transactions, previousMonthKey)
  const difference = currentBalance - previousBalance

  return {
    tone: difference >= 0 ? 'positive' : 'negative',
    amount: Math.abs(difference),
    message:
      difference >= 0
        ? `Você melhorou ${currency.format(Math.abs(difference))} em relação ao mês passado.`
        : `Você piorou ${currency.format(Math.abs(difference))} em relação ao mês passado.`,
  }
}

function getSuggestedAction(status: FinancialStatus['tone']) {
  if (status === 'positive') return 'Você está indo bem. Continue economizando.'
  if (status === 'negative') return 'Atenção: reduza gastos para equilibrar seu mês.'
  return 'Tente manter saldo positivo este mês.'
}

function buildAccountContexts(profiles: Profile[], accounts: Account[], localProfiles: LocalProfile[]): CurrentAccount[] {
  const personalProfile = profiles.find((profile) => profile.type === 'PERSONAL') || profiles[0]
  const personalAccount = accounts.find((account) => account.profileId === personalProfile?.id)
  const businessProfiles = profiles.filter((profile) => profile.type === 'BUSINESS')
  const businessAccounts = accounts.filter((account) =>
    businessProfiles.some((profile) => profile.id === account.profileId),
  )
  const businessLabels = ['Empresa A', 'Empresa B']

  const contexts: CurrentAccount[] = [
    {
      id: 'all',
      name: 'Todos os perfis',
      type: 'all',
      aggregate: true,
    },
    {
      id: 'personal',
      name: 'Família',
      type: 'personal',
      profileId: personalProfile?.id,
      accountId: personalAccount?.id,
      disabled: !personalProfile || !personalAccount,
    },
  ]

  businessLabels.forEach((label, index) => {
    const account = businessAccounts[index]
    const profile = account ? profiles.find((item) => item.id === account.profileId) : businessProfiles[index]
    contexts.push({
      id: `business-${index + 1}`,
      name: label,
      type: 'business',
      profileId: profile?.id,
      accountId: account?.id,
      disabled: !profile || !account,
    })
  })

  localProfiles.forEach((profile) => {
    contexts.push({
      id: profile.id,
      name: profile.name,
      type: profile.type,
      localOnly: true,
    })
  })

  contexts.push({
    id: 'create-profile',
    name: '+ Criar novo perfil',
    type: 'create-profile',
  })

  return contexts
}

const demoLoginEnabled = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true'

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const saved = localStorage.getItem('prosperidade.session')
    return saved ? JSON.parse(saved) : null
  })
  const [login, setLogin] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [activeProfile, setActiveProfile] = useState('personal-default')
  const [currentAccount, setCurrentAccount] = useState<CurrentAccount>({
    id: 'personal',
    name: 'Família',
    type: 'personal',
  })
  const [localProfiles, setLocalProfiles] = useState<LocalProfile[]>(() => {
    const saved = localStorage.getItem('prosperidade.localProfiles')
    return saved ? JSON.parse(saved) : []
  })
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileForm, setProfileForm] = useState<{ name: string; type: 'personal' | 'business' }>({
    name: '',
    type: 'business',
  })
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [projection, setProjection] = useState<Projection | null>(null)
  const [form, setForm] = useState<TransactionInput>({ description: '', amount: '', dueDate: todayIso() })
  const [transactionType, setTransactionType] = useState<TransactionTypeChoice>('EXPENSE')
  const [formError, setFormError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [toast, setToast] = useState('')
  const [activeNavigation, setActiveNavigation] = useState('dashboard')
  const [movementFilter, setMovementFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [sessionChecked, setSessionChecked] = useState(() => !localStorage.getItem('prosperidade.session'))

  const handleDemoMode = useCallback(() => setDemoMode(true), [])
  const handleProfilesLoaded = useCallback((profiles: Profile[]) => {
    setActiveProfile((current) => (profiles.some((item) => item.id === current) ? current : profiles[0]?.id || current))
  }, [])

  const {
    profiles,
    accounts,
    categories,
    transactions: loadedTransactions,
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

  const accountContexts = useMemo(() => buildAccountContexts(profiles, accounts, localProfiles), [accounts, localProfiles, profiles])
  const resolvedAccount = useMemo(
    () =>
      accountContexts.find((account) => account.id === currentAccount.id && !account.disabled) ||
      accountContexts.find((account) => account.id === 'personal' && !account.disabled) ||
      accountContexts[0] ||
      currentAccount,
    [accountContexts, currentAccount],
  )
  const transactions = useMemo(
    () =>
      resolvedAccount?.localOnly
        ? []
        : resolvedAccount?.aggregate || !resolvedAccount?.accountId
        ? loadedTransactions
        : loadedTransactions.filter((transaction) => transaction.accountId === resolvedAccount.accountId),
    [resolvedAccount, loadedTransactions],
  )
  const dashboard = useMemo(() => buildDashboard(transactions), [transactions])
  const insights = useMemo(() => generateFinancialInsights(transactions, dashboard), [dashboard, transactions])
  const financialPlan = useMemo(() => getFinancialPlan(transactions), [transactions])
  const financialStatus = useMemo(() => getFinancialStatus(financialPlan, transactions.length), [financialPlan, transactions.length])
  const monthlyProgress = useMemo(() => getMonthlyProgress(transactions), [transactions])
  const suggestedAction = useMemo(() => getSuggestedAction(financialStatus.tone), [financialStatus.tone])
  const suggestions = useMemo(
    () => Array.from(new Set(transactions.map((item) => item.description))).slice(0, 8),
    [transactions],
  )
  const filteredMovements = useMemo(
    () =>
      transactions.filter((transaction) => {
        if (movementFilter === 'income') return transaction.type === 'INCOME'
        if (movementFilter === 'expense') return transaction.type === 'EXPENSE'
        return true
      }),
    [movementFilter, transactions],
  )
  const currentAccountIcon = resolvedAccount?.type === 'business' ? '🏢' : resolvedAccount?.type === 'all' ? '📊' : '🏠'
  const accountKind = resolvedAccount?.type === 'business' ? 'business' : 'personal'
  const canUndoDeletion = toast === 'Lançamento removido' && Boolean(deletedTransaction)

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

  useEffect(() => {
    localStorage.setItem('prosperidade.localProfiles', JSON.stringify(localProfiles))
  }, [localProfiles])

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
    if (resolvedAccount?.localOnly) {
      setToast('Perfil temporário criado. Para lançar movimentos nele, será preciso persistência real no backend.')
      return
    }
    setEditingTransaction(null)
    setForm(emptyInput)
    setTransactionType('EXPENSE')
    setFormError('')
    setDuplicateWarning(false)
    setTransactionOpen(true)
  }

  function openEditTransaction(transaction: Transaction) {
    setEditingTransaction(transaction)
    setTransactionType(transaction.description.toLowerCase().includes('guard') && transaction.type === 'INCOME' ? 'SAVE' : transaction.type)
    setForm({
      description: transaction.description,
      amount: formatCurrencyInput(transaction.amount),
      dueDate: transaction.dueDate.slice(0, 10),
    })
    setFormError('')
    setDuplicateWarning(false)
    setTransactionOpen(true)
  }

  async function handleSaveTransaction(event: React.FormEvent, allowDuplicate = false) {
    event.preventDefault()
    setFormError('')

    const parsedAmount = parseCurrencyInput(form.amount)
    const signedAmount = transactionType === 'EXPENSE' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount)
    const description =
      transactionType === 'SAVE' && !form.description.trim() ? 'Guardado' : form.description
    const result = await saveTransaction(
      { ...form, description, amount: Number.isFinite(parsedAmount) ? signedAmount.toFixed(2) : form.amount },
      { editingId: editingTransaction?.id, allowDuplicate, accountId: resolvedAccount?.accountId },
    )
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
    setProjection(await loadProjection(resolvedAccount?.aggregate ? null : resolvedAccount?.accountId))
  }

  function logout() {
    localStorage.removeItem('prosperidade.session')
    setSession(null)
    setDemoMode(false)
  }

  function selectAccount(accountId: string) {
    const nextAccount = accountContexts.find((account) => account.id === accountId)
    if (!nextAccount || nextAccount.disabled) return
    if (nextAccount.id === 'create-profile') {
      setProfileForm({ name: '', type: 'business' })
      setProfileModalOpen(true)
      return
    }

    setCurrentAccount(nextAccount)
    if (nextAccount.profileId) setActiveProfile(nextAccount.profileId)
    setToast(`Você está em ${nextAccount.name}.`)
  }

  function handleCreateProfile(event: React.FormEvent) {
    event.preventDefault()
    const name = profileForm.name.trim()
    if (!name) return

    const newProfile: LocalProfile = {
      id: `local-${crypto.randomUUID()}`,
      name,
      type: profileForm.type,
    }
    setLocalProfiles((current) => [...current, newProfile])
    setCurrentAccount({
      id: newProfile.id,
      name: newProfile.name,
      type: newProfile.type,
      localOnly: true,
    })
    setProfileModalOpen(false)
    setToast('Perfil criado nesta sessão.')
  }

  function navigateSidebar(sectionId: string) {
    setActiveNavigation(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const normalizedAmount = parseCurrencyInput(form.amount)
  const possibleNegativeDate =
    Number.isFinite(normalizedAmount) && transactionType === 'EXPENSE'
      ? wouldCreateNegativeBalance(transactions, {
          amount: Math.abs(normalizedAmount),
          type: 'EXPENSE',
          dueDate: form.dueDate || todayIso(),
        })
      : null
  const selectedCategory = Number.isFinite(normalizedAmount) && normalizedAmount > 0
    ? suggestCategory(form.description, transactionType === 'EXPENSE' ? -normalizedAmount : normalizedAmount, categories)
    : null

  if (!sessionChecked) {
    return (
      <main className="login-shell">
        <section className="login-hero">
          <div className="brand-mark">
            <WalletCards size={28} />
          </div>
          <p className="eyebrow">Gestão financeira familiar e empresarial</p>
          <h1>Financeiro Farias</h1>
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
            <WalletCards size={28} />
          </div>
          <p className="eyebrow">Gestão financeira familiar e empresarial</p>
          <h1>Financeiro Farias</h1>
          <h2>Clareza para família e empresas</h2>
          <blockquote>
            Vocês conhecem o amor de nosso Senhor Jesus Cristo que, sendo rico, tornou-se pobre por amor de vocês, a fim
            de que pela sua pobreza pudessem enriquecer.
            <strong>2 Coríntios 8:9</strong>
          </blockquote>
        </section>

        <form className="login-panel" onSubmit={handleLogin} autoComplete="off">
          <WalletCards className="panel-icon" size={28} />
          <h3>Acesso restrito</h3>
          <p>Entre para cuidar dos ganhos e gastos sem precisar conhecer termos financeiros.</p>
          <label>
            Email
            <input
              autoComplete="off"
              inputMode="email"
              placeholder="seu@email.com"
              value={login.email}
              onChange={(event) => setLogin({ ...login, email: event.target.value })}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="new-password"
              type="password"
              placeholder="Sua senha"
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
            <WalletCards size={22} />
          </div>
          <div>
            <strong>Financeiro Farias</strong>
            <span>Família e empresas</span>
          </div>
        </div>

        <nav aria-label="Navegação principal">
          <button
            className={activeNavigation === 'dashboard' ? 'active' : ''}
            onClick={() => navigateSidebar('dashboard')}
            type="button"
          >
            <WalletCards size={18} />
            Dashboard
          </button>
          <button
            className={activeNavigation === 'movements' ? 'active' : ''}
            onClick={() => navigateSidebar('movements')}
            type="button"
          >
            <Landmark size={18} />
            Movimentos
          </button>
          <button
            className={activeNavigation === 'reports' ? 'active' : ''}
            onClick={() => navigateSidebar('reports')}
            type="button"
          >
            <CircleDollarSign size={18} />
            Relatórios
          </button>
          <button
            className={activeNavigation === 'settings' ? 'active' : ''}
            onClick={() => navigateSidebar('settings')}
            type="button"
          >
            <WalletCards size={18} />
            Configurações
          </button>
        </nav>

        <div className="verse">
          <span>Base</span>
          <p>2 Coríntios 8:9</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" id="dashboard">
          <div>
            <p className="eyebrow">Visão simples do seu dinheiro</p>
            <h1>Dashboard financeiro</h1>
            <div className="context-pill">Você está em: {currentAccountIcon} {resolvedAccount?.name || 'Família'}</div>
          </div>
          <div className="topbar-actions">
            <label className="account-switcher">
              <span>Perfil</span>
              <select value={resolvedAccount?.id || currentAccount.id} onChange={(event) => selectAccount(event.target.value)}>
                {accountContexts.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.disabled}>
                    {account.type === 'business' ? '🏢 ' : account.type === 'create-profile' ? '' : account.type === 'all' ? '📊 ' : '🏠 '}
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            {demoMode ? <span className="demo-pill">Demonstração</span> : null}
            <button className="ghost" type="button" onClick={logout}>
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </header>

        <FinancialStatusHero
          dashboard={dashboard}
          status={financialStatus}
          suggestedAction={suggestedAction}
          onAddMovement={openCreateTransaction}
        />

        {error ? (
          <section className="state error-state">
            <AlertTriangle size={22} />
            <strong>Não foi possível carregar tudo agora.</strong>
            <span>{error}</span>
          </section>
        ) : null}

        <section className="metrics">
          <Metric
            title="Sobrou no mês"
            value={dashboard.result}
            icon={dashboard.result >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
            tone={dashboard.result >= 0 ? 'green' : 'red'}
            featured
          />
          <Metric title="Entradas" value={dashboard.income} icon={<ArrowUpRight size={22} />} tone="green" />
          <Metric title="Saídas" value={dashboard.expense} icon={<ArrowDownLeft size={22} />} tone="red" />
          <Metric
            title="💰 Total guardado"
            value={dashboard.balance}
            icon={<WalletCards size={22} />}
            tone="gold"
            description={
              accountKind === 'business'
                ? `Você tem ${currency.format(dashboard.balance)} guardados`
                : `Você tem ${currency.format(dashboard.balance)} guardados`
            }
            emphasis="asset"
          />
        </section>

        {monthlyProgress ? (
          <section className={`progress-callout ${monthlyProgress.tone}`}>
            {monthlyProgress.tone === 'positive' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            <span>{monthlyProgress.message}</span>
          </section>
        ) : null}

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

        <section className="grid" id="reports">
          <div className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <span>Fluxo</span>
                <h3>Entradas x saídas</h3>
              </div>
              <TrendBadge dashboard={dashboard} />
            </div>
            {loading ? <LoadingState /> : null}
            {!loading && transactions.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[{ name: 'Atual', entradas: dashboard.income, saidas: dashboard.expense }]}>
                  <CartesianGrid stroke="#24312b" vertical={false} />
                  <XAxis dataKey="name" stroke="#91a39a" />
                  <YAxis stroke="#91a39a" />
                  <Tooltip
                    formatter={(value) => currency.format(Number(value))}
                    contentStyle={{ background: '#111715', border: '1px solid #1c2622', color: '#f2f7f4' }}
                  />
                  <Bar dataKey="entradas" fill="#2f9e44" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="saidas" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
            {!loading && !transactions.length ? (
              <EmptyChartState message="Adicione movimentos para visualizar como seu dinheiro entra e sai." />
            ) : null}
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
                  <Tooltip
                    formatter={(value) => currency.format(Number(value))}
                    contentStyle={{ background: '#111715', border: '1px solid #1c2622', color: '#f2f7f4' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState message="Seus gastos aparecerão aqui organizados por categoria." />
            )}
          </div>
        </section>

        <section className="panel" id="movements">
          <div className="panel-heading">
            <div>
              <span>{currentAccountIcon} {resolvedAccount?.name || 'Família'}</span>
              <h3>Movimentos</h3>
            </div>
            <Landmark size={20} />
          </div>
          <div className="movement-filters" role="group" aria-label="Filtrar movimentos">
            <button className={movementFilter === 'all' ? 'active' : ''} type="button" onClick={() => setMovementFilter('all')}>
              Todos
            </button>
            <button
              className={movementFilter === 'income' ? 'active income' : 'income'}
              type="button"
              onClick={() => setMovementFilter('income')}
            >
              Entradas
            </button>
            <button
              className={movementFilter === 'expense' ? 'active expense' : 'expense'}
              type="button"
              onClick={() => setMovementFilter('expense')}
            >
              Saídas
            </button>
          </div>
          {loading ? <LoadingState /> : null}
          {!loading && !transactions.length ? (
            <section className="empty-state">
              <WalletCards size={28} />
              <strong>Você ainda não tem movimentações</strong>
              <PrimaryActionButton onClick={openCreateTransaction} />
            </section>
          ) : null}
          {!loading && transactions.length && !filteredMovements.length ? (
            <section className="empty-state compact">
              <WalletCards size={24} />
              <strong>Nenhum movimento nesse filtro</strong>
            </section>
          ) : null}
          {!loading && filteredMovements.length ? (
            <div className="transactions">
              {filteredMovements.map((item) => (
                <article key={item.id} className="transaction">
                  <div className={`transaction-icon ${item.type.toLowerCase()}`}>
                    {item.type === 'INCOME' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </div>
                  <div>
                    <strong>{item.description}</strong>
                    <span>{formatDateLabel(item.dueDate)} · {item.type === 'INCOME' ? 'Entrada' : 'Saída'}</span>
                  </div>
                  <strong className={item.type === 'INCOME' ? 'money-positive' : 'money-negative'}>
                    {item.type === 'INCOME' ? '+' : '-'} {currency.format(Number(item.amount))}
                  </strong>
                  <div className="transaction-actions">
                    <button type="button" onClick={() => openEditTransaction(item)} aria-label={`Editar ${item.description}`}>
                      <Edit3 size={16} />
                      Editar
                    </button>
                    <button
                      className="danger-inline"
                      type="button"
                      onClick={() => handleDeleteTransaction(item)}
                      aria-label={`Excluir ${item.description}`}
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel settings-panel" id="settings">
          <div className="panel-heading">
            <div>
              <span>Preferências</span>
              <h3>Configurações</h3>
            </div>
            <WalletCards size={20} />
          </div>
          <p>
            O contexto financeiro é escolhido no seletor de perfil no topo. Configurações persistentes de novos perfis
            exigem evolução futura no backend.
          </p>
        </section>
      </section>

      <button className="fab" type="button" onClick={openCreateTransaction} aria-label="Adicionar movimento">
        <Plus size={28} />
      </button>

      {toast ? (
        <div className="toast" role="status">
          <span>{toast}</span>
          {canUndoDeletion ? (
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
            <div className="movement-type" role="group" aria-label="Tipo do movimento">
              <button
                className={transactionType === 'INCOME' ? 'active income' : 'income'}
                type="button"
                onClick={() => setTransactionType('INCOME')}
              >
                <ArrowUpRight size={18} />
                Entrada
              </button>
              <button
                className={transactionType === 'SAVE' ? 'active save' : 'save'}
                type="button"
                onClick={() => {
                  setTransactionType('SAVE')
                  setForm((current) => ({
                    ...current,
                    description: current.description.trim() ? current.description : 'Guardado',
                  }))
                }}
              >
                <PiggyBank size={18} />
                Guardar
              </button>
              <button
                className={transactionType === 'EXPENSE' ? 'active expense' : 'expense'}
                type="button"
                onClick={() => setTransactionType('EXPENSE')}
              >
                <ArrowDownLeft size={18} />
                Saída
              </button>
            </div>
            <label>
              Valor
              <input
                required
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={form.amount}
                onChange={(event) => {
                  setDuplicateWarning(false)
                  setForm({ ...form, amount: maskCurrencyInput(event.target.value) })
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
            {selectedCategory ? (
              <div className="smart-help">
                <CheckCircle2 size={18} />
                <span>Categoria sugerida: {selectedCategory.name}.</span>
              </div>
            ) : null}
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
                {transactionType === 'SAVE' ? 'Guardar' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {profileModalOpen ? (
        <Modal title="Criar novo perfil" onClose={() => setProfileModalOpen(false)}>
          <form className="profile-form" onSubmit={handleCreateProfile}>
            <label>
              Nome do perfil
              <input
                required
                placeholder="Ex: Empresa de consultoria"
                value={profileForm.name}
                onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
              />
            </label>
            <div className="movement-type" role="group" aria-label="Tipo do perfil">
              <button
                className={profileForm.type === 'personal' ? 'active income' : 'income'}
                type="button"
                onClick={() => setProfileForm({ ...profileForm, type: 'personal' })}
              >
                <UserRound size={18} />
                Pessoal
              </button>
              <button
                className={profileForm.type === 'business' ? 'active income' : 'income'}
                type="button"
                onClick={() => setProfileForm({ ...profileForm, type: 'business' })}
              >
                <Building2 size={18} />
                Empresa
              </button>
            </div>
            <div className="smart-help warning">
              <AlertTriangle size={18} />
              <span>Este perfil é temporário e fica salvo apenas neste navegador. A persistência real exige evolução futura no backend.</span>
            </div>
            <div className="modal-actions">
              <button className="secondary-submit" type="button" onClick={() => setProfileModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit">
                <CheckCircle2 size={18} />
                Criar perfil
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
                  <CartesianGrid stroke="#24312b" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(value) => `M${value}`} stroke="#91a39a" />
                  <YAxis stroke="#91a39a" />
                  <Tooltip
                    formatter={(value) => currency.format(Number(value))}
                    contentStyle={{ background: '#111715', border: '1px solid #1c2622', color: '#f2f7f4' }}
                  />
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

type FinancialStatus = {
  tone: 'positive' | 'warning' | 'negative' | 'neutral'
  title: string
  message: string
  label: string
}

function getFinancialStatus(plan: FinancialPlan, transactionCount: number): FinancialStatus {
  if (!transactionCount) {
    return {
      tone: 'neutral',
      title: 'Vamos começar simples',
      message: 'Adicione um ganho ou gasto. O sistema organiza o resto pra você.',
      label: 'Situação: ATENÇÃO',
    }
  }

  if (plan.status === 'negativo') {
    return {
      tone: 'negative',
      title: 'Atenção: você está gastando mais do que ganha',
      message: `Faltam ${currency.format(Math.abs(plan.saldo))} para fechar o mês no positivo.`,
      label: 'Situação: NEGATIVA',
    }
  }

  if (plan.status === 'alerta') {
    return {
      tone: 'warning',
      title: 'Mês no limite',
      message: 'Entradas e saídas estão empatadas. Qualquer novo gasto deixa o mês negativo.',
      label: 'Situação: ATENÇÃO',
    }
  }

  return {
    tone: 'positive',
    title: 'Você está no caminho certo',
    message: `Você ganhou ${currency.format(plan.totalEntradas)}, gastou ${currency.format(plan.totalSaidas)} e sobrou ${currency.format(plan.saldo)}.`,
    label: 'Situação: POSITIVA',
  }
}

function FinancialStatusHero({
  dashboard,
  status,
  suggestedAction,
  onAddMovement,
}: {
  dashboard: Dashboard
  status: FinancialStatus
  suggestedAction: string
  onAddMovement: () => void
}) {
  return (
    <section className={`financial-hero ${status.tone}`}>
      <div className="status-copy">
        <div className="status-kicker">
          <span className="status-dot" />
          {status.label}
        </div>
        <h2>{status.title}</h2>
        <div className="hero-breakdown">
          <span>Você ganhou <strong>{currency.format(dashboard.income)}</strong></span>
          <span>Gastou <strong>{currency.format(dashboard.expense)}</strong></span>
          <span>Sobrou <strong>{currency.format(dashboard.result)}</strong></span>
        </div>
        <p className="hero-next-step">👉 {suggestedAction}</p>
      </div>
      <div className="hero-money">
        <span>Sobrou no mês</span>
        <strong>{currency.format(dashboard.result)}</strong>
        <PrimaryActionButton onClick={onAddMovement} />
      </div>
    </section>
  )
}

function PrimaryActionButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="primary-action" type="button" onClick={onClick}>
      <Plus size={20} />
      Adicionar movimento
    </button>
  )
}

function TrendBadge({ dashboard }: { dashboard: Dashboard }) {
  const positive = dashboard.result >= 0
  return (
    <div className={`trend-badge ${positive ? 'positive' : 'negative'}`}>
      {positive ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
      {positive ? 'Tendência positiva' : 'Tendência negativa'}
    </div>
  )
}

function Metric({
  title,
  value,
  icon,
  tone,
  description,
  emphasis,
  featured = false,
}: {
  title: string
  value: number
  icon: React.ReactNode
  tone: 'gold' | 'green' | 'red'
  description?: string
  emphasis?: 'asset'
  featured?: boolean
}) {
  return (
    <article className={`metric ${tone}${featured ? ' featured' : ''}${emphasis ? ` ${emphasis}` : ''}`}>
      <span>{icon}</span>
      <p>{title}</p>
      <strong>{currency.format(value)}</strong>
      {description ? <small>{description}</small> : null}
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

function EmptyChartState({ message }: { message: string }) {
  return (
    <section className="state empty-mini">
      <WalletCards size={24} />
      <span>{message}</span>
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
