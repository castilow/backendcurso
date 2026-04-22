/**
 * Smoke-test del flujo de provisioning (Opción B — Resend).
 * ----------------------------------------------------------------
 * Simula lo que hace el webhook de Stripe tras un checkout.session
 * .completed: crea el usuario en Supabase Auth con contraseña
 * aleatoria y manda email con credenciales.
 *
 * Útil para probar Resend + Supabase sin tener que pasar por Stripe.
 *
 * Uso:
 *   cd /Users/castilow/Downloads/backendcursos
 *   node --env-file=.env --import tsx scripts/testProvision.mjs correo@dominio
 *
 * Con RESEND_FROM=onboarding@resend.dev, Resend SOLO entrega emails al
 * propio email de la cuenta Resend (carhubaccar@gmail.com en este
 * caso). Para mandar a terceros, verifica un dominio.
 *
 * Requiere en .env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY, RESEND_FROM, FRONTEND_URL
 */
import { provisionAccountAfterPayment } from '../src/lib/accountProvisioning.ts'

const email = (process.argv[2] ?? '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Uso: node --import tsx scripts/testProvision.mjs correo@dominio')
  process.exit(1)
}

const result = await provisionAccountAfterPayment(email)
console.log('\n──── RESULTADO ────')
console.log(JSON.stringify(result, null, 2))

if (!result.ok) process.exit(2)
if (result.alreadyExisted) {
  console.log(
    '\nℹ️  El usuario ya existía, por eso NO te mandé email. ' +
      'Si quieres probar el email desde cero, borra el usuario en ' +
      'Supabase → Authentication → Users y vuelve a correr.',
  )
}
if (result.emailSent) {
  console.log(
    `\n✅ Email enviado. Revisa la bandeja de ${email} (y spam). ` +
      'Si usas onboarding@resend.dev como remitente, Resend SOLO ' +
      'entrega al email con el que te registraste en Resend.',
  )
}
