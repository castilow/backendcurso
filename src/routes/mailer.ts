import { Router } from 'express'
import { z } from 'zod'
import { Resend } from 'resend'

import { config } from '../config'
import { HttpError, asyncHandler } from '../middleware/errorHandler'
import { requireInternalAuth } from '../middleware/internalAuth'

const router = Router()

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function parseRecipients(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .map((s) => s.replace(/^<|>$/g, ''))
    .filter(Boolean)
}

function ensureResendReady() {
  if (!config.resend.apiKey) {
    throw new HttpError(500, 'RESEND_API_KEY no configurado en backendcursos')
  }
  if (!config.resend.from) {
    throw new HttpError(500, 'RESEND_FROM no configurado en backendcursos')
  }
  if (config.isProd && /onboarding@resend\.dev/i.test(config.resend.from)) {
    throw new HttpError(
      500,
      'RESEND_FROM usa dominio de pruebas (resend.dev). Configura un dominio verificado.',
    )
  }
  return new Resend(config.resend.apiKey)
}

const signupRequestSchema = z.object({
  nombre: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  signupRequestTo: z.string().min(3),
  acceptUrl: z.string().url(),
})

router.post(
  '/signup-request',
  requireInternalAuth,
  asyncHandler(async (req, res) => {
    const parsed = signupRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError(400, `Payload inválido: ${parsed.error.message}`)
    }
    const { nombre, username, email, password, signupRequestTo, acceptUrl } = parsed.data
    const recipients = parseRecipients(signupRequestTo)
    if (recipients.length === 0) {
      throw new HttpError(400, 'No hay destinatarios para aprobación (SIGNUP_REQUEST_TO).')
    }

    const html =
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;line-height:1.35;">` +
      `<p style="margin:0 0 10px 0;">Estimado/a,</p>` +
      `<p style="margin:0 0 10px 0;">El usuario <strong>${escapeHtml(username)}</strong> (<strong>${escapeHtml(
        nombre,
      )}</strong>) ha solicitado su registro en la página principal de Accar, utilizando la dirección de correo electrónico <strong>${escapeHtml(
        email,
      )}</strong>.</p>` +
      `<p style="margin:0 0 10px 0;">La contraseña propuesta para su cuenta es la siguiente: <strong>${escapeHtml(
        password,
      )}</strong>.</p>` +
      `<p style="margin:0 0 12px 0;">Puede gestionar esta solicitud a través de las opciones que se indican a continuación:</p>` +
      `<a href="${acceptUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;">Aceptar solicitud</a>` +
      `</div>`

    const resend = ensureResendReady()
    const { data, error } = await resend.emails.send({
      from: config.resend.from,
      to: recipients,
      subject: 'Solicitud de registro pendiente de aprobación.',
      html,
    })
    if (error) {
      throw new HttpError(500, error.message || 'Error enviando email de solicitud')
    }

    res.json({ ok: true, id: data?.id ?? null })
  }),
)

const signupApprovedSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  loginUrl: z.string().url(),
})

router.post(
  '/signup-approved',
  requireInternalAuth,
  asyncHandler(async (req, res) => {
    const parsed = signupApprovedSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError(400, `Payload inválido: ${parsed.error.message}`)
    }
    const { username, email, password, loginUrl } = parsed.data

    const html =
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;line-height:1.5;">` +
      `<p style="margin:0 0 12px 0;">Estimado/a ${escapeHtml(username)},</p>` +
      `<p style="margin:0 0 12px 0;">Te confirmamos que tu solicitud de registro en Accar ha sido aprobada correctamente.</p>` +
      `<p style="margin:0 0 12px 0;">A continuación, te facilitamos tus credenciales de acceso:</p>` +
      `<p style="margin:0 0 8px 0;">Usuario: ${escapeHtml(username)}</p>` +
      `<p style="margin:0 0 8px 0;">eMail: ${escapeHtml(email)}</p>` +
      `<p style="margin:0 0 16px 0;">Password: ${escapeHtml(password)}</p>` +
      `<p style="margin:0 0 16px 0;">Por seguridad, te recomendamos cambiar la contraseña tras tu primer inicio de sesión.</p>` +
      `<a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;">Ir al login</a>` +
      `<p style="margin:16px 0 0 0;color:#374151;">Un saludo,<br/>Equipo Accar</p>` +
      `</div>`

    const resend = ensureResendReady()
    const { data, error } = await resend.emails.send({
      from: config.resend.from,
      to: [email],
      subject: 'Registro aprobado en Accar',
      html,
    })
    if (error) {
      throw new HttpError(500, error.message || 'Error enviando email de aprobación')
    }

    res.json({ ok: true, id: data?.id ?? null })
  }),
)

export default router
