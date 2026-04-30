import type { Transaction } from './transactionService'

export type FinancialPlan = {
  totalEntradas: number
  totalSaidas: number
  saldo: number
  status: 'positivo' | 'alerta' | 'negativo'
}

export function getFinancialPlan(transactions: Transaction[]): FinancialPlan {
  const totalEntradas = transactions
    .filter((transaction) => transaction.type === 'INCOME')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)

  const totalSaidas = transactions
    .filter((transaction) => transaction.type === 'EXPENSE')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)

  const saldo = totalEntradas - totalSaidas

  return {
    totalEntradas,
    totalSaidas,
    saldo,
    status: saldo > 0 ? 'positivo' : saldo < 0 ? 'negativo' : 'alerta',
  }
}
