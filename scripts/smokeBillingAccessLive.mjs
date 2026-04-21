/**
 * Smoke LIVE contra la tabla billing_access real en Supabase.
 *
 * Uso (desde /Users/castilow/Downloads/backendcursos):
 *   node --env-file=.env scripts/smokeBillingAccessLive.mjs
 *
 * Hace 4 cosas:
 *   1. INSERT  (upsert) de un email de prueba con paid=true
 *   2. SELECT  para confirmar que lo leemos
 *   3. UPDATE  a refunded=true y confirmamos que hasAccess pasaría a false
 *   4. DELETE  para no dejar basura
 *
 * Si cualquiera falla devuelve exit code != 0 y loguea el motivo.
 */
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_EMAIL = `smoke-${Date.now()}@example.com`

if (!url || !key) {
  console.error('[smoke] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

async function req(method, path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const ok = res.status >= 200 && res.status < 300
  let parsed = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {}
  return { ok, status: res.status, body: parsed }
}

let failed = 0

// 1. INSERT
{
  const r = await req('POST', 'billing_access', {
    email: TEST_EMAIL,
    paid: true,
    refunded: false,
    amount_cents: 3700,
    currency: 'eur',
    purchased_at: new Date().toISOString(),
  })
  if (!r.ok) {
    console.error('[smoke] INSERT falló', r.status, r.body)
    failed++
  } else {
    console.log('[smoke] INSERT ok', r.body[0]?.email)
  }
}

// 2. SELECT
{
  const r = await req('GET', `billing_access?select=*&email=eq.${encodeURIComponent(TEST_EMAIL)}`)
  if (!r.ok || !Array.isArray(r.body) || r.body.length !== 1) {
    console.error('[smoke] SELECT falló', r.status, r.body)
    failed++
  } else {
    const row = r.body[0]
    const hasAccess = row.paid && !row.refunded
    console.log(`[smoke] SELECT ok paid=${row.paid} refunded=${row.refunded} hasAccess=${hasAccess}`)
    if (!hasAccess) failed++
  }
}

// 3. UPDATE a refunded
{
  const r = await req(
    'PATCH',
    `billing_access?email=eq.${encodeURIComponent(TEST_EMAIL)}`,
    { refunded: true },
  )
  if (!r.ok) {
    console.error('[smoke] UPDATE falló', r.status, r.body)
    failed++
  } else {
    const row = Array.isArray(r.body) ? r.body[0] : null
    const hasAccess = row?.paid && !row?.refunded
    console.log(`[smoke] UPDATE ok refunded=${row?.refunded} hasAccess=${hasAccess}`)
    if (hasAccess) failed++ // tras refund hasAccess debe ser false
  }
}

// 4. DELETE
{
  const r = await req(
    'DELETE',
    `billing_access?email=eq.${encodeURIComponent(TEST_EMAIL)}`,
  )
  if (!r.ok) {
    console.error('[smoke] DELETE falló', r.status, r.body)
    failed++
  } else {
    console.log('[smoke] DELETE ok')
  }
}

console.log(failed === 0 ? '\nsmoke LIVE: OK ✅' : `\nsmoke LIVE: ${failed} fallo(s) ❌`)
process.exit(failed === 0 ? 0 : 1)
