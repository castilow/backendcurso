/**
 * Lista todas las filas de public.billing_access (con service_role).
 * Uso:
 *   cd /Users/castilow/Downloads/backendcursos
 *   node --env-file=.env scripts/listBillingAccess.mjs
 */
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const res = await fetch(
  `${url}/rest/v1/billing_access?select=email,paid,refunded,amount_cents,currency,stripe_customer_id,stripe_session_id,purchased_at,updated_at&order=updated_at.desc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
)
const body = await res.json()
if (!res.ok) {
  console.error('fallo', res.status, body)
  process.exit(1)
}

if (!Array.isArray(body) || body.length === 0) {
  console.log('billing_access está VACÍA — Stripe aún no ha escrito nada.')
  process.exit(0)
}

console.log(`billing_access: ${body.length} fila(s)\n`)
for (const r of body) {
  const hasAccess = r.paid && !r.refunded
  console.log(
    `· ${r.email.padEnd(40)} paid=${String(r.paid).padEnd(5)} refunded=${String(r.refunded).padEnd(5)} access=${hasAccess}  ${r.amount_cents ?? '-'} ${r.currency ?? ''}  ${r.stripe_session_id ?? '-'}`,
  )
}
