/**
 * Auth server-to-server por shared secret.
 * ----------------------------------------------------------------
 * Protege endpoints que sólo deberían ser consumidos por otro server
 * (no por el navegador del usuario). Por ejemplo, `/api/billing/access/check`
 * — lo llama tpc-main desde el route handler de login.
 *
 * Reglas:
 *   - En prod (NODE_ENV=production), el header Authorization es
 *     obligatorio y debe coincidir con BILLING_ACCESS_SECRET.
 *   - En dev, si BILLING_ACCESS_SECRET está vacío, se permite sin auth
 *     (para facilitar tests con curl). Si está definido, también se
 *     valida.
 */
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config'

export function requireInternalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const expected = config.billingAccessSecret

  if (!expected) {
    if (config.isProd) {
      res
        .status(503)
        .json({ ok: false, error: 'BILLING_ACCESS_SECRET no configurado en el server' })
      return
    }
    // dev sin secret → pasa
    return next()
  }

  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing Authorization: Bearer header' })
    return
  }
  const token = header.slice('Bearer '.length).trim()
  if (!timingSafeEqual(token, expected)) {
    res.status(401).json({ ok: false, error: 'Invalid credentials' })
    return
  }
  return next()
}

/**
 * Comparación en tiempo constante para evitar timing attacks al validar
 * el token. Node <19 no trae crypto.timingSafeEqual en el paquete nativo
 * fácil de usar con strings sin convertir; hacemos una implementación
 * manual simple (la longitud fija antes, para evitar la fuga por length).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // diferenciamos, pero igual recorremos el mayor para no filtrar por timing
    let diff = 1
    const max = Math.max(a.length, b.length)
    for (let i = 0; i < max; i++) {
      diff |= (a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1))) | 0
    }
    return diff === 0
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
