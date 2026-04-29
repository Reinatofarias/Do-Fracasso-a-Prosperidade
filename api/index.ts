import type { Request, Response } from 'express'

type VercelRequest = {
  url?: string
  method?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

export default async function handler(req: Request & VercelRequest, res: Response & VercelResponse) {
  if (req.url?.startsWith('/api/health')) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, name: 'Do Fracasso a Prosperidade' })
  }

  const { default: app } = await import('../server/app.js')
  return app(req, res)
}
