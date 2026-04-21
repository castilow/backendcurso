/**
 * Rutas de lecciones (in-memory por ahora).
 * Listado por curso: GET /api/lessons?courseId=c1
 */
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../middleware/errorHandler'

const router = Router()

type Lesson = {
  id: string
  courseId: string
  title: string
  content: string
  order: number
  createdAt: string
}

const lessons: Lesson[] = [
  {
    id: 'l1',
    courseId: 'c1',
    title: 'Primera lección',
    content: 'Bienvenida al curso.',
    order: 1,
    createdAt: new Date().toISOString(),
  },
]

const createLessonSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().max(20000).default(''),
  order: z.number().int().nonnegative().default(0),
})

router.get('/', (req, res) => {
  const { courseId } = req.query
  let data = lessons
  if (typeof courseId === 'string' && courseId.trim()) {
    data = data.filter((l) => l.courseId === courseId)
  }
  res.json({ ok: true, data })
})

router.get('/:id', (req, res) => {
  const lesson = lessons.find((l) => l.id === req.params.id)
  if (!lesson) throw new HttpError(404, 'Lesson not found')
  res.json({ ok: true, data: lesson })
})

router.post('/', (req, res) => {
  const parsed = createLessonSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new HttpError(400, `Invalid payload: ${parsed.error.message}`)
  }
  const next: Lesson = {
    id: `l${lessons.length + 1}`,
    courseId: parsed.data.courseId,
    title: parsed.data.title,
    content: parsed.data.content,
    order: parsed.data.order,
    createdAt: new Date().toISOString(),
  }
  lessons.push(next)
  res.status(201).json({ ok: true, data: next })
})

router.delete('/:id', (req, res) => {
  const idx = lessons.findIndex((l) => l.id === req.params.id)
  if (idx < 0) throw new HttpError(404, 'Lesson not found')
  const [removed] = lessons.splice(idx, 1)
  res.json({ ok: true, data: removed })
})

export default router
