/**
 * Rutas de acceso (pago ÚNICO, checkout hecho en GoHighLevel).
 * ----------------------------------------------------------------
 *  GET  /api/billing/access?email=foo@bar.com   → { hasAccess, data }
 *  POST /api/billing/access/check               → { hasAccess } (para llamadas server-to-server)
 *
 * Persistencia: Supabase (public.billing_access). Ver purchasesStore.ts.
 *
 * NO creamos checkout aquí: el pago se origina en GHL. Nuestro papel es
 *   1. Recibir el webhook de Stripe (ver routes/billingWebhook.ts)
 *   2. Saber si un email ha pagado (estos endpoints)
 */
import { Router } from 'express'
import { z } from 'zod'

import { HttpError, asyncHandler } from '../middleware/errorHandler'
import { requireInternalAuth } from '../middleware/internalAuth'
import {
  getPurchaseByEmail,
  hasAccess,
  normalizeEmail,
} from '../lib/purchasesStore'

const router = Router()

// ---------- GET /api/billing/access?email= ----------------------------------
router.get(
  '/access',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(String(req.query.email ?? ''))
    if (!email) {
      throw new HttpError(400, 'email query param requerido y debe ser un email válido')
    }
    const purchase = await getPurchaseByEmail(email)
    res.json({
      ok: true,
      email,
      hasAccess: hasAccess(purchase),
      data:
        purchase ?? {
          email,
          paid: false,
          stripeCustomerId: null,
          stripeCheckoutSessionId: null,
          stripePaymentIntentId: null,
          amountPaid: null,
          currency: null,
          purchasedAt: null,
          refunded: false,
          updatedAt: null,
        },
    })
  }),
)

// ---------- POST /api/billing/access/check ----------------------------------
// Variante POST pensada para que tpc-main (server-side) haga la consulta
// con el email en body en lugar de query string (evita que aparezca en logs).
const checkSchema = z.object({
  email: z.string().min(3).max(320),
})

router.post(
  '/access/check',
  requireInternalAuth,
  asyncHandler(async (req, res) => {
    const parsed = checkSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError(400, `Invalid payload: ${parsed.error.message}`)
    }
    const email = normalizeEmail(parsed.data.email)
    if (!email) {
      throw new HttpError(400, 'email inválido')
    }
    const purchase = await getPurchaseByEmail(email)
    res.json({
      ok: true,
      email,
      hasAccess: hasAccess(purchase),
    })
  }),
)

export default router
