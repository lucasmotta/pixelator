"use client"

import { useRef, useEffect, useCallback } from "react"
import { Plus, Copy, Trash2, Ghost } from "lucide-react"

interface FrameTimelineProps {
  frames: boolean[][][]
  currentFrame: number
  width: number
  height: number
  ghostEnabled: boolean
  onSelectFrame: (index: number) => void
  onAddFrame: () => void
  onDuplicateFrame: () => void
  onDeleteFrame: () => void
  onToggleGhost: () => void
}

function FrameThumbnail({
  pixels,
  width,
  height,
  isActive,
  index,
  onClick,
}: {
  pixels: boolean[][]
  width: number
  height: number
  isActive: boolean
  index: number
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const thumbHeight = 40
  const thumbWidth = Math.round((width / height) * thumbHeight)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = thumbWidth * dpr
    canvas.height = thumbHeight * dpr
    canvas.style.width = `${thumbWidth}px`
    canvas.style.height = `${thumbHeight}px`
    ctx.scale(dpr, dpr)

    // Background
    const cellW = thumbWidth / width
    const cellH = thumbHeight / height

    // Checkerboard
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isLight = (x + y) % 2 === 0
        ctx.fillStyle = isLight ? "#2a2a2a" : "#222222"
        ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5)
      }
    }

    // Pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y]?.[x]) {
          ctx.fillStyle = "#e8e8e8"
          ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5)
        }
      }
    }
  }, [pixels, width, height, thumbWidth])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-1 rounded p-1.5 transition-colors ${
        isActive
          ? "bg-accent"
          : "hover:bg-accent/50"
      }`}
      style={isActive ? { outline: "1px solid rgba(255,255,255,0.4)", outlineOffset: "-1px" } : undefined}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: thumbWidth,
          height: thumbHeight,
          imageRendering: "pixelated",
        }}
      />
      <span className="text-[9px] font-mono text-muted-foreground">
        {index + 1}
      </span>
    </button>
  )
}

export function FrameTimeline({
  frames,
  currentFrame,
  width,
  height,
  ghostEnabled,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onToggleGhost,
}: FrameTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to keep current frame visible when it changes
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeEl = container.children[currentFrame] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
    }
  }, [currentFrame])

  return (
    <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-3">
      {/* Frame thumbnails */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 py-1"
      >
        {frames.map((frame, i) => (
          <FrameThumbnail
            key={i}
            pixels={frame}
            width={width}
            height={height}
            isActive={i === currentFrame}
            index={i}
            onClick={() => onSelectFrame(i)}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onAddFrame}
          className="flex items-center justify-center rounded border border-border bg-secondary p-1.5 text-foreground transition-colors hover:bg-accent"
          title="Add frame"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDuplicateFrame}
          className="flex items-center justify-center rounded border border-border bg-secondary p-1.5 text-foreground transition-colors hover:bg-accent"
          title="Duplicate frame"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDeleteFrame}
          disabled={frames.length <= 1}
          className="flex items-center justify-center rounded border border-border bg-secondary p-1.5 text-foreground transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
          title="Delete frame"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={onToggleGhost}
          className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
            ghostEnabled
              ? "border-foreground/30 bg-foreground/10 text-foreground"
              : "border-border bg-secondary text-muted-foreground hover:bg-accent"
          }`}
          title="Toggle ghost of previous frame"
        >
          <Ghost className="h-3.5 w-3.5" />
          Ghost
        </button>
        <span className="ml-2 text-[10px] font-mono text-muted-foreground">
          {currentFrame + 1}/{frames.length}
        </span>
      </div>
    </div>
  )
}
