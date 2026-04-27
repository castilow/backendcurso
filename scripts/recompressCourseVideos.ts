/**
 * Recompresión de los .mp4 del curso para que pesen aprox. la mitad
 * sin perder calidad perceptible en clases grabadas.
 *
 * Estrategia
 * ----------
 *  1. Lista recursivamente el bucket Supabase del curso (`config.courseStorage.bucket`),
 *     ignorando `posters/` (son JPGs) y `originals/` (los backups).
 *  2. Para cada .mp4 que no haya sido procesado todavía (cf. `state.json`):
 *       - Lo descarga a /tmp.
 *       - Lo pasa por ffmpeg: H.264 CRF 24, ancho máximo 1280 px (720p),
 *         AAC 128 kbps, faststart (mp4 listo para streaming web).
 *       - Si la versión optimizada pesa < 90% del original:
 *           a) sube una copia del original a `originals/<path>` (backup).
 *           b) sobreescribe el path original con la versión optimizada.
 *       - Si no consigue reducir tamaño (vídeo ya estaba bien comprimido),
 *         lo deja igual y lo marca como visto.
 *  3. Guarda en `scripts/.recompress-state.json` los ya procesados, así
 *     puedes ejecutar el script varias veces y solo se ocupa de los nuevos.
 *
 * Uso (desde la raíz de backendcursos):
 *
 *     npx tsx scripts/recompressCourseVideos.ts            # procesa todo
 *     npx tsx scripts/recompressCourseVideos.ts --dry-run  # solo lista qué tocaría
 *     npx tsx scripts/recompressCourseVideos.ts --limit 3  # procesa los 3 primeros
 *     npx tsx scripts/recompressCourseVideos.ts --prefix "MODULO 1"
 *     npx tsx scripts/recompressCourseVideos.ts --no-backup
 *
 * Requisitos
 * ----------
 *  - Variables `.env`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *  - El bucket configurado por COURSE_STORAGE_BUCKET (por defecto "curso").
 *  - Node 18+ y `@ffmpeg-installer/ffmpeg` (ya en dependencies).
 */

/* eslint-disable no-console */
import 'dotenv/config'

import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

import { config, isSupabaseConfigured } from '../src/config'
import { getSupabase } from '../src/lib/supabase'

type Args = {
  dryRun: boolean
  noBackup: boolean
  limit: number | null
  prefix: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, noBackup: false, limit: null, prefix: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--no-backup') args.noBackup = true
    else if (a === '--limit') {
      const next = argv[++i]
      const n = Number(next)
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit requiere un número > 0 (recibido: ${next})`)
      }
      args.limit = Math.floor(n)
    } else if (a === '--prefix') {
      args.prefix = argv[++i] ?? null
      if (!args.prefix) throw new Error('--prefix requiere un valor')
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Uso: tsx scripts/recompressCourseVideos.ts [--dry-run] [--no-backup] [--limit N] [--prefix "MODULO 1"]',
      )
      process.exit(0)
    } else {
      throw new Error(`Argumento desconocido: ${a}`)
    }
  }
  return args
}

const STATE_PATH = join(__dirname, '.recompress-state.json')

type State = {
  processed: Record<
    string,
    {
      at: string
      originalBytes: number
      optimizedBytes: number
      replaced: boolean
      reason?: string
    }
  >
}

async function loadState(): Promise<State> {
  try {
    const raw = await readFile(STATE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as State
    if (!parsed || typeof parsed !== 'object' || !parsed.processed) {
      return { processed: {} }
    }
    return parsed
  } catch {
    return { processed: {} }
  }
}

async function saveState(state: State): Promise<void> {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

/** Lista TODOS los .mp4 del bucket recursivamente (ignora posters/ y originals/). */
async function listMp4Files(prefix?: string): Promise<string[]> {
  const supabase = getSupabase()
  const bucket = supabase.storage.from(config.courseStorage.bucket)
  const found: string[] = []

  async function walk(folder: string) {
    const { data, error } = await bucket.list(folder, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`list("${folder}") falló: ${error.message}`)
    if (!data) return

    for (const item of data) {
      const childPath = folder ? `${folder}/${item.name}` : item.name
      // En Supabase, las "carpetas" llegan como entries sin id (o con metadata null).
      const isFolder = item.id === null || item.id === undefined
      if (isFolder) {
        if (childPath === config.courseStorage.posterPrefix) continue
        if (childPath === 'originals') continue
        await walk(childPath)
        continue
      }
      if (!item.name.toLowerCase().endsWith('.mp4')) continue
      if (childPath.startsWith(`${config.courseStorage.posterPrefix}/`)) continue
      if (childPath.startsWith('originals/')) continue
      if (item.name.toLowerCase().endsWith('.optimized.mp4')) continue
      found.push(childPath)
    }
  }

  await walk(prefix ?? '')
  return found.sort()
}

/** Descarga un .mp4 del bucket a una ruta local. Devuelve el tamaño en bytes. */
async function downloadFile(path: string, dest: string): Promise<number> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(config.courseStorage.bucket)
    .download(path)
  if (error || !data) {
    throw new Error(`download("${path}") falló: ${error?.message || 'sin datos'}`)
  }
  const buf = Buffer.from(await data.arrayBuffer())
  await writeFile(dest, buf)
  return buf.byteLength
}

/** Sube un fichero local al bucket en `path`. Sobrescribe si ya existe. */
async function uploadFile(localPath: string, remotePath: string, contentType = 'video/mp4'): Promise<void> {
  const supabase = getSupabase()
  const buf = await readFile(localPath)
  const { error } = await supabase.storage
    .from(config.courseStorage.bucket)
    .upload(remotePath, buf, {
      cacheControl: '31536000',
      contentType,
      upsert: true,
    })
  if (error) {
    throw new Error(`upload("${remotePath}") falló: ${error.message}`)
  }
}

/** Lanza ffmpeg para recomprimir input → output. Promesa resuelve si exit code 0. */
function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // -crf 24: buena calidad, ~half del bitrate típico de cámara
    // -preset slow: mejor compresión a cambio de tiempo de CPU
    // scale='min(1280,iw)':-2: cap a 720p, mantiene aspect ratio, ancho par
    // aac 128k: audio comprimido suficiente para clases (la voz no necesita más)
    // +faststart: mueve el moov atom al principio, el navegador puede empezar a reproducir
    //             antes de descargar todo el archivo
    // pix_fmt yuv420p: compatible con todos los navegadores y dispositivos viejos
    const args = [
      '-y',
      '-i', input,
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '24',
      '-vf', "scale='min(1280,iw)':-2",
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-loglevel', 'error',
      '-stats',
      output,
    ]
    const proc = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit code ${code}`))
    })
  })
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function processOne(
  remotePath: string,
  args: Args,
  state: State,
): Promise<void> {
  const workDir = join(tmpdir(), 'recompress-' + Math.random().toString(36).slice(2, 8))
  await mkdir(workDir, { recursive: true })
  const inputLocal = join(workDir, 'input.mp4')
  const outputLocal = join(workDir, 'optimized.mp4')

  try {
    console.log(`\n--- ${remotePath} ---`)
    console.log('  descargando...')
    const originalBytes = await downloadFile(remotePath, inputLocal)
    console.log(`  original: ${formatBytes(originalBytes)}`)

    if (args.dryRun) {
      console.log('  [dry-run] no se ejecuta ffmpeg')
      return
    }

    console.log('  ffmpeg recomprimiendo...')
    const ffStart = Date.now()
    await runFfmpeg(inputLocal, outputLocal)
    const ffSeconds = ((Date.now() - ffStart) / 1000).toFixed(1)

    const optStat = await stat(outputLocal)
    const optimizedBytes = optStat.size
    const ratio = optimizedBytes / originalBytes
    console.log(
      `  optimizado: ${formatBytes(optimizedBytes)} ` +
        `(${(ratio * 100).toFixed(1)}% del original, ${ffSeconds}s)`,
    )

    // Si la "optimización" no consigue reducir al menos un 10%, no merece la pena
    // sustituir nada (re-encodear de nuevo siempre pierde algo de calidad).
    if (ratio > 0.9) {
      console.log('  reducción < 10%: no se sustituye, marcado como visto')
      state.processed[remotePath] = {
        at: new Date().toISOString(),
        originalBytes,
        optimizedBytes,
        replaced: false,
        reason: 'ratio>0.9',
      }
      await saveState(state)
      return
    }

    if (!args.noBackup) {
      const backupPath = `originals/${remotePath}`
      console.log(`  guardando backup en ${backupPath}`)
      await uploadFile(inputLocal, backupPath)
    } else {
      console.log('  --no-backup: NO se guarda copia del original')
    }

    console.log('  subiendo versión optimizada (sobrescribe el original)...')
    await uploadFile(outputLocal, remotePath)

    state.processed[remotePath] = {
      at: new Date().toISOString(),
      originalBytes,
      optimizedBytes,
      replaced: true,
    }
    await saveState(state)
    console.log(`  OK: ahorro ${formatBytes(originalBytes - optimizedBytes)}`)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!isSupabaseConfigured()) {
    console.error('ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias en .env')
    process.exit(1)
  }
  console.log(`Bucket: ${config.courseStorage.bucket}`)
  console.log(`ffmpeg: ${ffmpegInstaller.path}`)
  if (args.prefix) console.log(`Prefijo: "${args.prefix}"`)
  if (args.limit) console.log(`Limit: ${args.limit}`)
  if (args.dryRun) console.log('[modo dry-run: no se modifica nada]')

  console.log('\nListando .mp4 en el bucket...')
  const all = await listMp4Files(args.prefix ?? undefined)
  console.log(`Encontrados ${all.length} .mp4`)

  const state = await loadState()
  const pending = all.filter((p) => !state.processed[p])
  console.log(`Pendientes: ${pending.length} (${all.length - pending.length} ya procesados)`)

  const targets = args.limit ? pending.slice(0, args.limit) : pending
  if (targets.length === 0) {
    console.log('Nada que hacer. Todos los vídeos están procesados.')
    return
  }

  let savedTotal = 0
  let replacedCount = 0
  for (const path of targets) {
    try {
      const before = state.processed[path]
      await processOne(path, args, state)
      const after = state.processed[path]
      if (after?.replaced && !before) {
        savedTotal += after.originalBytes - after.optimizedBytes
        replacedCount++
      }
    } catch (err) {
      console.error(`  FALLO en "${path}":`, err)
    }
  }

  console.log('\n=== Resumen ===')
  console.log(`Vídeos procesados: ${targets.length}`)
  console.log(`Sustituidos: ${replacedCount}`)
  console.log(`Ahorro total: ${formatBytes(savedTotal)}`)
  console.log('Listo. Las URLs del catálogo siguen funcionando, ahora pesan menos.')
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
