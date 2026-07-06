import { useEffect, useRef } from 'react'
import bgJpg      from './assets/techfest-landing-bg.jpg'
import buildBack  from './assets/techfest-buildings-back.png'
import buildFront from './assets/techfest-buildings-front.png'
import shadow     from './assets/techfest-shadow.svg'
import car        from './assets/techfest-car.png'
import './CityBg.css'

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function CanvasBackground({ variant }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false }
    const state = { width: 0, height: 0, pixelRatio: 1, items: [], lanes: [], lastTime: performance.now() }
    let frameId = 0

    const createStar = (anywhere = false) => ({
      x: anywhere ? randomBetween(-state.width, state.width) : randomBetween(-80, 80),
      y: anywhere ? randomBetween(-state.height, state.height) : randomBetween(-80, 80),
      z: anywhere ? randomBetween(0.08, 1) : 1,
      speed: randomBetween(0.12, 0.8),
      hue: Math.random() > 0.55 ? 190 : 260,
    })

    const createSpark = () => ({
      angle: randomBetween(0, Math.PI * 2),
      radius: randomBetween(20, Math.max(state.width, state.height) * 0.48),
      speed: randomBetween(0.6, 2.6),
      size: randomBetween(0.6, 2.5),
      hue: Math.random() > 0.5 ? 184 : 285,
    })

    const createParticle = (anywhere = false) => {
      const cx = state.width * 0.66
      const cy = state.height * 0.48
      const angle = randomBetween(0, Math.PI * 2)
      const radius = randomBetween(20, Math.min(state.width, state.height) * 0.33)
      return {
        x: anywhere ? Math.random() * state.width : cx + Math.cos(angle) * radius,
        y: anywhere ? Math.random() * state.height : cy + Math.sin(angle) * radius,
        homeX: cx + Math.cos(angle) * radius,
        homeY: cy + Math.sin(angle) * radius * 0.72,
        vx: randomBetween(-0.18, 0.18),
        vy: randomBetween(-0.18, 0.18),
        size: randomBetween(0.8, 2.6),
        hue: Math.random() > 0.72 ? 0 : randomBetween(178, 188),
        phase: randomBetween(0, Math.PI * 2),
      }
    }

    const resize = () => {
      state.pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      state.width = window.innerWidth
      state.height = window.innerHeight
      canvas.width = Math.floor(state.width * state.pixelRatio)
      canvas.height = Math.floor(state.height * state.pixelRatio)
      canvas.style.width = `${state.width}px`
      canvas.style.height = `${state.height}px`
      ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0)

      if (variant === 'hyperspace') {
        const count = Math.min(520, Math.max(220, Math.floor((state.width * state.height) / 3000)))
        state.items = Array.from({ length: count }, () => createStar(true))
        state.lanes = Array.from({ length: 18 }, (_, index) => ({
          offset: index / 18,
          speed: randomBetween(0.18, 0.48),
          hue: index % 2 ? 188 : 274,
        }))
      } else if (variant === 'warp') {
        state.items = Array.from({ length: 180 }, () => createSpark())
      } else {
        const count = Math.min(520, Math.max(220, Math.floor((state.width * state.height) / 3100)))
        state.items = Array.from({ length: count }, () => createParticle(true))
      }
    }

    const drawHyperspace = (time, delta) => {
      const cx = state.width / 2
      const cy = state.height / 2
      const maxRadius = Math.hypot(state.width, state.height)

      ctx.fillStyle = 'rgba(1, 3, 10, 0.5)'
      ctx.fillRect(0, 0, state.width, state.height)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.globalCompositeOperation = 'screen'

      for (const lane of state.lanes) {
        const angle = lane.offset * Math.PI * 2 + time * lane.speed * 0.0003
        const x = Math.cos(angle) * maxRadius
        const y = Math.sin(angle) * maxRadius
        const gradient = ctx.createLinearGradient(0, 0, x, y)
        gradient.addColorStop(0, `hsla(${lane.hue}, 100%, 68%, 0.72)`)
        gradient.addColorStop(0.35, `hsla(${lane.hue}, 100%, 68%, 0.18)`)
        gradient.addColorStop(1, `hsla(${lane.hue}, 100%, 68%, 0)`)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      for (const star of state.items) {
        star.z -= delta * star.speed * 0.42
        if (star.z <= 0.025) Object.assign(star, createStar(false))
        const scale = 1 / star.z
        const oldScale = 1 / (star.z + delta * star.speed * 1.6)
        const alpha = Math.min(1, (1 - star.z) * 1.2)
        ctx.strokeStyle = `hsla(${star.hue}, 100%, 72%, ${alpha})`
        ctx.lineWidth = Math.max(0.5, (1 - star.z) * 2.2)
        ctx.beginPath()
        ctx.moveTo(star.x * oldScale, star.y * oldScale)
        ctx.lineTo(star.x * scale, star.y * scale)
        ctx.stroke()
      }

      ctx.restore()
    }

    const drawWarp = (time, delta) => {
      const cx = state.width / 2
      const cy = state.height / 2
      const radius = Math.min(state.width, state.height) * 0.26

      ctx.fillStyle = 'rgba(2, 3, 10, 0.38)'
      ctx.fillRect(0, 0, state.width, state.height)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.globalCompositeOperation = 'screen'

      for (let i = 0; i < 9; i += 1) {
        const spin = time * 0.00018 * (i % 2 ? -1 : 1)
        ctx.rotate(spin)
        ctx.beginPath()
        ctx.ellipse(0, 0, radius + i * 16, radius * 0.68 + i * 11, spin, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${184 + i * 10}, 100%, 64%, ${0.18 - i * 0.012})`
        ctx.lineWidth = 2
        ctx.stroke()
      }

      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.25)
      core.addColorStop(0, 'rgba(255, 255, 255, 0.92)')
      core.addColorStop(0.16, 'rgba(0, 247, 255, 0.42)')
      core.addColorStop(0.58, 'rgba(108, 54, 226, 0.2)')
      core.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2)
      ctx.fill()

      for (const spark of state.items) {
        spark.radius -= spark.speed * 55 * delta
        spark.angle += delta * spark.speed * 0.8
        if (spark.radius < 6) Object.assign(spark, createSpark())
        const x = Math.cos(spark.angle) * spark.radius
        const y = Math.sin(spark.angle) * spark.radius * 0.68
        ctx.fillStyle = `hsla(${spark.hue}, 100%, 72%, ${1 - spark.radius / (Math.max(state.width, state.height) * 0.5)})`
        ctx.beginPath()
        ctx.arc(x, y, spark.size, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    const drawCognizance = (time, delta) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.fillRect(0, 0, state.width, state.height)

      const glow = ctx.createRadialGradient(state.width * 0.66, state.height * 0.48, 20, state.width * 0.66, state.height * 0.48, Math.max(state.width, state.height) * 0.58)
      glow.addColorStop(0, 'rgba(47, 252, 254, 0.15)')
      glow.addColorStop(0.36, 'rgba(70, 36, 158, 0.15)')
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, state.width, state.height)

      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.strokeStyle = 'rgba(47, 252, 254, 0.12)'
      const step = 50
      const drift = (time * 0.012) % step
      for (let x = -step + drift; x < state.width + step; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, state.height)
        ctx.stroke()
      }
      for (let y = -step + drift; y < state.height + step; y += step) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(state.width, y)
        ctx.stroke()
      }
      ctx.restore()

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (const particle of state.items) {
        const targetX = particle.homeX + Math.sin(time * 0.001 + particle.phase) * 34
        const targetY = particle.homeY + Math.cos(time * 0.0014 + particle.phase) * 22
        particle.x += (targetX - particle.x) * 0.018 + particle.vx
        particle.y += (targetY - particle.y) * 0.018 + particle.vy

        const dx = particle.x - pointer.x
        const dy = particle.y - pointer.y
        const distance = Math.hypot(dx, dy)
        if (pointer.active && distance < 150) {
          const force = (1 - distance / 150) ** 2
          const angle = Math.atan2(dy, dx)
          particle.x += Math.cos(angle) * force * 90 * delta
          particle.y += Math.sin(angle) * force * 90 * delta
        }

        const pulse = Math.sin(time * 0.003 + particle.phase) * 0.32 + 0.68
        const alpha = particle.hue === 0 ? 0.82 : 0.48 + pulse * 0.36
        ctx.fillStyle = particle.hue === 0 ? `rgba(255, 255, 255, ${alpha})` : `hsla(${particle.hue}, 98%, 64%, ${alpha})`
        ctx.shadowColor = particle.hue === 0 ? '#ffffff' : '#2ffcfe'
        ctx.shadowBlur = particle.hue === 0 ? 8 : 14
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size * pulse, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    const animate = (time) => {
      const delta = Math.min((time - state.lastTime) / 1000, 0.033)
      state.lastTime = time
      if (variant === 'hyperspace') drawHyperspace(time, delta)
      else if (variant === 'warp') drawWarp(time, delta)
      else drawCognizance(time, delta)
      frameId = requestAnimationFrame(animate)
    }

    const handlePointerMove = event => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
    }

    const handlePointerLeave = () => {
      pointer.active = false
    }

    resize()
    frameId = requestAnimationFrame(animate)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [variant])

  return <canvas className="city-canvas" ref={canvasRef} />
}

export default function CityBg({ variant = 'techfest' }) {
  if (variant !== 'techfest') {
    return (
      <div className={`city-bg city-bg-${variant}`} aria-hidden="true">
        <CanvasBackground variant={variant} />
      </div>
    )
  }

  return (
    <div className="city-bg" aria-hidden="true">
      <div className="city-sky" style={{ backgroundImage: `url(${bgJpg})` }} />
      <div className="city-layer city-back"   style={{ backgroundImage: `url(${buildBack})`  }} />
      <div className="city-layer city-front"  style={{ backgroundImage: `url(${buildFront})` }} />
      <div className="city-layer city-shadow" style={{ backgroundImage: `url(${shadow})`     }} />
      <div className="city-path" />
      <div className="city-car"><img src={car} alt="" /></div>
    </div>
  )
}
