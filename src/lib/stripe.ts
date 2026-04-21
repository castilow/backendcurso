/**
 * Cliente Stripe compartido.
 * Lazy init: no explota si STRIPE_SECRET_KEY está vacía (útil para arrancar
 * el server en dev antes de configurar Stripe).
 */
import Stripe from 'stripe'
import { config } from '../config'

let client: Stripe | null = null

export function getStripe(): Stripe {
  if (!config.stripe.secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY no está configurada. Añádela a .env antes de llamar a endpoints de billing.',
    )
  }
  if (!client) {
    client = new Stripe(config.stripe.secretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
      appInfo: {
        name: 'backendcursos',
        version: '0.1.0',
      },
    })
  }
  return client
}
