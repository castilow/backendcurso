import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { config } from '../config'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Wrap async handlers so que rejections se enruten al error handler.
 * Express 4 no lo hace por defecto y una promise rejection mata el proceso.
 */
export function asyncHandler<T extends RequestHandler>(fn: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 404 por defecto (al final de la cadena de rutas)
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ ok: false, error: 'Not found' })
}

// Error handler genérico
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status =
    err instanceof HttpError ? err.status : 500
  const message =
    err instanceof Error ? err.message : 'Internal server error'

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err)
  }

  res.status(status).json({
    ok: false,
    error: message,
    ...(config.isDev && err instanceof Error ? { stack: err.stack } : {}),
  })
}
