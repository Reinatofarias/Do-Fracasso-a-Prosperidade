import app from '../server/app'
import type { Request, Response } from 'express'

export default function handler(req: Request, res: Response) {
  return app(req, res)
}
