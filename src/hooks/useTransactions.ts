import { useEffect, useMemo, useState } from 'react'
import {
  api,
  attachLocalRelations,
  buildDashboard,
  buildProjection,
  demoAccounts,
  demoCategories,
  demoProfiles,
  demoTransactions,
  findDuplicate,
  normalizeTransactionInput,
  todayIso,
  validateTransactionInput,
  type Account,
  type Category,
  type Profile,
  type Projection,
  type Transaction,
  type TransactionInput,
} from '../services/transactionService'

type UseTransactionsOptions = {
  token?: string
  userName: string
  demoMode: boolean
  activeProfile: string
  onDemoMode: () => void
  onProfilesLoaded: (profiles: Profile[]) => void
}

type SaveOptions = {
  editingId?: string | null
  allowDuplicate?: boolean
  accountId?: string | null
}

export function useTransactions({
  token,
  userName,
  demoMode,
  activeProfile,
  onDemoMode,
  onProfilesLoaded,
}: UseTransactionsOptions) {
  const [profiles, setProfiles] = useState<Profile[]>(demoProfiles)
  const [accounts, setAccounts] = useState<Account[]>(demoAccounts)
  const [categories, setCategories] = useState<Category[]>(demoCategories)
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletedTransaction, setDeletedTransaction] = useState<Transaction | null>(null)

  const filteredTransactions = useMemo(
    () => transactions.filter((item) => item.profileId === activeProfile),
    [activeProfile, transactions],
  )
  const dashboard = useMemo(() => buildDashboard(filteredTransactions), [filteredTransactions])

  useEffect(() => {
    if (!token || token === 'demo' || demoMode) return

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const [bootstrap, transactionData] = await Promise.all([
          api<{ profiles: Profile[]; accounts: Account[]; categories: Category[] }>('/api/bootstrap', token),
          api<{ transactions: Transaction[] }>(`/api/transactions?profileId=${activeProfile}`, token),
        ])
        if (cancelled) return
        setProfiles(bootstrap.profiles)
        setAccounts(bootstrap.accounts)
        setCategories(bootstrap.categories)
        setTransactions(transactionData.transactions)
        onProfilesLoaded(bootstrap.profiles)
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'Não foi possível carregar seus movimentos.')
        onDemoMode()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [activeProfile, demoMode, onDemoMode, onProfilesLoaded, token])

  async function saveTransaction(input: TransactionInput, options: SaveOptions = {}) {
    const validation = validateTransactionInput(input)
    if (validation) return { ok: false as const, error: validation }

    const fallbackAccountId = options.accountId || accounts.find((item) => item.profileId === activeProfile)?.id || null
    const normalized = normalizeTransactionInput(input, activeProfile, accounts, categories, fallbackAccountId)
    if (!normalized.accountId) return { ok: false as const, error: 'Crie ou selecione uma conta padrão antes de lançar.' }

    const duplicatePool = options.accountId
      ? filteredTransactions.filter((transaction) => transaction.accountId === options.accountId)
      : filteredTransactions
    const duplicate = findDuplicate(duplicatePool, normalized, options.editingId)
    if (duplicate && !options.allowDuplicate) {
      return {
        ok: false as const,
        duplicate: true,
        error: 'Já existe um movimento igual nessa data. Deseja salvar mesmo assim?',
      }
    }

    setError('')

    if (token && token !== 'demo' && !demoMode) {
      try {
        const path = options.editingId ? `/api/transactions/${options.editingId}` : '/api/transactions'
        const data = await api<{ transaction: Transaction }>(path, token, {
          method: options.editingId ? 'PUT' : 'POST',
          body: JSON.stringify(normalized),
        })
        setTransactions((current) =>
          options.editingId
            ? current.map((item) => (item.id === options.editingId ? data.transaction : item))
            : [data.transaction, ...current],
        )
        return { ok: true as const, transaction: data.transaction }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.')
        onDemoMode()
      }
    }

    const local = attachLocalRelations(
      { ...normalized, id: options.editingId || crypto.randomUUID() },
      accounts,
      categories,
      userName,
    )
    setTransactions((current) =>
      options.editingId ? current.map((item) => (item.id === options.editingId ? local : item)) : [local, ...current],
    )
    return { ok: true as const, transaction: local }
  }

  async function deleteTransaction(transaction: Transaction) {
    setError('')

    if (token && token !== 'demo' && !demoMode) {
      try {
        await api<void>(`/api/transactions/${transaction.id}`, token, { method: 'DELETE' })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível excluir.')
        return false
      }
    }

    setTransactions((current) => current.filter((item) => item.id !== transaction.id))
    setDeletedTransaction(transaction)
    return true
  }

  async function undoDelete() {
    if (!deletedTransaction) return
    const restored = deletedTransaction
    setDeletedTransaction(null)

    if (token && token !== 'demo' && !demoMode) {
      try {
        const data = await api<{ transaction: Transaction }>('/api/transactions', token, {
          method: 'POST',
          body: JSON.stringify({
            profileId: restored.profileId,
            accountId: restored.accountId,
            categoryId: restored.categoryId,
            type: restored.type,
            status: restored.status,
            description: restored.description,
            amount: Number(restored.amount),
            dueDate: restored.dueDate.slice(0, 10),
            recurring: restored.recurring,
          }),
        })
        setTransactions((current) => [data.transaction, ...current])
        return
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível desfazer.')
      }
    }

    setTransactions((current) => [restored, ...current])
  }

  async function loadProjection(accountId?: string | null) {
    if (accountId) return buildProjection(filteredTransactions.filter((transaction) => transaction.accountId === accountId))

    if (token && token !== 'demo' && !demoMode) {
      try {
        return await api<Projection>(`/api/projection?profileId=${activeProfile}&months=6`, token)
      } catch {
        onDemoMode()
      }
    }

    return buildProjection(filteredTransactions)
  }

  return {
    profiles,
    accounts,
    categories,
    transactions: filteredTransactions,
    dashboard,
    loading,
    error,
    deletedTransaction,
    emptyInput: { description: '', amount: '', dueDate: todayIso() },
    saveTransaction,
    deleteTransaction,
    undoDelete,
    loadProjection,
  }
}
