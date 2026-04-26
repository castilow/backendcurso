/**
 * Rutas para generar pósters (.jpg) de los vídeos del curso.
 * ----------------------------------------------------------------
 * Endpoints (todos protegidos con `requireInternalAuth`, NO se exponen
 * al navegador):
 *
 *   POST /api/courses/posters/generate
 *     Body: { paths?: string[], force?: boolean, second?: number,
 *             jpegQuality?: number, maxWidth?: number }
 *
 *     - Si `paths` está presente y no vacío → genera sólo esos.
 *     - Si `paths` falta o es vacío → escanea el bucket completo y
 *       genera todos los .mp4 que aún no tengan póster (a menos que
 *       `force=true`, en cuyo caso reescribe todos).
 *
 *     Respuesta:
 *       { ok, total, created, skipped, errors, results: PosterResult[] }
 *
 *   GET /api/courses/posters/list
 *     Devuelve la lista de paths .mp4 detectados en el bucket. Útil
 *     para auditar qué vídeos hay antes de regenerar.
 *
 * Llamada típica desde tpc-main (server-to-server, no desde el browser):
 *   curl -X POST $BACKENDCURSOS/api/courses/posters/generate \
 *     -H "Authorization: Bearer $BILLING_ACCESS_SECRET" \
 *     -H "Content-Type: application/json" -d '{}'
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'

import { requireInternalAuth } from '../middleware/internalAuth'
import {
  generatePostersForPaths,
  listAllVideoPaths,
  type PosterResult,
} from '../lib/posterGenerator'

const router = Router()

const generateSchema = z.object({
  paths: z.array(z.string().min(1)).optional(),
  force: z.boolean().optional(),
  second: z.number().int().min(0).max(3600).optional(),
  jpegQuality: z.number().int().min(2).max(31).optional(),
  maxWidth: z.number().int().min(120).max(4096).optional(),
  timeoutMs: z.number().int().min(2000).max(120_000).optional(),
})

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

router.post(
  '/generate',
  requireInternalAuth,
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Body inválido',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    const { paths, ...opts } = parsed.data

    const results = await generatePostersForPaths(paths ?? null, opts)
    const summary = summarize(results)

    return res.status(200).json({ ok: true, ...summary, results })
  }),
)

router.get(
  '/list',
  requireInternalAuth,
  asyncHandler(async (_req, res) => {
    const paths = await listAllVideoPaths()
    return res.status(200).json({ ok: true, total: paths.length, paths })
  }),
)

function summarize(results: PosterResult[]) {
  let created = 0
  let skipped = 0
  let errors = 0
  for (const r of results) {
    if (r.status === 'created') created++
    else if (r.status === 'skipped') skipped++
    else errors++
  }
  return { total: results.length, created, skipped, errors }
}

export default router
