/**
 * E2E: simula el viaje completo Stripe → webhook → Supabase → lectura.
 *
 * Uso (desde /Users/castilow/Downloads/backendcursos):
 *   npx tsx scripts/e2eBillingWebhook.ts
 *
 * Necesita .env con:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Pasos:
 *   1. Levanta una mini-app Express (puerto efímero) montando el handler real
 *      `billingWebhookHandler` en /api/billing/webhook con express.raw — igual
 *      que src/index.ts.
 *   2. Construye un evento `checkout.session.completed` sintético para un
 *      email único, lo firma con Stripe.webhooks.generateTestHeaderString
 *      usando STRIPE_WEBHOOK_SECRET (la misma firma que usa el Stripe real).
 *   3. POSTea al servidor. Espera 200 + { received: true }.
 *   4. Consulta Supabase con getPurchaseByEmail y comprueba paid=true /
 *      refunded=false (simula lo que hace tpc-main login).
 *   5. Construye un `charge.refunded` con el mismo customer, firma, POST.
 *   6. Re-consulta Supabase: ahora refunded=true, paid=false, hasAccess=false.
 *   7. Limpia la fila, cierra servidor, reporta PASS/FAIL.
 */
/* eslint-disable no-console */
import 'dotenv/config'

import express from 'express'
import Stripe from 'stripe'

import { config, isSupabaseConfigured } from '../src/config'
import {
  getPurchaseByEmail,
  hasAccess,
} from '../src/lib/purchasesStore'
import { getSupabase } from '../src/lib/supabase'
import { billingWebhookHandler } from '../src/routes/billingWebhook'

function fail(msg: string, extra?: unknown): void {
  console.error(`[e2e] FAIL ${msg}`, extra ?? '')
}

async function main() {
  if (!config.stripe.secretKey) throw new Error('STRIPE_SECRET_KEY vacío')
  if (!config.stripe.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET vacío')
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado')

  const stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  })

  // --- 1. mini-server con el handler real ---
  const app = express()
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    billingWebhookHandler,
  )
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const url = `http://127.0.0.1:${port}/api/billing/webhook`
  console.log(`[e2e] mini-server escuchando en ${url}`)

  const TEST_EMAIL = `e2e-${Date.now()}@example.com`
  const TEST_CUSTOMER = `cus_e2e_${Date.now()}`
  const TEST_SESSION = `cs_e2e_${Date.now()}`
  const TEST_PI = `pi_e2e_${Date.now()}`

  let fails = 0

  async function sendEvent(event: object, label: string): Promise<void> {
    const payload = JSON.stringify(event)
    const sig = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: config.stripe.webhookSecret,
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sig,
      },
      body: payload,
    })
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      received?: boolean
      type?: string
      error?: string
    } | null
    if (res.status !== 200 || !body?.received) {
      fail(`${label} POST status=${res.status}`, body)
      fails++
    } else {
      console.log(`[e2e] ${label} 200 OK (type=${body.type})`)
    }
  }

  // --- 2+3. checkout.session.completed ---
  await sendEvent(
    {
      id: `evt_e2e_${Date.now()}_1`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: TEST_SESSION,
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          customer: TEST_CUSTOMER,
          customer_details: { email: TEST_EMAIL },
          customer_email: null,
          metadata: {},
          amount_total: 3700,
          currency: 'eur',
          payment_intent: TEST_PI,
          created: Math.floor(Date.now() / 1000),
        },
      },
    },
    'checkout.session.completed',
  )

  // --- 4. verifica estado post-checkout (lo que leería tpc-main login) ---
  {
    const p = await getPurchaseByEmail(TEST_EMAIL)
    if (!p) {
      fail('no se encontró fila tras checkout')
      fails++
    } else if (!p.paid || p.refunded) {
      fail('estado incorrecto tras checkout', p)
      fails++
    } else if (!hasAccess(p)) {
      fail('hasAccess(post-checkout) debería ser true', p)
      fails++
    } else {
      console.log(
        `[e2e] post-checkout OK paid=${p.paid} refunded=${p.refunded} customer=${p.stripeCustomerId} session=${p.stripeCheckoutSessionId}`,
      )
    }
  }

  // --- 5. charge.refunded ---
  await sendEvent(
    {
      id: `evt_e2e_${Date.now()}_2`,
      object: 'event',
      type: 'charge.refunded',
      data: {
        object: {
          id: `ch_e2e_${Date.now()}`,
          object: 'charge',
          customer: TEST_CUSTOMER,
          billing_details: { email: TEST_EMAIL },
          receipt_email: null,
        },
      },
    },
    'charge.refunded',
  )

  // --- 6. verifica estado post-refund ---
  {
    const p = await getPurchaseByEmail(TEST_EMAIL)
    if (!p) {
      fail('no se encontró fila tras refund (no debería desaparecer)')
      fails++
    } else if (!p.refunded || p.paid) {
      fail('estado incorrecto tras refund', p)
      fails++
    } else if (hasAccess(p)) {
      fail('hasAccess(post-refund) debería ser false', p)
      fails++
    } else {
      console.log(
        `[e2e] post-refund  OK paid=${p.paid} refunded=${p.refunded}`,
      )
    }
  }

  // --- 7. cleanup ---
  {
    const { error } = await getSupabase()
      .from('billing_access')
      .delete()
      .eq('email', TEST_EMAIL)
    if (error) {
      fail('cleanup DELETE', error)
      fails++
    } else {
      console.log('[e2e] cleanup OK')
    }
  }

  await new Promise<void>((resolve) => server.close(() => resolve()))

  if (fails === 0) {
    console.log('\ne2e: PASS ✅ todo el flujo Stripe → Supabase → lectura funciona')
    process.exit(0)
  } else {
    console.error(`\ne2e: ${fails} FALLO(s) ❌`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[e2e] excepción', err)
  process.exit(2)
})
