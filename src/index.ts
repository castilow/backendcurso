/**
 * backendcursos — servidor Express para cursos/lecciones.
 *
 * Pensado para correr junto a tpc-main (Next.js, puerto 3000).
 * CORS configurado vía env CORS_ORIGINS.
 */
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'

import { config } from './config'
import { corsMiddleware } from './middleware/cors'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

import healthRouter from './routes/health'
import coursesRouter from './routes/courses'
import lessonsRouter from './routes/lessons'
import billingRouter from './routes/billing'
import { billingWebhookHandler } from './routes/billingWebhook'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(helmet())
app.use(corsMiddleware)
app.options('*', corsMiddleware)

// ⚠️ El webhook de Stripe DEBE ir ANTES de express.json(): necesita el body
// crudo (Buffer) para verificar la firma. Si lo parseas como JSON antes,
// Stripe rechaza la firma y pierdes todos los eventos.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingWebhookHandler,
)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

if (config.isDev) {
  app.use(morgan('dev'))
}

// Rutas
app.use('/health', healthRouter)
app.use('/api/health', healthRouter)
app.use('/api/courses', coursesRouter)
app.use('/api/lessons', lessonsRouter)
app.use('/api/billing', billingRouter)

// Fallbacks
app.use(notFoundHandler)
app.use(errorHandler)

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.info(
    `[backendcursos] listening on http://localhost:${config.port} (${config.nodeEnv})`,
  )
  // eslint-disable-next-line no-console
  console.info(
    `[backendcursos] CORS allow-list: ${
      config.corsOrigins.length ? config.corsOrigins.join(', ') : '(vacío, solo localhost en dev)'
    }`,
  )
})

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.info(`[backendcursos] ${signal} recibido — cerrando servidor`)
  server.close(() => process.exit(0))
  // Forzar salida si no cierra en 10s
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
