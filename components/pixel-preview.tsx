"use client"

import { useRef, useEffect, useCallback } from "react"

interface PixelPreviewProps {
  width: number
  height: number
  pixels: boolean[][]
  scale?: number
}

export function PixelPreview({
  width,
  height,
  pixels,
  scale = 1,
}: PixelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const canvasW = width * scale
    const canvasH = height * scale

    canvas.width = canvasW * dpr
    canvas.height = canvasH * dpr
    canvas.style.width = `${canvasW}px`
    canvas.style.height = `${canvasH}px`
    ctx.scale(dpr, dpr)

    // Transparent background (checkerboard pattern)
    const checkSize = Math.max(scale, 2)
    for (let y = 0; y < canvasH; y += checkSize) {
      for (let x = 0; x < canvasW; x += checkSize) {
        const isLight =
          (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0
        ctx.fillStyle = isLight ? "#2a2a2a" : "#222222"
        ctx.fillRect(x, y, checkSize, checkSize)
      }
    }

    // Draw pixels
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (pixels[py]?.[px]) {
          ctx.fillStyle = "#e8e8e8"
          ctx.fillRect(px * scale, py * scale, scale, scale)
        }
      }
    }
  }, [width, height, pixels, scale])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-border"
      style={{
        width: width * scale,
        height: height * scale,
        imageRendering: "pixelated",
      }}
    />
  )
}
