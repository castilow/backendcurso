/**
 * Asigna una contraseña directamente a un usuario de Supabase Auth.
 *
 * Útil cuando el flujo de invite por email no funciona y quieres
 * dejar al usuario con una contraseña conocida para que pueda
 * logarse inmediatamente.
 *
 * Uso:
 *   cd /Users/castilow/Downloads/backendcursos
 *   node --env-file=.env scripts/setUserPassword.mjs correo@dominio NuevaPassword123
 *
 * Requiere en .env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
const email = (process.argv[2] ?? '').trim().toLowerCase()
const password = process.argv[3] ?? ''

if (!email || !email.includes('@')) {
  console.error('Uso: node --env-file=.env scripts/setUserPassword.mjs correo@dominio password')
  process.exit(1)
}
if (!password || password.length < 6) {
  console.error('La contraseña debe tener al menos 6 caracteres.')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const base = url.replace(/\/+$/, '')
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

// 1. Buscar usuario por email.
const searchRes = await fetch(
  `${base}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
  { headers },
)
if (!searchRes.ok) {
  const t = await searchRes.text()
  console.error(`❌ buscar usuario (${searchRes.status}):`, t)
  process.exit(2)
}
const searchBody = await searchRes.json()
const users = searchBody?.users ?? []
let user = users.find((u) => (u.email ?? '').toLowerCase() === email)

// 2. Si no existe, crearlo con la contraseña + email_confirm=true
if (!user) {
  const createRes = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!createRes.ok) {
    const t = await createRes.text()
    console.error(`❌ crear usuario (${createRes.status}):`, t)
    process.exit(2)
  }
  const created = await createRes.json()
  console.log(`✅ usuario CREADO con contraseña. user_id=${created.id ?? '?'}`)
  console.log(`   Entra en https://home.brokerdecoches.com/login con:`)
  console.log(`     email:    ${email}`)
  console.log(`     password: ${password}`)
  process.exit(0)
}

// 3. Si existe, actualizar contraseña + confirmar email (por si estaba pending).
const updateRes = await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ password, email_confirm: true }),
})
if (!updateRes.ok) {
  const t = await updateRes.text()
  console.error(`❌ actualizar contraseña (${updateRes.status}):`, t)
  process.exit(2)
}
console.log(`✅ contraseña ACTUALIZADA para ${email}`)
console.log(`   user_id=${user.id}`)
console.log(`   Entra en https://home.brokerdecoches.com/login con:`)
console.log(`     email:    ${email}`)
console.log(`     password: ${password}`)
