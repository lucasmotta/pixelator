"use client"

import { useCallback, useRef, useEffect, useState } from "react"

interface PixelGridProps {
  width: number
  height: number
  pixels: boolean[][]
  onPixelsChange: (pixels: boolean[][]) => void
  onDrawStart?: () => void
  onDrawEnd?: (pixels: boolean[][]) => void
  cellSize?: number
}

function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): [number, number][] {
  const points: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  let cx = x0
  let cy = y0

  while (true) {
    points.push([cx, cy])
    if (cx === x1 && cy === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      cx += sx
    }
    if (e2 < dx) {
      err += dx
      cy += sy
    }
  }
  return points
}

export function PixelGrid({
  width,
  height,
  pixels,
  onPixelsChange,
  onDrawStart,
  onDrawEnd,
  cellSize = 24,
}: PixelGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const isErasing = useRef(false)
  const isShiftMode = useRef(false)
  const lineStart = useRef<[number, number] | null>(null)
  const [linePreview, setLinePreview] = useState<[number, number][] | null>(
    null
  )
  const lastCell = useRef<[number, number] | null>(null)
  const pixelsRef = useRef(pixels)
  pixelsRef.current = pixels

  const gridLineColor = "rgba(255, 255, 255, 0.06)"
  const filledColor = "#e8e8e8"
  const previewColor = "rgba(232, 232, 232, 0.35)"
  const erasePreviewColor = "rgba(232, 80, 80, 0.35)"

  const drawGrid = useCallback(
    (previewPoints?: [number, number][] | null, erasing?: boolean) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const canvasW = width * cellSize
      const canvasH = height * cellSize

      canvas.width = canvasW * dpr
      canvas.height = canvasH * dpr
      canvas.style.width = `${canvasW}px`
      canvas.style.height = `${canvasH}px`
      ctx.scale(dpr, dpr)

      // Background
      ctx.fillStyle = "#1a1a1a"
      ctx.fillRect(0, 0, canvasW, canvasH)

      // Filled pixels
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pixels[y]?.[x]) {
            ctx.fillStyle = filledColor
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
          }
        }
      }

      // Preview overlay for shift-line
      if (previewPoints && previewPoints.length > 0) {
        for (const [px, py] of previewPoints) {
          if (px >= 0 && px < width && py >= 0 && py < height) {
            if (erasing) {
              // For erase preview, show on filled pixels only
              if (pixels[py]?.[px]) {
                ctx.fillStyle = erasePreviewColor
                ctx.fillRect(px * cellSize, py * cellSize, cellSize, cellSize)
              }
            } else {
              // For draw preview, show on empty pixels only
              if (!pixels[py]?.[px]) {
                ctx.fillStyle = previewColor
                ctx.fillRect(px * cellSize, py * cellSize, cellSize, cellSize)
              }
            }
          }
        }
      }

      // Grid lines
      ctx.strokeStyle = gridLineColor
      ctx.lineWidth = 1
      for (let x = 0; x <= width; x++) {
        ctx.beginPath()
        ctx.moveTo(x * cellSize + 0.5, 0)
        ctx.lineTo(x * cellSize + 0.5, canvasH)
        ctx.stroke()
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * cellSize + 0.5)
        ctx.lineTo(canvasW, y * cellSize + 0.5)
        ctx.stroke()
      }
    },
    [width, height, pixels, cellSize]
  )

  useEffect(() => {
    drawGrid(linePreview, isErasing.current)
  }, [drawGrid, linePreview])

  const getCellFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((e.clientX - rect.left) / cellSize)
      const y = Math.floor((e.clientY - rect.top) / cellSize)
      if (x < 0 || x >= width || y < 0 || y >= height) return null
      return [x, y]
    },
    [cellSize, width, height]
  )

  const setPixel = useCallback(
    (x: number, y: number, value: boolean) => {
      const next = pixels.map((row) => [...row])
      if (next[y]?.[x] !== undefined) {
        next[y][x] = value
        onPixelsChange(next)
      }
    },
    [pixels, onPixelsChange]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const cell = getCellFromEvent(e)
      if (!cell) return

      onDrawStart?.()

      const erasing = e.altKey
      isErasing.current = erasing

      if (e.shiftKey) {
        isShiftMode.current = true
        lineStart.current = cell
        setLinePreview([cell])
        isDrawing.current = true
        return
      }

      isShiftMode.current = false
      isDrawing.current = true
      lastCell.current = cell
      setPixel(cell[0], cell[1], !erasing)
    },
    [getCellFromEvent, setPixel, onDrawStart]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current) return
      const cell = getCellFromEvent(e)
      if (!cell) return

      if (isShiftMode.current && lineStart.current) {
        const points = bresenhamLine(
          lineStart.current[0],
          lineStart.current[1],
          cell[0],
          cell[1]
        )
        setLinePreview(points)
        return
      }

      // Freehand: interpolate between last and current
      if (lastCell.current) {
        const points = bresenhamLine(
          lastCell.current[0],
          lastCell.current[1],
          cell[0],
          cell[1]
        )
        const erasing = isErasing.current
        const next = pixels.map((row) => [...row])
        for (const [px, py] of points) {
          if (px >= 0 && px < width && py >= 0 && py < height) {
            next[py][px] = !erasing
          }
        }
        onPixelsChange(next)
      }
      lastCell.current = cell
    },
    [getCellFromEvent, pixels, onPixelsChange, width, height]
  )

  const handleMouseUp = useCallback(() => {
    if (isShiftMode.current && lineStart.current && linePreview) {
      const value = !isErasing.current
      const next = pixelsRef.current.map((row) => [...row])
      for (const [x, y] of linePreview) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          next[y][x] = value
        }
      }
      onPixelsChange(next)
      setLinePreview(null)
      lineStart.current = null
      onDrawEnd?.(next)
    } else if (isDrawing.current) {
      onDrawEnd?.(pixelsRef.current)
    }
    isDrawing.current = false
    isShiftMode.current = false
    lastCell.current = null
  }, [linePreview, onPixelsChange, onDrawEnd, width, height])

  // Listen for global mouseup to handle release outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDrawing.current) {
        handleMouseUp()
      }
    }
    window.addEventListener("mouseup", handleGlobalMouseUp)
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp)
  }, [handleMouseUp])

  return (
    <canvas
      ref={canvasRef}
      className="cursor-crosshair"
      style={{
        width: width * cellSize,
        height: height * cellSize,
        imageRendering: "pixelated",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
