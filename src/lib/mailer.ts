/**
 * Cliente de Resend para emails transaccionales.
 * ----------------------------------------------------------------
 * Se usa desde el flujo de provisioning de cuentas: tras un pago en
 * Stripe creamos el usuario en Supabase Auth con una contraseña
 * aleatoria y le mandamos un email con esa contraseña para que pueda
 * logarse inmediatamente en home.brokerdecoches.com.
 *
 * Política de errores:
 *   - No lanza. Todas las funciones devuelven `{ ok, error }` para
 *     que el caller decida si reintenta / loguea / sigue adelante.
 *   - El webhook de Stripe NUNCA debe devolver 500 porque el email no
 *     saliera: la fila de billing_access ya está escrita (el usuario
 *     sí pagó). Si el email falla, se puede reenviar manualmente.
 *
 * Lazy init: no instanciamos el SDK hasta que alguien llama a
 * getResend(). Si RESEND_API_KEY no está, sendWelcomeEmail devuelve
 * ok=false sin lanzar.
 */
import { Resend } from 'resend'

import { config, isResendConfigured } from '../config'

let cached: Resend | null = null

function getResend(): Resend {
  if (cached) return cached
  if (!config.resend.apiKey) {
    throw new Error('RESEND_API_KEY no configurado')
  }
  cached = new Resend(config.resend.apiKey)
  return cached
}

export interface SendResult {
  ok: boolean
  id: string | null
  error: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Email de bienvenida con credenciales tras pagar.
 * HTML sobrio, sin imágenes externas, para que no caiga en spam.
 */
export async function sendWelcomeEmail(
  email: string,
  password: string,
): Promise<SendResult> {
  if (!isResendConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[mailer] RESEND_API_KEY no configurado — no envío email a', email)
    return { ok: false, id: null, error: 'RESEND_API_KEY no configurado' }
  }

  const loginUrl = `${config.frontendUrl.replace(/\/+$/, '')}/login`
  const safeEmail = escapeHtml(email)
  const safePassword = escapeHtml(password)
  const safeLoginUrl = escapeHtml(loginUrl)

  const subject = 'Tus credenciales para Broker de Coches'
  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
      <h1 style="color: #2563eb; margin: 0 0 16px 0; font-size: 22px;">Bienvenido a Broker de Coches</h1>
      <p style="margin: 0 0 16px 0; line-height: 1.5;">
        Gracias por tu compra. Ya tienes acceso completo al portal.
        Estas son tus credenciales:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 12px; background: #f1f5f9; border-radius: 6px 0 0 6px; font-weight: 600; width: 120px;">Email</td>
          <td style="padding: 8px 12px; background: #f8fafc; border-radius: 0 6px 6px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${safeEmail}</td>
        </tr>
        <tr><td style="height: 6px;" colspan="2"></td></tr>
        <tr>
          <td style="padding: 8px 12px; background: #f1f5f9; border-radius: 6px 0 0 6px; font-weight: 600;">Contraseña</td>
          <td style="padding: 8px 12px; background: #f8fafc; border-radius: 0 6px 6px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${safePassword}</td>
        </tr>
      </table>
      <p style="margin: 24px 0; text-align: center;">
        <a href="${safeLoginUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Iniciar sesión</a>
      </p>
      <p style="margin: 16px 0; line-height: 1.5; color: #475569; font-size: 14px;">
        Por seguridad, te recomendamos cambiar la contraseña nada más entrar.
        Puedes hacerlo desde tu perfil o usando el enlace
        <em>¿Olvidaste tu contraseña?</em> en la pantalla de login.
      </p>
      <p style="margin: 16px 0 0 0; line-height: 1.5; color: #64748b; font-size: 12px;">
        Si no reconoces esta compra, responde a este email y lo revisamos.
      </p>
    </div>
  </body>
</html>`

  const text = [
    'Bienvenido a Broker de Coches.',
    '',
    `Email: ${email}`,
    `Contraseña: ${password}`,
    '',
    `Accede aquí: ${loginUrl}`,
    '',
    'Por seguridad, cambia la contraseña nada más entrar.',
  ].join('\n')

  try {
    const { data, error } = await getResend().emails.send({
      from: config.resend.from,
      to: email,
      subject,
      html,
      text,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[mailer] Resend devolvió error', email, error)
      const msg =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: unknown }).message ?? error)
          : String(error)
      return { ok: false, id: null, error: msg }
    }
    // eslint-disable-next-line no-console
    console.info('[mailer] email enviado', email, data?.id ? `(id=${data.id})` : '')
    return { ok: true, id: data?.id ?? null, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.warn('[mailer] excepción enviando email a', email, msg)
    return { ok: false, id: null, error: msg }
  }
}
