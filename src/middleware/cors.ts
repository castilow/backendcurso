/**
 * CORS con allow-list explícita.
 * - En dev, si no hay origin (curl/Postman) se permite.
 * - En prod, sólo los orígenes de CORS_ORIGINS.
 */
import cors, { type CorsOptions } from 'cors'
import { config } from '../config'

function buildCorsOptions(): CorsOptions {
  const allowed = new Set(config.corsOrigins)

  return {
    origin(origin, callback) {
      // Peticiones sin origen (healthchecks, curl, server-to-server): permitir siempre.
      if (!origin) return callback(null, true)

      if (allowed.has(origin)) {
        return callback(null, true)
      }

      // En dev, permitir cualquier http://localhost:* y http://127.0.0.1:* para flexibilidad
      if (config.isDev) {
        try {
          const u = new URL(origin)
          const host = u.hostname
          if (host === 'localhost' || host === '127.0.0.1') {
            return callback(null, true)
          }
        } catch {
          // ignore
        }
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  }
}

export const corsMiddleware = cors(buildCorsOptions())
