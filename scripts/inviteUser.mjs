/**
 * Reenvía manualmente un invite de Supabase Auth a un email.
 *
 * Útil cuando:
 *   - el email automático del webhook no llegó (spam, rate-limit...)
 *   - el usuario existe en billing_access pero nunca recibió el email
 *   - estás probando y quieres forzar otra invitación
 *
 * Uso:
 *   cd /Users/castilow/Downloads/backendcursos
 *   node --env-file=.env scripts/inviteUser.mjs correo@ejemplo.com
 *
 * Requiere en .env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FRONTEND_URL  (opcional — usado como redirect tras aceptar invite)
 */
const email = (process.argv[2] ?? '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Uso: node --env-file=.env scripts/inviteUser.mjs correo@dominio')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const redirectTo = process.env.FRONTEND_URL?.trim() || ''

if (!url || !key) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

// Llamada directa a la API admin (no hace falta @supabase/supabase-js para
// esto en un script one-shot): POST /auth/v1/invite
const endpoint = `${url.replace(/\/+$/, '')}/auth/v1/invite`
const body = JSON.stringify(
  redirectTo ? { email, data: {}, redirect_to: redirectTo } : { email },
)

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body,
})

const text = await res.text()
let parsed
try {
  parsed = JSON.parse(text)
} catch {
  parsed = text
}

if (!res.ok) {
  const msg =
    (parsed && typeof parsed === 'object' && (parsed.msg || parsed.error_description || parsed.error)) ||
    text
  const lower = String(msg).toLowerCase()
  if (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already exists') ||
    lower.includes('already exists')
  ) {
    console.log(
      `ℹ️  ${email} ya existe en Supabase Auth. ` +
        `Si ha olvidado la contraseña, dile que use "¿Olvidaste tu contraseña?" en el login.`,
    )
    process.exit(0)
  }
  console.error(`❌ fallo (${res.status}):`, msg)
  process.exit(2)
}

console.log(`✅ invite enviado a ${email}`)
if (parsed?.id) console.log(`   user_id=${parsed.id}`)
if (redirectTo) console.log(`   redirect_to=${redirectTo}`)
console.log('   Revisa la bandeja del usuario (y la carpeta spam).')
