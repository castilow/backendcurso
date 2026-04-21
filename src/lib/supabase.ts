/**
 * Cliente de Supabase para backendcursos (server-side, SERVICE_ROLE).
 * ----------------------------------------------------------------
 * Se usa exclusivamente desde el backend (webhooks Stripe, endpoints
 * protegidos) para leer/escribir `public.billing_access`, que tiene
 * RLS activo sin policies — solo service_role puede tocarla.
 *
 * Lazy init: no se instancia hasta que alguien llama a getSupabase().
 * Si SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY faltan, lanza con un
 * mensaje claro (el caller decide si eso es fatal o fail-open).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { config, isSupabaseConfigured } from '../config'

let cached: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (cached) return cached

  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase no configurado: define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env',
    )
  }

  cached = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return cached
}

/** Variante que NO lanza: devuelve null si no hay configuración. */
export function getSupabaseOrNull(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  return getSupabase()
}
