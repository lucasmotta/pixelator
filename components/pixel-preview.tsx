"use client"

import { useRef, useEffect, useCallback, useState } from "react"

interface PixelPreviewProps {
  width: number
  height: number
  frames: boolean[][][]
  fps?: number
}

export function PixelPreview({
  width,
  height,
  frames,
  fps = 5,
}: PixelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [animFrame, setAnimFrame] = useState(0)

  // Cycle through frames when there are multiple
  useEffect(() => {
    if (frames.length <= 1) {
      setAnimFrame(0)
      return
    }
    const interval = setInterval(() => {
      setAnimFrame((prev) => (prev + 1) % frames.length)
    }, 1000 / fps)
    return () => clearInterval(interval)
  }, [frames.length, fps])

  // Reset if animFrame is out of range
  const safeFrame = animFrame < frames.length ? animFrame : 0
  const pixels = frames[safeFrame] ?? []

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    // Checkerboard background
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isLight = (x + y) % 2 === 0
        ctx.fillStyle = isLight ? "#2a2a2a" : "#222222"
        ctx.fillRect(x, y, 1, 1)
      }
    }

    // Draw pixels
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (pixels[py]?.[px]) {
          ctx.fillStyle = "#e8e8e8"
          ctx.fillRect(px, py, 1, 1)
        }
      }
    }
  }, [width, height, pixels])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="outline outline-1 outline-border"
      style={{
        width,
        height,
        imageRendering: "pixelated",
      }}
    />
  )
}
