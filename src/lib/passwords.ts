/**
 * Generador de contraseñas aleatorias para el provisioning automático
 * tras un pago en Stripe.
 * ----------------------------------------------------------------
 * Formato:  broker-xxxxxxxx  (prefijo humano + 8 chars base32)
 *   - 8 chars de alfabeto [a-z0-9] sin confusos (0/O/1/l/I excluidos)
 *     → 32^8 ≈ 1.1e12 combinaciones, más que suficiente para un
 *     password "single-use" hasta que el usuario lo cambie.
 *   - Prefijo `broker-` ayuda a que el usuario reconozca que es la
 *     contraseña del portal y no ruido aleatorio del email.
 *
 * Usa crypto.randomBytes (CSPRNG) — NO Math.random.
 *
 * Rechazo uniforme (bias): generamos bytes en bloques y descartamos
 * los que quedarían fuera del múltiplo exacto de 32 para no sesgar
 * la distribución. 256 % 32 === 0, así que NO hay sesgo — todos los
 * valores byte caen en un chunk limpio. Si cambias el alfabeto a uno
 * cuyo tamaño no divida 256, hay que ajustar.
 */
import { randomBytes } from 'node:crypto'

// 32 caracteres — sin 0/O/1/l/I para legibilidad si el usuario lo
// copia a mano desde el email.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
// Nota: ALPHABET tiene 31 chars realmente. 256 % 31 ≠ 0 → hay que
// descartar bytes >= 248 (31*8) para evitar sesgo. Lo hacemos abajo.
const ALPHABET_LEN = ALPHABET.length
const MAX_UNBIASED = Math.floor(256 / ALPHABET_LEN) * ALPHABET_LEN // 248

/** Devuelve `length` caracteres aleatorios del alfabeto sin sesgo. */
function randomAlphabet(length: number): string {
  const out: string[] = []
  while (out.length < length) {
    // Pedimos un poco más de bytes para reducir número de rondas:
    // con length=8, pedimos 16 bytes y en promedio aprovechamos ~15.
    const buf = randomBytes(length * 2)
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const byte = buf[i]
      if (byte >= MAX_UNBIASED) continue
      out.push(ALPHABET[byte % ALPHABET_LEN])
    }
  }
  return out.join('')
}

/**
 * Contraseña aleatoria para un usuario nuevo tras pagar.
 * Ejemplo: `broker-4kq7m2xp`.
 */
export function generateInitialPassword(): string {
  return `broker-${randomAlphabet(8)}`
}
