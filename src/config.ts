/**
 * Carga de configuración desde variables de entorno.
 *
 * Orígenes permitidos por CORS se leen de CORS_ORIGINS (coma-separado).
 * En desarrollo también se aceptan peticiones sin origin (p. ej. curl, Postman).
 */
import 'dotenv/config'

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const NODE_ENV = (process.env.NODE_ENV ?? 'development').toLowerCase()

export const config = {
  port: Number(process.env.PORT) || 5001,
  nodeEnv: NODE_ENV,
  isProd: NODE_ENV === 'production',
  isDev: NODE_ENV !== 'production',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  frontendUrl: process.env.FRONTEND_URL?.trim() || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET ?? '',
  /**
   * Shared secret para llamadas server-to-server desde tpc-main a
   * /api/billing/access/check. Si está vacío en dev, la verificación
   * se salta; en prod (NODE_ENV=production) es obligatorio.
   */
  billingAccessSecret: process.env.BILLING_ACCESS_SECRET?.trim() || '',
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || '',
    priceId: process.env.STRIPE_PRICE_ID?.trim() || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || '',
  },
  /**
   * Supabase: el webhook de Stripe escribe en public.billing_access.
   * Requiere SERVICE_ROLE porque la tabla tiene RLS sin policies.
   */
  supabase: {
    url: process.env.SUPABASE_URL?.trim() || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  },
  /**
   * Storage de cursos. Los .mp4 viven en este bucket. Los pósters generados
   * (frame del segundo 2 como JPG) se suben al mismo bucket bajo `posters/`.
   * Por defecto: bucket "curso" del proyecto Supabase configurado arriba.
   */
  courseStorage: {
    bucket: process.env.COURSE_STORAGE_BUCKET?.trim() || 'curso',
    posterPrefix: process.env.COURSE_POSTER_PREFIX?.trim() || 'posters',
  },
  /**
   * Resend (email transaccional). Tras un pago en Stripe se crea el
   * usuario en Supabase Auth con una contraseña aleatoria y se envía
   * un email con las credenciales.
   *
   *   RESEND_API_KEY  — obligatorio para que el email salga
   *   RESEND_FROM     — remitente. Ej: 'Broker de Coches <no-reply@brokerdecoches.com>'.
   *                     Durante pruebas puede ser 'onboarding@resend.dev'
   *                     (el sandbox de Resend), pero SOLO llega a la
   *                     propia cuenta del dueño de la API key.
   */
  resend: {
    apiKey: process.env.RESEND_API_KEY?.trim() || '',
    from: process.env.RESEND_FROM?.trim() || 'onboarding@resend.dev',
  },
} as const

export type AppConfig = typeof config

/** Devuelve true si Stripe está configurado (claves mínimas presentes). */
export function isStripeConfigured(): boolean {
  return Boolean(config.stripe.secretKey && config.stripe.priceId)
}

/** Devuelve true si Supabase está configurado (url + service role). */
export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey)
}

/** Devuelve true si Resend está configurado (API key presente). */
export function isResendConfigured(): boolean {
  return Boolean(config.resend.apiKey)
}
