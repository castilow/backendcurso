/**
 * Provisioning automático de cuenta tras un pago en Stripe (Opción B).
 * ----------------------------------------------------------------
 * Lo que antes hacía inviteUserByEmailSafe (mandar invite de Supabase
 * con link de "configura tu contraseña") ahora lo hacemos nosotros:
 *
 *   1. Generamos una contraseña aleatoria `broker-xxxxxxxx`.
 *   2. Creamos el usuario en Supabase Auth vía admin API con esa
 *      contraseña y email_confirm=true — así el usuario puede logarse
 *      INMEDIATAMENTE sin tener que verificar email.
 *   3. Si el usuario YA existía (p. ej. ya había pagado antes o había
 *      sido invitado), NO tocamos su contraseña — si el flujo anterior
 *      le envió ya credenciales, las suyas son válidas; si no, puede
 *      usar "Olvidé contraseña". Devolvemos alreadyExisted=true y NO
 *      enviamos email (evita spam al mismo usuario si Stripe reintenta
 *      el webhook).
 *   4. Enviamos un email con email+password vía Resend.
 *
 * No lanza. Devuelve un `ProvisionResult` para que el webhook decida.
 *
 * Idempotencia del webhook: Stripe puede reintentar checkout.session
 * .completed varias veces. La creación del usuario en Supabase es
 * idempotente (detectamos "already exists" y no reenviamos email).
 */
import { getSupabase } from './supabase'
import { generateInitialPassword } from './passwords'
import { sendWelcomeEmail } from './mailer'

export interface ProvisionResult {
  ok: boolean
  alreadyExisted: boolean
  /** true si mandamos email con credenciales. */
  emailSent: boolean
  userId: string | null
  error: string | null
}

async function ensureUserProfile(userId: string, email: string): Promise<void> {
  const supabase = getSupabase()
  const localPart = email.split('@')[0] || 'usuario'
  const username = localPart.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40) || 'usuario'
  const fullName = localPart.replace(/[._-]+/g, ' ').trim() || localPart
  const now = new Date().toISOString()

  await supabase.from('user_profiles').upsert(
    {
      user_id: userId,
      full_name: fullName,
      username,
      role: 'user',
      hierarchy_scope: null,
      submit_request: 'accepted',
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
}

function isAlreadyRegistered(msg: string | undefined): boolean {
  if (!msg) return false
  const lower = msg.toLowerCase()
  return (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already exists') ||
    lower.includes('already exists') ||
    lower.includes('email address has already been registered') ||
    // supabase-js a veces devuelve esto cuando el usuario ya existe
    lower.includes('a user with this email address has already been registered')
  )
}

/**
 * Provisiona (o detecta ya provisionado) al usuario y manda email con
 * sus credenciales si es nuevo. No lanza.
 */
export async function provisionAccountAfterPayment(
  email: string,
): Promise<ProvisionResult> {
  const trimmed = String(email ?? '').trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    return {
      ok: false,
      alreadyExisted: false,
      emailSent: false,
      userId: null,
      error: 'email inválido',
    }
  }

  const password = generateInitialPassword()

  let userId: string | null = null
  let alreadyExisted = false

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.admin.createUser({
      email: trimmed,
      password,
      email_confirm: true,
    })

    if (error) {
      if (isAlreadyRegistered(error.message)) {
        alreadyExisted = true
        // eslint-disable-next-line no-console
        console.info(
          '[provision] usuario ya existe — no tocamos contraseña ni reenviamos email:',
          trimmed,
        )
        return {
          ok: true,
          alreadyExisted: true,
          emailSent: false,
          userId: null,
          error: null,
        }
      }
      // eslint-disable-next-line no-console
      console.warn('[provision] fallo creando usuario', trimmed, error.message)
      return {
        ok: false,
        alreadyExisted: false,
        emailSent: false,
        userId: null,
        error: error.message,
      }
    }

    userId = data?.user?.id ?? null
    // eslint-disable-next-line no-console
    console.info(
      '[provision] usuario creado',
      trimmed,
      userId ? `(user_id=${userId})` : '',
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isAlreadyRegistered(msg)) {
      // eslint-disable-next-line no-console
      console.info('[provision] usuario ya existe (excepción):', trimmed)
      return {
        ok: true,
        alreadyExisted: true,
        emailSent: false,
        userId: null,
        error: null,
      }
    }
    // eslint-disable-next-line no-console
    console.warn('[provision] excepción creando usuario', trimmed, msg)
    return {
      ok: false,
      alreadyExisted: false,
      emailSent: false,
      userId: null,
      error: msg,
    }
  }

  // Usuario recién creado → asegurar perfil base en user_profiles.
  if (userId) {
    try {
      await ensureUserProfile(userId, trimmed)
    } catch (profileErr) {
      // No bloqueamos el provisioning por fallo de perfil.
      // eslint-disable-next-line no-console
      console.warn('[provision] no se pudo upsert user_profiles para', trimmed, profileErr)
    }
  }

  // Usuario recién creado → mandar email con credenciales.
  const mail = await sendWelcomeEmail(trimmed, password)
  if (!mail.ok) {
    // Usuario creado pero email no salió. No es fatal: el usuario
    // puede entrar con "Olvidé contraseña" (el email de recovery lo
    // manda Supabase). Logueamos y devolvemos ok=true, emailSent=false.
    // eslint-disable-next-line no-console
    console.warn(
      '[provision] usuario creado pero email falló',
      trimmed,
      mail.error ?? '',
    )
    return {
      ok: true,
      alreadyExisted,
      emailSent: false,
      userId,
      error: mail.error,
    }
  }

  return {
    ok: true,
    alreadyExisted,
    emailSent: true,
    userId,
    error: null,
  }
}
