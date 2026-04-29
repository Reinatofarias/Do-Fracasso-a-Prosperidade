import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

type UserRole = 'OWNER' | 'SPOUSE'

const jwtSecret = () => process.env.JWT_SECRET || 'dev-only-change-this-secret'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: UserRole
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

export function signSession(user: AuthUser) {
  return jwt.sign(user, jwtSecret(), { expiresIn: '7d' })
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined

  if (!token) {
    return res.status(401).json({ error: 'Sessao nao autenticada.' })
  }

  try {
    req.user = jwt.verify(token, jwtSecret()) as AuthUser
    return next()
  } catch {
    return res.status(401).json({ error: 'Sessao expirada ou invalida.' })
  }
}
