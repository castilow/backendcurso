/**
 * Setup inicial de Stripe (pago ÚNICO 37 €).
 * ---------------------------------------------------------------
 *   npm run setup:stripe
 *
 * Crea en Stripe (test o live — según la sk_ key que haya en .env):
 *   - Product  "Suscripción Cursos"
 *   - Price    3700 céntimos EUR, one-time
 *
 * Es IDEMPOTENTE: si el producto/precio ya existe con el mismo nombre
 * y metadata, lo reutiliza. No crea duplicados al correrlo dos veces.
 *
 * Al acabar, imprime el STRIPE_PRICE_ID. Cópialo a .env (o déjalo
 * como está — el script te ofrece actualizar el archivo automáticamente).
 */
import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'

const PRODUCT_NAME = 'Suscripción Cursos'
const PRODUCT_META_KEY = 'setup_marker'
const PRODUCT_META_VALUE = 'backendcursos-v1'
const PRICE_AMOUNT_CENTS = 3700 // 37,00 €
const PRICE_CURRENCY = 'eur'

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    console.error('✗ Falta STRIPE_SECRET_KEY en .env')
    process.exit(1)
  }
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    console.error(`✗ STRIPE_SECRET_KEY no parece válida (debe empezar por sk_test_ o sk_live_). Valor: ${secretKey.slice(0, 10)}…`)
    process.exit(1)
  }
  const mode = secretKey.startsWith('sk_test_') ? 'TEST' : 'LIVE'
  console.log(`→ Conectando a Stripe en modo ${mode}…`)

  const stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' })

  // 1. Buscar o crear producto (idempotente por metadata)
  let product: Stripe.Product | null = null
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (
      p.name === PRODUCT_NAME &&
      p.metadata?.[PRODUCT_META_KEY] === PRODUCT_META_VALUE
    ) {
      product = p
      break
    }
  }
  if (product) {
    console.log(`✓ Producto existente reutilizado: ${product.id}`)
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: 'Acceso a los cursos (pago único)',
      metadata: { [PRODUCT_META_KEY]: PRODUCT_META_VALUE },
    })
    console.log(`✓ Producto creado: ${product.id}`)
  }

  // 2. Buscar o crear precio one-time 3700 EUR
  let price: Stripe.Price | null = null
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
  for (const p of prices.data) {
    if (
      p.unit_amount === PRICE_AMOUNT_CENTS &&
      p.currency === PRICE_CURRENCY &&
      p.type === 'one_time'
    ) {
      price = p
      break
    }
  }
  if (price) {
    console.log(`✓ Precio existente reutilizado: ${price.id}`)
  } else {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICE_AMOUNT_CENTS,
      currency: PRICE_CURRENCY,
      // sin `recurring` = one-time
    })
    console.log(`✓ Precio creado: ${price.id}  (${(price.unit_amount ?? 0) / 100} ${price.currency?.toUpperCase()})`)
  }

  // 3. Reescribir .env con STRIPE_PRICE_ID si cambió
  const envPath = path.resolve(process.cwd(), '.env')
  if (existsSync(envPath)) {
    const current = readFileSync(envPath, 'utf8')
    const has = /^STRIPE_PRICE_ID=.*/m.test(current)
    const already = current.match(/^STRIPE_PRICE_ID=(.*)$/m)?.[1]?.trim()
    if (already === price.id) {
      console.log('✓ .env ya tiene STRIPE_PRICE_ID correcto.')
    } else {
      const next = has
        ? current.replace(/^STRIPE_PRICE_ID=.*$/m, `STRIPE_PRICE_ID=${price.id}`)
        : `${current.trimEnd()}\nSTRIPE_PRICE_ID=${price.id}\n`
      writeFileSync(envPath, next, 'utf8')
      console.log(`✓ .env actualizado con STRIPE_PRICE_ID=${price.id}`)
    }
  } else {
    console.log(`⚠ No encontré .env en ${envPath}. Añade manualmente:\n  STRIPE_PRICE_ID=${price.id}`)
  }

  console.log('')
  console.log('── Resumen ──────────────────────────────────────────')
  console.log(`  Modo        : ${mode}`)
  console.log(`  Product ID  : ${product.id}`)
  console.log(`  Price ID    : ${price.id}`)
  console.log(`  Amount      : ${PRICE_AMOUNT_CENTS / 100} ${PRICE_CURRENCY.toUpperCase()} (pago único)`)
  console.log('─────────────────────────────────────────────────────')
  console.log('')
  console.log('Siguiente paso: crea el webhook en')
  console.log(`  ${mode === 'TEST' ? 'https://dashboard.stripe.com/test/webhooks' : 'https://dashboard.stripe.com/webhooks'}`)
  console.log('  URL        : https://TU_DOMINIO/api/billing/webhook')
  console.log('  Eventos    : checkout.session.completed, payment_intent.succeeded, charge.refunded')
  console.log('  Copia whsec_… a STRIPE_WEBHOOK_SECRET en .env')
  console.log('')
  console.log('En local, usa Stripe CLI:')
  console.log('  stripe listen --forward-to localhost:5001/api/billing/webhook')
  console.log('  (te imprime el whsec_ de dev)')
}

main().catch((err) => {
  console.error('✗ Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
