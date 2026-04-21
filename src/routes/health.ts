import { Router } from 'express'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'backendcursos',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  })
})

export default router
