/**
 * Webhook Stripe (pago ÚNICO, checkout hecho en GoHighLevel).
 * ----------------------------------------------------------------
 * El body debe llegar CRUDO (Buffer): se monta con express.raw({ type:
 * 'application/json' }) en src/index.ts ANTES de express.json().
 *
 * Eventos soportados:
 *   - checkout.session.completed     → mode=payment + payment_status=paid → marca paid=true
 *   - payment_intent.succeeded       → contexto (guarda paymentIntentId)
 *   - charge.refunded                → revoca acceso (refunded=true)
 */
import type { NextFunction, Request, Response } from 'express'
import type Stripe from 'stripe'

import { config } from '../config'
import { getStripe } from '../lib/stripe'
import {
  getEmailByCustomerId,
  linkCustomerToEmail,
  normalizeEmail,
  upsertPurchase,
} from '../lib/purchasesStore'
import { provisionAccountAfterPayment } from '../lib/accountProvisioning'

function customerIdFromUnion(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

function resolveEmailFromSession(session: Stripe.Checkout.Session): string | null {
  // 1. customer_details.email (lo que el usuario escribió en el Checkout)
  const detailsEmail = session.customer_details?.email
  const fromDetails = normalizeEmail(detailsEmail ?? null)
  if (fromDetails) return fromDetails

  // 2. customer_email (cuando GHL lo pre-carga)
  const fromCustomerEmail = normalizeEmail(session.customer_email ?? null)
  if (fromCustomerEmail) return fromCustomerEmail

  // 3. metadata.email (por si algún sistema lo mete ahí explícitamente)
  const metaEmail = session.metadata?.email
  const fromMeta = normalizeEmail(metaEmail ?? null)
  if (fromMeta) return fromMeta

  return null
}

function resolveEmailFromPaymentIntent(pi: Stripe.PaymentIntent): string | null {
  const receipt = normalizeEmail(pi.receipt_email ?? null)
  if (receipt) return receipt
  const meta = normalizeEmail(pi.metadata?.email ?? null)
  if (meta) return meta
  return null
}

function resolveEmailFromCharge(charge: Stripe.Charge): string | null {
  const billing = normalizeEmail(charge.billing_details?.email ?? null)
  if (billing) return billing
  const receipt = normalizeEmail(charge.receipt_email ?? null)
  if (receipt) return receipt
  return null
}

export async function billingWebhookHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const signature = req.headers['stripe-signature']
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ ok: false, error: 'Missing stripe-signature header' })
    return
  }
  if (!config.stripe.webhookSecret) {
    res.status(503).json({ ok: false, error: 'STRIPE_WEBHOOK_SECRET no configurado' })
    return
  }

  const body = req.body as Buffer

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      config.stripe.webhookSecret,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature'
    // eslint-disable-next-line no-console
    console.warn('[stripe-webhook] verificación fallida:', msg)
    res
      .status(400)
      .json({ ok: false, error: `Webhook signature verification failed: ${msg}` })
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'payment') break
        if (session.payment_status !== 'paid') break

        const email = resolveEmailFromSession(session)
        if (!email) {
          // eslint-disable-next-line no-console
          console.warn('[stripe-webhook] checkout.session.completed sin email', { id: session.id })
          break
        }

        const customerId = customerIdFromUnion(session.customer)
        if (customerId) await linkCustomerToEmail(customerId, email)

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null

        await upsertPurchase({
          email,
          paid: true,
          stripeCustomerId: customerId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          amountPaid: session.amount_total ?? null,
          currency: session.currency ?? null,
          purchasedAt: new Date(
            (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
          ).toISOString(),
          refunded: false,
        })

        // eslint-disable-next-line no-console
        console.info('[stripe-webhook] acceso concedido a', email)

        // Provisionar cuenta en Supabase Auth con contraseña aleatoria
        // y mandar email con credenciales (Opción B — sin invite).
        // No bloquea el webhook: si falla el email o la creación del
        // usuario, logueamos y seguimos. El acceso ya está concedido
        // en billing_access; el usuario puede usar "Olvidé contraseña"
        // como fallback para generarse una contraseña nueva.
        void provisionAccountAfterPayment(email).catch((err) => {
          // provisionAccountAfterPayment no debe lanzar, pero por si acaso.
          // eslint-disable-next-line no-console
          console.warn('[stripe-webhook] provision threw (no debería)', err)
        })
        break
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const customerId = customerIdFromUnion(pi.customer)
        const email =
          resolveEmailFromPaymentIntent(pi) ??
          (customerId ? await getEmailByCustomerId(customerId) : null)
        if (!email) break
        await upsertPurchase({
          email,
          stripeCustomerId: customerId,
          stripePaymentIntentId: pi.id,
        })
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const chargeCustomerId = customerIdFromUnion(charge.customer)
        const email =
          resolveEmailFromCharge(charge) ??
          (chargeCustomerId ? await getEmailByCustomerId(chargeCustomerId) : null)
        if (!email) break
        await upsertPurchase({ email, refunded: true, paid: false })
        // eslint-disable-next-line no-console
        console.info('[stripe-webhook] acceso REVOCADO a', email, '(refund)')
        break
      }

      default:
        break
    }

    res.json({ ok: true, received: true, type: event.type })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stripe-webhook] error procesando evento', err)
    res.status(500).json({ ok: false, error: 'Webhook processing error' })
  }
}
