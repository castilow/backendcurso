/**
 * Smoke: comprueba helpers puros de purchasesStore (normalizeEmail,
 * hasAccess). No hace red a Supabase — solo valida la lógica sin
 * depender de la tabla.
 */
/* eslint-disable no-console */
import {
  hasAccess,
  normalizeEmail,
  type EmailPurchase,
} from '../src/lib/purchasesStore'

const cases: Array<[unknown, string | null]> = [
  ['  Foo@BAR.COM ', 'foo@bar.com'],
  ['no-at', null],
  ['', null],
  [null, null],
  ['x'.repeat(330) + '@b.com', null],
  ['valid@x.co', 'valid@x.co'],
]

let ok = 0
let bad = 0

for (const [input, expected] of cases) {
  const got = normalizeEmail(input as string)
  if (got === expected) {
    ok++
  } else {
    bad++
    console.error(
      `[FAIL] normalizeEmail(${JSON.stringify(input)}) = ${JSON.stringify(got)} (esperado ${JSON.stringify(expected)})`,
    )
  }
}

function p(paid: boolean, refunded: boolean): EmailPurchase {
  return {
    email: 'a@b.com',
    paid,
    refunded,
    stripeCustomerId: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    amountPaid: null,
    currency: null,
    purchasedAt: null,
    updatedAt: new Date().toISOString(),
  }
}

const assertions: Array<[string, boolean]> = [
  ['paid true + refunded false -> true', hasAccess(p(true, false)) === true],
  ['paid true + refunded true -> false', hasAccess(p(true, true)) === false],
  ['paid false -> false', hasAccess(p(false, false)) === false],
  ['null purchase -> false', hasAccess(null) === false],
  ['undefined purchase -> false', hasAccess(undefined) === false],
]

for (const [name, pass] of assertions) {
  if (pass) {
    ok++
  } else {
    bad++
    console.error(`[FAIL] ${name}`)
  }
}

console.log(`smoke: ok=${ok} bad=${bad}`)
process.exit(bad === 0 ? 0 : 1)
