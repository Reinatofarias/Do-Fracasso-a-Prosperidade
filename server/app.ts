import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getPrisma } from './db.js'
import { requireAuth, signSession, type AuthUser } from './auth.js'

const app = express()

app.use(cors())
app.use(express.json())

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const transactionSchema = z.object({
  profileId: z.string(),
  accountId: z.string(),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE']),
  status: z.enum(['PENDING', 'PAID']).default('PAID'),
  description: z.string().min(2),
  amount: z.coerce.number().positive(),
  dueDate: z.coerce.date(),
  paidAt: z.coerce.date().optional().nullable(),
  recurring: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Do Fracasso a Prosperidade' })
})

app.post('/api/auth/login', async (req, res) => {
  const input = loginSchema.safeParse(req.body)
  if (!input.success) return res.status(400).json({ error: 'Dados invalidos.' })

  const prisma = getPrisma()
  const user = await prisma.user.findUnique({ where: { email: input.data.email.toLowerCase() } })
  if (!user) return res.status(401).json({ error: 'Email ou senha invalidos.' })

  const valid = await bcrypt.compare(input.data.password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Email ou senha invalidos.' })

  const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role }
  res.json({ token: signSession(sessionUser), user: sessionUser })
})

app.get('/api/me', requireAuth, (_req, res) => {
  res.json({ user: res.locals.user })
})

app.get('/api/bootstrap', requireAuth, async (_req, res) => {
  const prisma = getPrisma()
  const [profiles, accounts, categories] = await Promise.all([
    prisma.profile.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.account.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.category.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
  ])

  res.json({ profiles, accounts, categories })
})

app.get('/api/transactions', requireAuth, async (req, res) => {
  const prisma = getPrisma()
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined
  const transactions = await prisma.transaction.findMany({
    where: profileId ? { profileId } : undefined,
    include: { account: true, category: true, user: { select: { name: true } } },
    orderBy: { dueDate: 'desc' },
    take: 100,
  })

  res.json({ transactions })
})

app.post('/api/transactions', requireAuth, async (req, res) => {
  const input = transactionSchema.safeParse(req.body)
  const authUser = res.locals.user as AuthUser | undefined
  if (!input.success || !authUser) return res.status(400).json({ error: 'Lancamento invalido.' })

  const prisma = getPrisma()
  const transaction = await prisma.transaction.create({
    data: {
      ...input.data,
      userId: authUser.id,
      amount: input.data.amount,
    },
    include: { account: true, category: true, user: { select: { name: true } } },
  })

  res.status(201).json({ transaction })
})

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  const prisma = getPrisma()
  await prisma.transaction.delete({ where: { id: String(req.params.id) } })
  res.status(204).end()
})

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const prisma = getPrisma()
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined
  const transactions = await prisma.transaction.findMany({
    where: profileId ? { profileId } : undefined,
    include: { account: true, category: true },
  })

  const totals = transactions.reduce(
    (acc, item) => {
      const amount = Number(item.amount)
      if (item.type === 'INCOME') acc.income += amount
      if (item.type === 'EXPENSE') acc.expense += amount
      return acc
    },
    { income: 0, expense: 0 },
  )

  const balance = totals.income - totals.expense
  const byCategory = Object.values(
    transactions
      .filter((item) => item.type === 'EXPENSE')
      .reduce<Record<string, { name: string; value: number; color: string }>>((acc, item) => {
        const key = item.category?.name || 'Sem categoria'
        acc[key] ??= { name: key, value: 0, color: item.category?.color || '#d4af37' }
        acc[key].value += Number(item.amount)
        return acc
      }, {}),
  )

  res.json({ balance, income: totals.income, expense: totals.expense, result: balance, byCategory })
})

app.get('/api/projection', requireAuth, async (req, res) => {
  const prisma = getPrisma()
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined
  const months = Number(req.query.months || 6)
  const transactions = await prisma.transaction.findMany({
    where: {
      ...(profileId ? { profileId } : {}),
      recurring: true,
    },
  })

  let running = 0
  const projection = Array.from({ length: months }).map((_, index) => {
    const income = transactions
      .filter((item) => item.type === 'INCOME')
      .reduce((sum, item) => sum + Number(item.amount), 0)
    const expense = transactions
      .filter((item) => item.type === 'EXPENSE')
      .reduce((sum, item) => sum + Number(item.amount), 0)

    running += income - expense
    return {
      month: index + 1,
      income,
      expense,
      balance: running,
      status: running < 0 ? 'red' : income - expense < income * 0.1 ? 'yellow' : 'green',
    }
  })

  const turnPoint = projection.find((item) => item.balance >= 0)
  const monthlyGap = projection[0] ? projection[0].income - projection[0].expense : 0
  const recommendation =
    monthlyGap < 0
      ? `Reduza despesas ou aumente receitas em pelo menos R$ ${Math.abs(monthlyGap).toFixed(2)} por mes para parar de aprofundar o deficit.`
      : 'Seu fluxo recorrente esta positivo. Direcione o excedente para quitar pendencias e formar reserva.'

  res.json({ projection, turnPointMonth: turnPoint?.month ?? null, recommendation })
})

export default app
