/**
 * Generador de pósters (.jpg) para los vídeos del curso.
 * ----------------------------------------------------------------
 * Para cada `.mp4` del bucket de Storage, extrae un fotograma con ffmpeg
 * y lo sube como `.jpg` al mismo bucket bajo el prefijo `posters/`.
 *
 * Diseño:
 *   - Usa el binario estático de @ffmpeg-installer/ffmpeg, así no exige
 *     ffmpeg instalado en el host (Render, contenedores mínimos, etc.).
 *   - `-ss <segundo>` va ANTES de `-i` → input seek. ffmpeg salta directo
 *     al keyframe más cercano sin decodificar todo lo anterior. Mucho más
 *     rápido que post-decoding seek.
 *   - El input es la URL pública del .mp4 (Storage público) → ffmpeg
 *     descarga sólo los bytes que necesita por HTTP. No tocamos disco.
 *   - Output a stdout como image2/mjpeg → capturamos un Buffer y lo
 *     subimos a Supabase Storage. Cero ficheros temporales.
 *   - Idempotente: si ya existe el .jpg y `force=false`, devuelve "skipped".
 */
import { spawn } from 'node:child_process'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

import { config } from '../config'
import { getSupabase } from './supabase'

const FFMPEG_BIN = ffmpegInstaller.path

/** Construye la URL pública (sin firmar) de un objeto del bucket de cursos. */
export function publicVideoUrl(videoPath: string): string {
  const base = config.supabase.url.replace(/\/+$/, '')
  const bucket = config.courseStorage.bucket
  const encoded = videoPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`
}

/**
 * Convierte "MODULO 1/foo.mp4" → "posters/MODULO 1/foo.jpg".
 * Mantiene la jerarquía de carpetas para que el frontend pueda derivar
 * el path del póster a partir del path del vídeo sin lookups.
 */
export function posterPathFor(videoPath: string): string {
  const withoutExt = videoPath.replace(/\.[^./]+$/, '')
  return `${config.courseStorage.posterPrefix}/${withoutExt}.jpg`
}

export type PosterResult = {
  videoPath: string
  posterPath: string
  status: 'created' | 'skipped' | 'error'
  error?: string
  bytes?: number
}

export type GenerateOptions = {
  /** Segundo del vídeo a capturar (default: 2). */
  second?: number
  /** Si true, sobreescribe el póster existente. Default: false. */
  force?: boolean
  /** Calidad JPEG: 2 (mejor) – 31 (peor). Default: 4. */
  jpegQuality?: number
  /** Ancho máximo del JPG (mantiene aspect ratio). Default: 640. */
  maxWidth?: number
  /** Timeout por vídeo en ms. Default: 30s. */
  timeoutMs?: number
}

/**
 * Modos de seek que probamos:
 *  - 'input'  → `-ss` ANTES de `-i` (rápido, requiere moov al principio).
 *  - 'output' → `-ss` DESPUÉS de `-i` (lento, decodifica desde 0, pero
 *    funciona aunque el moov esté al final del fichero — caso típico de
 *    .mp4 generados sin "faststart").
 */
type SeekMode = 'input' | 'output'

function isMoovError(stderr: string): boolean {
  return /moov atom not found/i.test(stderr)
}

/**
 * Captura un frame del .mp4 con ffmpeg y devuelve los bytes JPEG.
 * No toca disco — todo va por stdout/Buffer.
 *
 * `mode` permite alternar input seek / output seek desde el caller.
 * Para vídeos con `moov atom not found` o que dan timeout en input seek,
 * el caller hace fallback a `mode: 'output'` que decodifica desde el
 * principio (más lento pero compatible con cualquier mp4 válido).
 */
function extractFrameJpeg(
  videoUrl: string,
  opts: Required<Pick<GenerateOptions, 'second' | 'jpegQuality' | 'maxWidth' | 'timeoutMs'>>,
  mode: SeekMode = 'input',
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const seekBeforeInput: string[] = mode === 'input' ? ['-ss', String(opts.second)] : []
    const seekAfterInput: string[] = mode === 'output' ? ['-ss', String(opts.second)] : []
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      ...seekBeforeInput,
      '-i', videoUrl,
      ...seekAfterInput,
      '-frames:v', '1',
      '-vf', `scale='min(${opts.maxWidth},iw)':-2`,
      '-q:v', String(opts.jpegQuality),
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ]

    const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    const out: Buffer[] = []
    const errOut: Buffer[] = []
    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, opts.timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errOut.push(chunk))

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (timedOut) {
        const err = new Error(`ffmpeg timeout (>${opts.timeoutMs}ms)`)
        ;(err as Error & { isTimeout?: boolean }).isTimeout = true
        return reject(err)
      }
      if (code !== 0) {
        const stderr = Buffer.concat(errOut).toString('utf8').trim()
        const err = new Error(`ffmpeg exit ${code}: ${stderr || '(sin stderr)'}`)
        ;(err as Error & { isMoovError?: boolean }).isMoovError = isMoovError(stderr)
        return reject(err)
      }
      const buf = Buffer.concat(out)
      if (buf.length === 0) {
        return reject(new Error('ffmpeg no produjo bytes (vídeo demasiado corto o frame vacío)'))
      }
      resolve(buf)
    })
  })
}

/**
 * Wrapper que prueba primero input seek (rápido) y, si falla por moov-at-end
 * o por timeout, reintenta con output seek (lento pero robusto). Para el
 * fallback duplicamos el timeout porque output seek decodifica desde 0.
 */
async function extractFrameJpegWithFallback(
  videoUrl: string,
  opts: Required<Pick<GenerateOptions, 'second' | 'jpegQuality' | 'maxWidth' | 'timeoutMs'>>,
): Promise<Buffer> {
  try {
    return await extractFrameJpeg(videoUrl, opts, 'input')
  } catch (err) {
    const flags = err as Error & { isMoovError?: boolean; isTimeout?: boolean }
    const shouldRetry = flags.isMoovError || flags.isTimeout
    if (!shouldRetry) throw err
    // Output seek decodifica desde el inicio → necesita más tiempo.
    return extractFrameJpeg(videoUrl, { ...opts, timeoutMs: opts.timeoutMs * 3 }, 'output')
  }
}

/**
 * Genera y sube el póster para UN vídeo.
 * Devuelve un PosterResult con el estado (created / skipped / error).
 */
export async function generatePoster(
  videoPath: string,
  options: GenerateOptions = {},
): Promise<PosterResult> {
  const second = options.second ?? 2
  const force = options.force ?? false
  const jpegQuality = options.jpegQuality ?? 4
  const maxWidth = options.maxWidth ?? 640
  const timeoutMs = options.timeoutMs ?? 30_000

  const posterPath = posterPathFor(videoPath)
  const supabase = getSupabase()
  const storage = supabase.storage.from(config.courseStorage.bucket)

  // Idempotencia: si ya existe el .jpg y no se fuerza regeneración → skip.
  if (!force) {
    const folder = posterPath.includes('/')
      ? posterPath.slice(0, posterPath.lastIndexOf('/'))
      : ''
    const filename = posterPath.slice(posterPath.lastIndexOf('/') + 1)
    const { data: existing } = await storage.list(folder, { search: filename, limit: 1 })
    if (existing && existing.some((entry) => entry.name === filename)) {
      return { videoPath, posterPath, status: 'skipped' }
    }
  }

  try {
    const videoUrl = publicVideoUrl(videoPath)
    const jpeg = await extractFrameJpegWithFallback(videoUrl, {
      second,
      jpegQuality,
      maxWidth,
      timeoutMs,
    })

    const { error: uploadErr } = await storage.upload(posterPath, jpeg, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: 'public, max-age=86400, s-maxage=604800, immutable',
    })
    if (uploadErr) {
      return { videoPath, posterPath, status: 'error', error: uploadErr.message }
    }

    return { videoPath, posterPath, status: 'created', bytes: jpeg.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { videoPath, posterPath, status: 'error', error: message }
  }
}

/**
 * Lista todos los .mp4 del bucket recursivamente, descartando los que
 * estén bajo el prefijo de pósters. Devuelve los paths relativos al
 * bucket (mismos paths que se pasarían a `generatePoster`).
 */
export async function listAllVideoPaths(): Promise<string[]> {
  const supabase = getSupabase()
  const storage = supabase.storage.from(config.courseStorage.bucket)
  const posterPrefix = config.courseStorage.posterPrefix

  const out: string[] = []
  const queue: string[] = ['']

  while (queue.length > 0) {
    const folder = queue.shift()!
    // Saltamos la carpeta de pósters: no genera pósters de pósters.
    if (folder === posterPrefix || folder.startsWith(`${posterPrefix}/`)) continue

    // Supabase pagina por defecto en 100; pedimos hasta 1000 por iteración.
    const { data, error } = await storage.list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`No se pudo listar ${folder || '(raíz)'}: ${error.message}`)
    if (!data) continue

    for (const entry of data) {
      const fullPath = folder ? `${folder}/${entry.name}` : entry.name
      // Carpetas en Supabase Storage aparecen con `id` null y sin `metadata`.
      const isFolder = entry.id === null && entry.metadata === null
      if (isFolder) {
        queue.push(fullPath)
      } else if (/\.(mp4|mov|m4v|webm)$/i.test(entry.name)) {
        out.push(fullPath)
      }
    }
  }

  return out
}

/**
 * Genera pósters para una lista (o para todos si `paths` viene vacío).
 * Procesa en serie para no saturar ancho de banda ni la CPU del backend.
 * Si necesitas paralelismo, ajusta aquí (p. ej. `p-limit` con concurrency=2).
 */
export async function generatePostersForPaths(
  paths: string[] | null,
  options: GenerateOptions = {},
): Promise<PosterResult[]> {
  const targets = paths && paths.length > 0 ? paths : await listAllVideoPaths()
  const results: PosterResult[] = []
  for (const path of targets) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await generatePoster(path, options))
  }
  return results
}
