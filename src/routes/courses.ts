/**
 * Rutas de cursos (in-memory por ahora).
 * Cuando se conecte a una base real, reemplazar el array `courses`
 * por un repositorio (Postgres / Supabase / Prisma / etc).
 */
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../middleware/errorHandler'

const router = Router()

type Course = {
  id: string
  title: string
  description: string
  level: 'beginner' | 'intermediate' | 'advanced'
  createdAt: string
}

const courses: Course[] = [
  {
    id: 'c1',
    title: 'Curso de bienvenida',
    description: 'Introducción al sistema.',
    level: 'beginner',
    createdAt: new Date().toISOString(),
  },
]

const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
})

router.get('/', (_req, res) => {
  res.json({ ok: true, data: courses })
})

router.get('/:id', (req, res) => {
  const course = courses.find((c) => c.id === req.params.id)
  if (!course) throw new HttpError(404, 'Course not found')
  res.json({ ok: true, data: course })
})

router.post('/', (req, res) => {
  const parsed = createCourseSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new HttpError(400, `Invalid payload: ${parsed.error.message}`)
  }
  const next: Course = {
    id: `c${courses.length + 1}`,
    title: parsed.data.title,
    description: parsed.data.description,
    level: parsed.data.level,
    createdAt: new Date().toISOString(),
  }
  courses.push(next)
  res.status(201).json({ ok: true, data: next })
})

router.delete('/:id', (req, res) => {
  const idx = courses.findIndex((c) => c.id === req.params.id)
  if (idx < 0) throw new HttpError(404, 'Course not found')
  const [removed] = courses.splice(idx, 1)
  res.json({ ok: true, data: removed })
})

export default router
