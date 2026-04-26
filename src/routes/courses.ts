/**
 * Rutas de cursos (in-memory por ahora).
 * Cuando se conecte a una base real, reemplazar el array `courses`
 * por un repositorio (Postgres / Supabase / Prisma / etc).
 */
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../middleware/errorHandler'
import { config } from '../config'

const router = Router()

type CatalogLesson = {
  id: string
  title: string
  thumbnail: string
  vimeoSrc: string | null
  videoTitle: string
  summary: string
  module: number
  order: number
}

function buildCourseStorageBaseUrl(): string {
  const custom = process.env.COURSE_STORAGE_PUBLIC_BASE_URL?.trim()
  if (custom) return custom.replace(/\/+$/, '')
  const supabaseUrl = config.supabase.url?.trim()
  if (supabaseUrl) return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/curso`
  return 'https://fgawbfgtyvenknnhtpox.supabase.co/storage/v1/object/public/curso'
}

function buildStorageVideoUrl(path: string): string {
  const base = buildCourseStorageBaseUrl()
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/${encodedPath}`
}

/**
 * Dada una URL pública del bucket (la que devuelve buildStorageVideoUrl),
 * devuelve la URL pública del póster .jpg generado en `posters/`.
 *
 * Estos pósters los crea el endpoint POST /api/courses/posters/generate
 * (ver routes/posters.ts + lib/posterGenerator.ts). Si todavía no existe
 * el .jpg, la URL devolverá 404 y el frontend cae al placeholder gris.
 *
 * Devuelve null si la URL no apunta a este bucket de Storage.
 */
function buildStoragePosterUrlFromVideoUrl(videoUrl: string): string | null {
  const base = buildCourseStorageBaseUrl()
  if (!videoUrl.startsWith(`${base}/`)) return null

  const prefix = config.courseStorage.posterPrefix
  const encodedPath = videoUrl.slice(base.length + 1)
  // Decodificar para trabajar con el path "crudo", luego re-encodear segmentos.
  const decodedPath = encodedPath
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
  const withoutExt = decodedPath.replace(/\.[^./]+$/, '')
  const posterPath = `${prefix}/${withoutExt}.jpg`
  const encoded = posterPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/${encoded}`
}

const catalogLessons: CatalogLesson[] = [
  {
    id: 'captacion-1',
    title: 'Captacion: consigue mas oportunidades de compra',
    thumbnail: 'https://vumbnail.com/1121523798.jpg',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/Captacion de coches hacia concesionario TPC.mp4'),
    videoTitle: 'Captacion',
    summary:
      'Estrategias practicas para atraer clientes de calidad, mejorar la primera toma de contacto y aumentar el volumen de oportunidades.',
    module: 1,
    order: 1,
  },
  {
    id: 'm1-filtrar-leads',
    title: 'Como filtrar buenos leads',
    thumbnail: 'https://picsum.photos/seed/m1-filtrar-leads/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/como filtrar buenos leads TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Metodo practico para identificar oportunidades de calidad y priorizar leads con mayor probabilidad de cierre.',
    module: 1,
    order: 2,
  },
  {
    id: 'm1-ganar-dinero',
    title: 'Como ganar dinero',
    thumbnail: 'https://picsum.photos/seed/m1-ganar-dinero/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/como ganar dinero TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Claves para construir margen, acelerar operaciones y aumentar ingresos de forma sostenida.',
    module: 1,
    order: 3,
  },
  {
    id: 'm1-cuanto-ganar-sector',
    title: 'Cuanto se puede ganar en este sector',
    thumbnail: 'https://picsum.photos/seed/m1-cuanto-ganar/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/cuanto se puede ganar en este sector TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Vision realista del potencial economico del sector y como planificar objetivos por fase.',
    module: 1,
    order: 4,
  },
  {
    id: 'm1-diferencias-broker',
    title: 'Diferencias con un broker',
    thumbnail: 'https://picsum.photos/seed/m1-broker-diferencias/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/diferencias con un broker  TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Comparativa de modelos y posicionamiento para explicar valor y diferenciarte en el mercado.',
    module: 1,
    order: 5,
  },
  {
    id: 'm1-errores-principiantes',
    title: 'Errores de principiantes',
    thumbnail: 'https://picsum.photos/seed/m1-errores-principiante/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/errores de principiantes  TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Errores comunes al iniciar y como evitarlos para avanzar mas rapido desde el primer mes.',
    module: 1,
    order: 6,
  },
  {
    id: 'm1-leads-coste',
    title: 'Leads con coste',
    thumbnail: 'https://picsum.photos/seed/m1-leads-coste/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/Leads con coste TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Como estructurar campañas de pago, controlar CAC y convertir trafico en oportunidades rentables.',
    module: 1,
    order: 7,
  },
  {
    id: 'm1-leads-sin-coste',
    title: 'Leads sin coste',
    thumbnail: 'https://picsum.photos/seed/m1-leads-sin-coste/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/Leads sin coste TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Canales organicos y tacticas de captacion sin inversion para generar flujo constante de contactos.',
    module: 1,
    order: 8,
  },
  {
    id: 'm1-modelo-stock',
    title: 'Modelo con stock y sin stock',
    thumbnail: 'https://picsum.photos/seed/m1-modelo-stock/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/modelo con stock t sin.mp4'),
    videoTitle: 'Captacion',
    summary: 'Pros, contras y estrategia de operacion para decidir entre modelo con stock o intermediacion.',
    module: 1,
    order: 9,
  },
  {
    id: 'm1-por-que-broker',
    title: 'Por que ser broker',
    thumbnail: 'https://picsum.photos/seed/m1-por-que-broker/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 1/porque ser broker TPC.mp4'),
    videoTitle: 'Captacion',
    summary: 'Fundamentos del modelo broker, propuesta de valor y oportunidades de crecimiento profesional.',
    module: 1,
    order: 10,
  },
  {
    id: 'mentalidad-2',
    title: 'Mentalidad: disciplina y enfoque para vender mejor',
    thumbnail: 'https://picsum.photos/seed/carhubstock/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Clase Teorica sin overlays TPC.mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Habitos, consistencia y actitud comercial para sostener resultados en el tiempo.',
    module: 2,
    order: 1,
  },
  {
    id: 'm2-clase-practica',
    title: 'Clase practica con llamada no captada',
    thumbnail: 'https://picsum.photos/seed/m2-practica/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Clase practica con llamada no captada TPC.mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Analisis real de una llamada no captada y mejoras concretas para elevar la conversion.',
    module: 2,
    order: 2,
  },
  {
    id: 'm2-llamada-diego-1',
    title: 'Llamada Diego captado',
    thumbnail: 'https://picsum.photos/seed/m2-diego-captado/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Llamada Diego captado (TPC).mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Caso practico de llamada captada con estructura de conversacion y cierre de siguiente paso.',
    module: 2,
    order: 3,
  },
  {
    id: 'm2-llamada-diego-2',
    title: 'Llamada de otro Diego captado',
    thumbnail: 'https://picsum.photos/seed/m2-diego-captado-2/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Llamada de otro Diego captado (TPC).mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Segundo ejemplo de captacion efectiva para reforzar patrones de comunicacion.',
    module: 2,
    order: 4,
  },
  {
    id: 'm2-llamada-eusebio',
    title: 'Llamada Eusebio captado',
    thumbnail: 'https://picsum.photos/seed/m2-eusebio/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Llamada Eusebio captado (TPC).mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Caso real de captacion con objeciones y respuesta comercial paso a paso.',
    module: 2,
    order: 5,
  },
  {
    id: 'm2-llamada-jorge',
    title: 'Llamada Jorge no captada',
    thumbnail: 'https://picsum.photos/seed/m2-jorge/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Llamada Jorge no captada (TPC).mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Leccion de mejora sobre una llamada no convertida para corregir enfoque y timing.',
    module: 2,
    order: 6,
  },
  {
    id: 'm2-llamada-pedro',
    title: 'Llamada Pedro captado',
    thumbnail: 'https://picsum.photos/seed/m2-pedro/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 2/Llamada pedro captado (TPC).mp4'),
    videoTitle: 'Mentalidad',
    summary: 'Ejemplo de llamada captada con buena cualificacion y siguiente accion definida.',
    module: 2,
    order: 7,
  },
  {
    id: 'venta-3',
    title: 'Venta: del primer contacto al cierre',
    thumbnail: 'https://picsum.photos/seed/carhubleads/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/CASO PRACTICO VENTA TPC.mp4'),
    videoTitle: 'Venta',
    summary: 'Tecnicas de seguimiento, presentacion de valor y cierre para convertir mas operaciones.',
    module: 3,
    order: 1,
  },
  {
    id: 'm3-carhub',
    title: 'CARHUB TPC',
    thumbnail: 'https://picsum.photos/seed/m3-carhub/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/CARHUB TPC.mp4'),
    videoTitle: 'Venta',
    summary: 'Flujo operativo completo en CarHub para gestionar proceso comercial de principio a fin.',
    module: 3,
    order: 2,
  },
  {
    id: 'm3-edicion-fotografia',
    title: 'Edicion de fotografia para venta',
    thumbnail: 'https://picsum.photos/seed/m3-edicion-fotografia/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/EDICION DE FOTOGRAFIA PARA VENTA (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Como editar fotos para hacer el anuncio mas atractivo y acelerar la conversion.',
    module: 3,
    order: 3,
  },
  {
    id: 'm3-final-formacion',
    title: 'Final formacion',
    thumbnail: 'https://picsum.photos/seed/m3-final-formacion/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/FINAL FORMACIoN (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Cierre del bloque con plan de accion y puntos clave para aplicar en operativa real.',
    module: 3,
    order: 4,
  },
  {
    id: 'm3-introduccion-stock',
    title: 'Introduccion stock de coches',
    thumbnail: 'https://picsum.photos/seed/m3-introduccion-stock/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/introduccion stock de coches (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Fundamentos para gestionar stock con criterio comercial y rotacion eficiente.',
    module: 3,
    order: 5,
  },
  {
    id: 'm3-introduccion-ventas',
    title: 'Introduccion ventas',
    thumbnail: 'https://picsum.photos/seed/m3-introduccion-ventas/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/introduccion ventas (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Base de ventas para estructurar el proceso desde primer contacto hasta cierre.',
    module: 3,
    order: 6,
  },
  {
    id: 'm3-minimodulo-crm',
    title: 'Minimodulo CRM',
    thumbnail: 'https://picsum.photos/seed/m3-minimodulo-crm/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/MINIMoDULO CRM (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Uso practico de CRM para seguimiento, trazabilidad y mejora de conversion.',
    module: 3,
    order: 7,
  },
  {
    id: 'm3-negociacion-fisico',
    title: 'Negociacion fisico',
    thumbnail: 'https://picsum.photos/seed/m3-negociacion-fisico/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/NEGOCIACI0N FISICO (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Tecnicas para negociar en visita presencial protegiendo margen y valor percibido.',
    module: 3,
    order: 8,
  },
  {
    id: 'm3-negociaciones-llamadas',
    title: 'Negociaciones en llamadas',
    thumbnail: 'https://picsum.photos/seed/m3-negociaciones-llamadas/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/NEGOCIACIONES EN LLAMADAS (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Guiones y tacticas para negociar por telefono sin perder control de la venta.',
    module: 3,
    order: 9,
  },
  {
    id: 'm3-presentar-comision',
    title: 'Presentar comision',
    thumbnail: 'https://picsum.photos/seed/m3-presentar-comision/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/PRESENTAR COMISIoN (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Como presentar comision de forma natural, clara y orientada a valor.',
    module: 3,
    order: 10,
  },
  {
    id: 'm3-primer-trato',
    title: 'Primer trato ventas',
    thumbnail: 'https://picsum.photos/seed/m3-primer-trato/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/PRIMER TRATO ventas (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Estructura del primer trato para generar confianza y avanzar a siguiente paso.',
    module: 3,
    order: 11,
  },
  {
    id: 'm3-rompe-objeciones',
    title: 'Rompe las objeciones',
    thumbnail: 'https://picsum.photos/seed/m3-rompe-objeciones/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/ROMPE LAS OBJECCIONES (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Marco practico para resolver objeciones frecuentes y mantener avance comercial.',
    module: 3,
    order: 12,
  },
  {
    id: 'm3-seguimiento-optimo',
    title: 'Seguimiento optimo',
    thumbnail: 'https://picsum.photos/seed/m3-seguimiento-optimo/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/SEGUIMIENTO oPTIMO (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Sistema de seguimiento para reducir perdida de leads y cerrar mas operaciones.',
    module: 3,
    order: 13,
  },
  {
    id: 'm3-tecnicas-persuasion',
    title: 'Tecnicas de persuasion',
    thumbnail: 'https://picsum.photos/seed/m3-tecnicas-persuasion/640/360',
    vimeoSrc: buildStorageVideoUrl('MODULO 3/TeCNICAS DE PERSUASION (TPC).mp4'),
    videoTitle: 'Venta',
    summary: 'Recursos de persuasion aplicables a llamadas, reuniones y cierres en concesionario.',
    module: 3,
    order: 14,
  },
  {
    id: 'extra-formacion-1',
    title: 'Video formacion 1 TPC',
    thumbnail: 'https://picsum.photos/seed/extra-formacion-1/640/360',
    vimeoSrc: buildStorageVideoUrl('FORMACION TPC/EXTRAS/Video formacion 1 TPC.mp4'),
    videoTitle: 'Extras',
    summary: 'Contenido adicional para reforzar conceptos y acelerar la aplicacion practica.',
    module: 4,
    order: 1,
  },
  {
    id: 'extra-formacion-2',
    title: 'Video formacion 2 TPC',
    thumbnail: 'https://picsum.photos/seed/extra-formacion-2/640/360',
    vimeoSrc: buildStorageVideoUrl('FORMACION TPC/EXTRAS/Video formacion 2 TPC.mp4'),
    videoTitle: 'Extras',
    summary: 'Bloque complementario con recomendaciones operativas para mejorar resultados.',
    module: 4,
    order: 2,
  },
  {
    id: 'extra-vsl-largo',
    title: 'VSL nuevo largo YouTube',
    thumbnail: 'https://picsum.photos/seed/extra-vsl-largo/640/360',
    vimeoSrc: buildStorageVideoUrl('FORMACION TPC/EXTRAS/vsl nuevo largo youtbe.mp4'),
    videoTitle: 'Extras',
    summary: 'Material extra de referencia para reforzar el discurso comercial.',
    module: 4,
    order: 3,
  },
]

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

router.get('/catalog', (_req, res) => {
  // Para cada lesson cuyo vídeo viva en Storage, sobreescribimos el `thumbnail`
  // con la URL determinista del póster generado (`posters/<path>.jpg`). Así el
  // cliente recibe la miniatura real (frame del segundo 2) sin lookups extra.
  // Si el .jpg aún no existe (no se ha corrido /posters/generate) el browser
  // recibirá 404 y el frontend cae al placeholder gris.
  const enriched = catalogLessons.map((lesson) => {
    if (!lesson.vimeoSrc) return lesson
    const posterUrl = buildStoragePosterUrlFromVideoUrl(lesson.vimeoSrc)
    if (!posterUrl) return lesson
    return { ...lesson, thumbnail: posterUrl }
  })

  const modulesMap = new Map<number, CatalogLesson[]>()
  for (const lesson of enriched) {
    const bucket = modulesMap.get(lesson.module) ?? []
    bucket.push(lesson)
    modulesMap.set(lesson.module, bucket)
  }

  const modules = Array.from(modulesMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([module, lessons]) => ({
      module,
      label: module === 4 ? 'Extras' : `Módulo ${module}`,
      lessonCount: lessons.length,
      lessons: [...lessons].sort((a, b) => a.order - b.order),
    }))

  res.json({
    ok: true,
    data: {
      totalLessons: enriched.length,
      modules,
      lessons: [...enriched].sort((a, b) =>
        a.module === b.module ? a.order - b.order : a.module - b.module,
      ),
    },
  })
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
