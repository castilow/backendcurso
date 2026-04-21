/**
 * Store de compras por EMAIL (pago único) — backend: Supabase.
 * ----------------------------------------------------------------
 * Tabla: public.billing_access (migración en
 * tpc-main/database/migrations/create_billing_access_table.sql).
 *
 * RLS activo sin policies → solo service_role puede tocarla.
 * Este módulo usa SUPABASE_SERVICE_ROLE_KEY (ver src/lib/supabase.ts).
 *
 * La API pública se mantiene igual que la versión in-memory para que
 * routes/billing.ts y routes/billingWebhook.ts no cambien:
 *   - normalizeEmail
 *   - upsertPurchase       (async)
 *   - getPurchaseByEmail   (async)
 *   - getEmailByCustomerId (async)
 *   - linkCustomerToEmail  (async)
 *   - hasAccess            (síncrono, opera sobre EmailPurchase)
 *   - listAllPurchases     (async, solo debug)
 */
import { getSupabase } from './supabase'

export interface EmailPurchase {
  email: string
  paid: boolean
  stripeCustomerId: string | null
  stripeCheckoutSessionId: string | null
  stripePaymentIntentId: string | null
  amountPaid: number | null // en centavos (Stripe)
  currency: string | null
  purchasedAt: string | null // ISO
  refunded: boolean
  updatedAt: string
}

const TABLE = 'billing_access'

// ----------------------------------------------------------------- helpers
function now(): string {
  return new Date().toISOString()
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return null
  if (!trimmed.includes('@') || trimmed.length > 320) return null
  return trimmed
}

/** Row en Supabase → EmailPurchase de dominio */
type BillingAccessRow = {
  email: string
  paid: boolean
  refunded: boolean
  stripe_customer_id: string | null
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  amount_cents: number | null
  currency: string | null
  purchased_at: string | null
  updated_at: string
}

function rowToPurchase(row: BillingAccessRow): EmailPurchase {
  return {
    email: row.email,
    paid: Boolean(row.paid),
    stripeCustomerId: row.stripe_customer_id,
    stripeCheckoutSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    amountPaid: row.amount_cents,
    currency: row.currency,
    purchasedAt: row.purchased_at,
    refunded: Boolean(row.refunded),
    updatedAt: row.updated_at,
  }
}

// ----------------------------------------------------------------- upsert
/**
 * Inserta o actualiza. Solo los campos presentes en `data` se escriben;
 * las columnas omitidas conservan su valor actual. Para conseguir esa
 * semántica con upsert, primero leemos la fila existente (si hay) y
 * hacemos merge en memoria antes del upsert. Se podría hacer con SQL
 * puro (RPC) pero para este volumen (1 upsert por webhook Stripe) es
 * más que suficiente.
 */
export async function upsertPurchase(
  data: Partial<EmailPurchase> & { email: string },
): Promise<EmailPurchase | null> {
  const email = normalizeEmail(data.email)
  if (!email) return null

  const supabase = getSupabase()

  // 1. Leer estado actual (si existe) para hacer merge.
  const { data: existing, error: selErr } = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', email)
    .maybeSingle<BillingAccessRow>()

  if (selErr) {
    throw new Error(`supabase billing_access select failed: ${selErr.message}`)
  }

  const merged: BillingAccessRow = {
    email,
    paid: data.paid ?? existing?.paid ?? false,
    refunded: data.refunded ?? existing?.refunded ?? false,
    stripe_customer_id:
      data.stripeCustomerId !== undefined
        ? data.stripeCustomerId
        : existing?.stripe_customer_id ?? null,
    stripe_session_id:
      data.stripeCheckoutSessionId !== undefined
        ? data.stripeCheckoutSessionId
        : existing?.stripe_session_id ?? null,
    stripe_payment_intent_id:
      data.stripePaymentIntentId !== undefined
        ? data.stripePaymentIntentId
        : existing?.stripe_payment_intent_id ?? null,
    amount_cents:
      data.amountPaid !== undefined
        ? data.amountPaid
        : existing?.amount_cents ?? null,
    currency:
      data.currency !== undefined ? data.currency : existing?.currency ?? null,
    purchased_at:
      data.purchasedAt !== undefined
        ? data.purchasedAt
        : existing?.purchased_at ?? null,
    updated_at: now(),
  }

  const { data: upserted, error: upErr } = await supabase
    .from(TABLE)
    .upsert(merged, { onConflict: 'email' })
    .select('*')
    .single<BillingAccessRow>()

  if (upErr) {
    throw new Error(`supabase billing_access upsert failed: ${upErr.message}`)
  }

  return rowToPurchase(upserted)
}

// ----------------------------------------------------------------- lookup
export async function getPurchaseByEmail(
  emailRaw: string,
): Promise<EmailPurchase | null> {
  const email = normalizeEmail(emailRaw)
  if (!email) return null
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', email)
    .maybeSingle<BillingAccessRow>()
  if (error) {
    throw new Error(`supabase billing_access lookup failed: ${error.message}`)
  }
  return data ? rowToPurchase(data) : null
}

export async function getEmailByCustomerId(
  customerId: string,
): Promise<string | null> {
  if (!customerId) return null
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from(TABLE)
    .select('email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle<{ email: string }>()
  if (error) {
    throw new Error(`supabase billing_access by customer failed: ${error.message}`)
  }
  return data?.email ?? null
}

export async function linkCustomerToEmail(
  customerId: string,
  emailRaw: string,
): Promise<void> {
  const email = normalizeEmail(emailRaw)
  if (!email || !customerId) return
  // Delegamos en upsertPurchase para no duplicar la lógica de merge.
  await upsertPurchase({ email, stripeCustomerId: customerId })
}

// ----------------------------------------------------------------- predicate
export function hasAccess(
  purchase: EmailPurchase | null | undefined,
): boolean {
  return Boolean(purchase && purchase.paid && !purchase.refunded)
}

// ----------------------------------------------------------------- debug
export async function listAllPurchases(): Promise<EmailPurchase[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) {
    throw new Error(`supabase billing_access list failed: ${error.message}`)
  }
  return (data ?? []).map((r) => rowToPurchase(r as BillingAccessRow))
}
