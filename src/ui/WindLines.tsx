import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { windSim } from '../scene/ChimeScene'

/**
 * Flowing wind lines streaming horizontally across the viewport (canvas
 * overlay, comic-style with occasional loops).
 *
 * Two layers: a "back" canvas BELOW the WebGL canvas (lines pass behind the
 * chime) and a "front" canvas ABOVE it (lines pass in front). Front lines are
 * fewer and fainter so the chime stays the star. Flow is mostly horizontal
 * with a slight lean from the live wind vector; streams occasionally do a
 * full loop. Opacity is driven by wind strength × gust envelope, eased
 * slowly. No expiry timer — streams live until their whole trail exits.
 */

interface Pt { x: number; y: number }
interface Stream {
  pts: Pt[]
  speed: number
  width: number
  hue: number
  seed: number
  alpha: number
  dirX: number
  dirY: number
  loopLeft: number
  loopDur: number
  loopOmega: number
  nextLoop: number
}

type Layer = 'back' | 'front'

const LAYER_CFG: Record<Layer, { count: number; alpha: number; z: number; widthMul: number }> = {
  back:  { count: 12, alpha: 0.5,  z: 1, widthMul: 1.0 },
  front: { count: 5,  alpha: 0.32, z: 3, widthMul: 0.9 },
}

export function WindLines({ layer = 'front' }: { layer?: Layer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streams = useRef<Stream[]>([])
  const cfg = LAYER_CFG[layer]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let W = 0, H = 0

    const resize = () => {
      const sidebarEl = document.querySelector('.sidebar')
      const sidebarW = sidebarEl ? sidebarEl.getBoundingClientRect().width : 342
      W = Math.max(100, window.innerWidth - sidebarW)
      H = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    /** Base heading: horizontal with a slight lean from the wind vector. */
    const baseDir = (): [number, number] => {
      const leanW = windSim.state.windZ
      const lean = Math.max(-1, Math.min(1, leanW / 3.5)) * 0.45
      const l = Math.hypot(1, lean)
      return [1 / l, lean / l]
    }

    /** Fully formed stream: trail pre-extended up-flow behind the head. */
    const make = (x: number, y: number): Stream => {
      const rand = Math.random
      const [dx, dy] = baseDir()
      const n = 16 + Math.floor(rand() * 12)
      const gap = 7 + rand() * 8
      const dur = 0.9 + rand() * 0.5
      return {
        pts: Array.from({ length: n }, (_, i) => ({
          x: x - dx * i * gap,
          y: y - dy * i * gap,
        })),
        speed: 40 + rand() * 90,
        width: 0.8 + rand() * 1.6,
        hue: 205 + rand() * 25,
        seed: rand() * 100,
        alpha: 0,
        dirX: dx, dirY: dy,
        loopLeft: 0,
        loopDur: dur,
        loopOmega: (Math.PI * 2) / dur * (rand() < 0.5 ? 1 : -1),
        nextLoop: 2 + rand() * 7,
      }
    }

    const respawn = (s: Stream) => {
      const r = Math.random()
      const m = 40
      let x: number, y: number
      if (r < 0.7) { x = -m; y = Math.random() * H }
      else if (r < 0.85) { x = Math.random() * W; y = -m }
      else { x = Math.random() * W; y = H + m }
      const ns = make(x, y)
      s.pts = ns.pts
      s.speed = ns.speed
      s.width = ns.width
      s.hue = ns.hue
      s.seed = ns.seed
      s.dirX = ns.dirX; s.dirY = ns.dirY
      s.loopLeft = 0; s.nextLoop = ns.nextLoop; s.loopDur = ns.loopDur; s.loopOmega = ns.loopOmega
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      const st = useStore.getState()
      const windOn = st.windOn && st.audioArmed && st.config.windStrength > 0.02
      const strength = st.config.windStrength
      const gust = windSim.state.gust
      const vis = windOn ? Math.min(1, strength * (0.35 + 0.65 * gust)) : 0

      ctx.clearRect(0, 0, W, H)

      const targetCount = Math.round(cfg.count * vis)
      while (streams.current.length < targetCount) {
        const r = Math.random()
        const m = 40
        let x = 0, y = 0
        if (r < 0.7) { x = -m; y = Math.random() * H }
        else if (r < 0.85) { x = Math.random() * W; y = -m }
        else { x = Math.random() * W; y = H + m }
        streams.current.push(make(x, y))
      }
      if (streams.current.length > targetCount) {
        for (let i = targetCount; i < streams.current.length; i++) {
          const s = streams.current[i]
          s.alpha += (0 - s.alpha) * Math.min(1, dt * 0.8)
        }
        streams.current = streams.current.filter((s, i) =>
          i < targetCount || s.alpha > 0.015
        )
      }

      const v = (30 + 450 * vis) * dt

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (const s of streams.current) {
        if (s.loopLeft > 0) {
          const ang = s.loopOmega * dt
          const cos = Math.cos(ang), sin = Math.sin(ang)
          const ndx = s.dirX * cos - s.dirY * sin
          const ndy = s.dirX * sin + s.dirY * cos
          s.dirX = ndx; s.dirY = ndy
          s.loopLeft -= dt
        } else {
          const [bx, by] = baseDir()
          const k = Math.min(1, dt * 1.5)
          s.dirX += (bx - s.dirX) * k
          s.dirY += (by - s.dirY) * k
          const l = Math.hypot(s.dirX, s.dirY) || 1
          s.dirX /= l; s.dirY /= l
          s.nextLoop -= dt
          if (s.nextLoop <= 0 && vis > 0.15) {
            s.loopLeft = s.loopDur
            s.nextLoop = 4 + Math.random() * 9
          }
        }

        const head = s.pts[0]
        const sway = Math.sin(now / 1000 * 1.6 + s.seed) * 14 * dt
        head.x += (s.dirX * v * s.speed / 100) + sway * -s.dirY
        head.y += (s.dirY * v * s.speed / 100) + sway * s.dirX
        for (let i = 1; i < s.pts.length; i++) {
          const p = s.pts[i], q = s.pts[i - 1]
          p.x += (q.x - p.x) * Math.min(1, dt * 9)
          p.y += (q.y - p.y) * Math.min(1, dt * 9)
        }

        const tail = s.pts[s.pts.length - 1]
        const gone = tail.x < -240 || tail.x > W + 240 || tail.y < -240 || tail.y > H + 240
        if (gone) {
          respawn(s)
          continue
        }

        // brighter than before: floor raised (0.55 vs 0.35) + stronger gust
        // response so the default setting reads clearly
        const target = cfg.alpha * (0.55 + 0.45 * vis)
        s.alpha += (target - s.alpha) * Math.min(1, dt * 0.8)
        if (s.alpha < 0.012) continue

        ctx.beginPath()
        ctx.moveTo(s.pts[0].x, s.pts[0].y)
        for (let i = 1; i < s.pts.length - 1; i++) {
          const mx = (s.pts[i].x + s.pts[i + 1].x) / 2
          const my = (s.pts[i].y + s.pts[i + 1].y) / 2
          ctx.quadraticCurveTo(s.pts[i].x, s.pts[i].y, mx, my)
        }
        ctx.strokeStyle = `hsla(${s.hue}, 45%, ${72 + 18 * vis}%, ${s.alpha})`
        ctx.lineWidth = s.width * cfg.widthMul * (0.7 + 0.6 * vis)
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [layer, cfg])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        right: '342px',
        pointerEvents: 'none',
        zIndex: cfg.z,
        opacity: 0.92,
        mixBlendMode: 'screen',
      }}
    />
  )
}
