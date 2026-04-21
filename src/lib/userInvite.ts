/**
 * Invita a un usuario a Supabase Auth tras pagar (Opción A).
 * ----------------------------------------------------------------
 * Supabase manda un email "Has sido invitado" → el usuario click →
 * configura contraseña → ya puede logarse en tpc-main.
 *
 * Usa supabase.auth.admin.inviteUserByEmail (requiere SERVICE_ROLE,
 * que ya está en el cliente de getSupabase()).
 *
 * Política de errores:
 *   - Si el usuario ya existe (ya fue invitado / ya tiene cuenta):
 *     NO es fallo. Logeamos "already exists" y devolvemos ok=true
 *     con alreadyExisted=true.
 *   - Cualquier otro error de Supabase (red, rate-limit, email
 *     inválido): lo logeamos como warning y devolvemos ok=false,
 *     pero NO lanzamos — no queremos que el webhook devuelva 500 y
 *     Stripe reintente en bucle solo porque el email no salió. La
 *     fila de billing_access ya está escrita (el usuario SÍ pagó).
 *     Para reenviar invite manualmente: scripts/inviteUser.mjs.
 */
import { getSupabase } from './supabase'
import { config } from '../config'

export interface InviteResult {
  ok: boolean
  alreadyExisted: boolean
  error: string | null
}

/** Heurística para detectar el error "ya existe" en varias versiones. */
function isAlreadyRegistered(msg: string | undefined): boolean {
  if (!msg) return false
  const lower = msg.toLowerCase()
  return (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already exists') ||
    lower.includes('already exists') ||
    lower.includes('email address has already been registered')
  )
}

/**
 * Ruta dentro del frontend (tpc-main) que recibe el token de invite/
 * recovery y muestra formulario para elegir contraseña. El redirect
 * DEBE apuntar a esta ruta para que el usuario pueda configurar su
 * contraseña; si apunta al root, Supabase crea la sesión pero el
 * frontend pierde el hash y el usuario queda atrapado sin poder setear
 * password.
 */
const INVITE_REDIRECT_PATH = '/reset-password'

function buildDefaultRedirect(): string {
  const base = (config.frontendUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}${INVITE_REDIRECT_PATH}`
}

/**
 * Invita por email. No lanza — devuelve InviteResult. Si `redirectTo`
 * no se pasa, usa config.frontendUrl + /reset-password para que el
 * usuario aterrice en la página de establecer contraseña.
 */
export async function inviteUserByEmailSafe(
  email: string,
  redirectTo?: string,
): Promise<InviteResult> {
  const trimmed = String(email ?? '').trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, alreadyExisted: false, error: 'email inválido' }
  }

  const redirect = (redirectTo ?? buildDefaultRedirect()).trim()

  try {
    const supabase = getSupabase()
    const options = redirect ? { redirectTo: redirect } : undefined
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
      trimmed,
      options,
    )

    if (error) {
      if (isAlreadyRegistered(error.message)) {
        // eslint-disable-next-line no-console
        console.info('[invite] usuario ya existe, no reinvitamos:', trimmed)
        return { ok: true, alreadyExisted: true, error: null }
      }
      // eslint-disable-next-line no-console
      console.warn('[invite] fallo invitando', trimmed, error.message)
      return { ok: false, alreadyExisted: false, error: error.message }
    }

    // eslint-disable-next-line no-console
    console.info(
      '[invite] enviado',
      trimmed,
      data?.user?.id ? `(user_id=${data.user.id})` : '',
    )
    return { ok: true, alreadyExisted: false, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isAlreadyRegistered(msg)) {
      // eslint-disable-next-line no-console
      console.info('[invite] usuario ya existe, no reinvitamos:', trimmed)
      return { ok: true, alreadyExisted: true, error: null }
    }
    // eslint-disable-next-line no-console
    console.warn('[invite] excepción invitando', trimmed, msg)
    return { ok: false, alreadyExisted: false, error: msg }
  }
}
