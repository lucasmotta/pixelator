"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { PixelGrid } from "./pixel-grid"
import { PixelPreview } from "./pixel-preview"
import { FrameTimeline } from "./frame-timeline"
import { Grid3x3, Trash2, Download, Undo2, Redo2, Code } from "lucide-react"

const STORAGE_KEY = "pixel-editor-settings"
const MAX_HISTORY = 100

function createEmptyGrid(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => Array(w).fill(false))
}

function loadSettings(): { width: number; height: number; cellSize: number } {
  if (typeof window === "undefined") return { width: 16, height: 16, cellSize: 24 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        width: Math.max(1, Math.min(64, parsed.width ?? 16)),
        height: Math.max(1, Math.min(64, parsed.height ?? 16)),
        cellSize: Math.max(8, Math.min(48, parsed.cellSize ?? 24)),
      }
    }
  } catch {}
  return { width: 16, height: 16, cellSize: 24 }
}

function saveSettings(width: number, height: number, cellSize: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, height, cellSize }))
  } catch {}
}

function framesEqual(a: boolean[][][], b: boolean[][][]): boolean {
  if (a.length !== b.length) return false
  for (let f = 0; f < a.length; f++) {
    if (a[f].length !== b[f].length) return false
    for (let y = 0; y < a[f].length; y++) {
      if (a[f][y].length !== b[f][y].length) return false
      for (let x = 0; x < a[f][y].length; x++) {
        if (a[f][y][x] !== b[f][y][x]) return false
      }
    }
  }
  return true
}

function cloneFrames(frames: boolean[][][]): boolean[][][] {
  return frames.map((frame) => frame.map((row) => [...row]))
}

function generateCssGradientForFrame(
  width: number,
  height: number,
  pixels: boolean[][]
): { bgImages: string[]; bgPositions: string[]; bgSizes: string[] } {
  const bgImages: string[] = []
  const bgPositions: string[] = []
  const bgSizes: string[] = []

  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const filled = pixels[y]?.[x] ?? false
      const startX = x
      while (x < width && (pixels[y]?.[x] ?? false) === filled) {
        x++
      }
      if (filled) {
        bgImages.push(
          `linear-gradient(to right, transparent ${startX}px, var(--pixel-color) ${startX}px, var(--pixel-color) ${x}px, transparent ${x}px)`
        )
        bgPositions.push(`0 ${y}px`)
        bgSizes.push(`${width}px 1px`)
      }
    }
  }

  return { bgImages, bgPositions, bgSizes }
}

function generateSingleFrameCSS(width: number, height: number, pixels: boolean[][]): string {
  const { bgImages, bgPositions, bgSizes } = generateCssGradientForFrame(width, height, pixels)

  if (bgImages.length === 0) return "/* Empty canvas -- no filled pixels */"

  return [
    `--pixel-color: currentColor;`,
    `width: ${width}px;`,
    `height: ${height}px;`,
    `background-image:`,
    `  ${bgImages.join(",\n  ")};`,
    `background-position:`,
    `  ${bgPositions.join(",\n  ")};`,
    `background-size:`,
    `  ${bgSizes.join(",\n  ")};`,
    `background-repeat: no-repeat;`,
  ].join("\n")
}

function generateAnimatedCSS(width: number, height: number, frames: boolean[][][]): string {
  const n = frames.length

  const keyframeBlocks: string[] = []
  for (let i = 0; i < n; i++) {
    const pct = ((i / n) * 100).toFixed(4)
    const { bgImages, bgPositions, bgSizes } = generateCssGradientForFrame(width, height, frames[i])

    if (bgImages.length === 0) {
      keyframeBlocks.push(
        `  ${pct}% {\n    background-image: none;\n  }`
      )
    } else {
      keyframeBlocks.push(
        [
          `  ${pct}% {`,
          `    background-image:`,
          `      ${bgImages.join(",\n      ")};`,
          `    background-position:`,
          `      ${bgPositions.join(",\n      ")};`,
          `    background-size:`,
          `      ${bgSizes.join(",\n      ")};`,
          `  }`,
        ].join("\n")
      )
    }
  }

  return [
    `--pixel-color: currentColor;`,
    `--animation-speed: 200ms;`,
    `width: ${width}px;`,
    `height: ${height}px;`,
    `background-repeat: no-repeat;`,
    `animation: pixel-animation calc(var(--animation-speed) * ${n}) steps(${n}) infinite;`,
    ``,
    `@keyframes pixel-animation {`,
    ...keyframeBlocks,
    `}`,
  ].join("\n")
}

export function PixelEditor() {
  const [mounted, setMounted] = useState(false)
  const [width, setWidth] = useState(16)
  const [height, setHeight] = useState(16)
  const [inputWidth, setInputWidth] = useState("16")
  const [inputHeight, setInputHeight] = useState("16")
  const [cellSize, setCellSize] = useState(24)

  // Frames
  const [frames, setFrames] = useState<boolean[][][]>(() => [createEmptyGrid(16, 16)])
  const [currentFrame, setCurrentFrame] = useState(0)
  const [ghostEnabled, setGhostEnabled] = useState(true)

  // Undo / Redo — tracks { frames, currentFrame } snapshots
  const historyRef = useRef<{ frames: boolean[][][]; currentFrame: number }[]>([])
  const historyIndexRef = useRef(-1)
  const batchingRef = useRef(false)

  const [copiedCSS, setCopiedCSS] = useState(false)

  // Initialize from localStorage after mount
  useEffect(() => {
    const s = loadSettings()
    setWidth(s.width)
    setHeight(s.height)
    setInputWidth(String(s.width))
    setInputHeight(String(s.height))
    setCellSize(s.cellSize)
    const initialFrames = [createEmptyGrid(s.width, s.height)]
    setFrames(initialFrames)
    setCurrentFrame(0)
    historyRef.current = [{ frames: initialFrames, currentFrame: 0 }]
    historyIndexRef.current = 0
    setMounted(true)
  }, [])

  // Persist settings
  useEffect(() => {
    if (mounted) saveSettings(width, height, cellSize)
  }, [width, height, cellSize, mounted])

  const pushHistory = useCallback((newFrames: boolean[][][], newCurrentFrame: number) => {
    const idx = historyIndexRef.current
    const current = historyRef.current[idx]
    if (current && framesEqual(current.frames, newFrames) && current.currentFrame === newCurrentFrame) return

    historyRef.current = historyRef.current.slice(0, idx + 1)
    historyRef.current.push({ frames: cloneFrames(newFrames), currentFrame: newCurrentFrame })
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    }
    historyIndexRef.current = historyRef.current.length - 1
  }, [])

  // Derive current pixels
  const pixels = frames[currentFrame] ?? createEmptyGrid(width, height)
  const ghostPixels = ghostEnabled && currentFrame > 0 ? frames[currentFrame - 1] : null

  const handlePixelsChange = useCallback(
    (next: boolean[][]) => {
      setFrames((prev) => {
        const updated = [...prev]
        updated[currentFrame] = next
        if (!batchingRef.current) {
          pushHistory(updated, currentFrame)
        }
        return updated
      })
    },
    [currentFrame, pushHistory]
  )

  const handleDrawStart = useCallback(() => {
    batchingRef.current = true
  }, [])

  const handleDrawEnd = useCallback(
    (finalPixels: boolean[][]) => {
      batchingRef.current = false
      setFrames((prev) => {
        const updated = [...prev]
        updated[currentFrame] = finalPixels
        pushHistory(updated, currentFrame)
        return updated
      })
    },
    [currentFrame, pushHistory]
  )

  const undo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx > 0) {
      historyIndexRef.current = idx - 1
      const snapshot = historyRef.current[idx - 1]
      setFrames(cloneFrames(snapshot.frames))
      setCurrentFrame(snapshot.currentFrame)
    }
  }, [])

  const redo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx < historyRef.current.length - 1) {
      historyIndexRef.current = idx + 1
      const snapshot = historyRef.current[idx + 1]
      setFrames(cloneFrames(snapshot.frames))
      setCurrentFrame(snapshot.currentFrame)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === "z" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        undo()
      }
      if (e.key === "y" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo])

  const handleApplySize = useCallback(() => {
    const w = Math.max(1, Math.min(64, parseInt(inputWidth) || 16))
    const h = Math.max(1, Math.min(64, parseInt(inputHeight) || 16))
    setWidth(w)
    setHeight(h)
    setInputWidth(String(w))
    setInputHeight(String(h))

    setFrames((prev) => {
      const newFrames = prev.map((frame) => {
        const newGrid = createEmptyGrid(w, h)
        for (let y = 0; y < Math.min(h, frame.length); y++) {
          for (let x = 0; x < Math.min(w, frame[y]?.length ?? 0); x++) {
            newGrid[y][x] = frame[y][x]
          }
        }
        return newGrid
      })
      pushHistory(newFrames, currentFrame)
      return newFrames
    })
  }, [inputWidth, inputHeight, pushHistory, currentFrame])

  const handleClear = useCallback(() => {
    setFrames((prev) => {
      const updated = [...prev]
      updated[currentFrame] = createEmptyGrid(width, height)
      pushHistory(updated, currentFrame)
      return updated
    })
  }, [width, height, currentFrame, pushHistory])

  // Frame operations
  const handleAddFrame = useCallback(() => {
    setFrames((prev) => {
      const newFrames = [...prev]
      newFrames.splice(currentFrame + 1, 0, createEmptyGrid(width, height))
      const newCurrent = currentFrame + 1
      setCurrentFrame(newCurrent)
      pushHistory(newFrames, newCurrent)
      return newFrames
    })
  }, [currentFrame, width, height, pushHistory])

  const handleDuplicateFrame = useCallback(() => {
    setFrames((prev) => {
      const newFrames = [...prev]
      const copy = prev[currentFrame].map((row) => [...row])
      newFrames.splice(currentFrame + 1, 0, copy)
      const newCurrent = currentFrame + 1
      setCurrentFrame(newCurrent)
      pushHistory(newFrames, newCurrent)
      return newFrames
    })
  }, [currentFrame, pushHistory])

  const handleDeleteFrame = useCallback(() => {
    if (frames.length <= 1) return
    setFrames((prev) => {
      const newFrames = prev.filter((_, i) => i !== currentFrame)
      const newCurrent = Math.min(currentFrame, newFrames.length - 1)
      setCurrentFrame(newCurrent)
      pushHistory(newFrames, newCurrent)
      return newFrames
    })
  }, [currentFrame, frames.length, pushHistory])

  const handleSelectFrame = useCallback((index: number) => {
    setCurrentFrame(index)
  }, [])

  const handleToggleGhost = useCallback(() => {
    setGhostEnabled((prev) => !prev)
  }, [])

  const handleExport = useCallback(() => {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y]?.[x]) {
          ctx.fillStyle = "#000000"
          ctx.fillRect(x, y, 1, 1)
        }
      }
    }

    const link = document.createElement("a")
    link.download = `pixel-art-${width}x${height}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }, [width, height, pixels])

  const handleExportCSS = useCallback(() => {
    const css =
      frames.length === 1
        ? generateSingleFrameCSS(width, height, frames[0])
        : generateAnimatedCSS(width, height, frames)
    navigator.clipboard.writeText(css).then(() => {
      setCopiedCSS(true)
      setTimeout(() => setCopiedCSS(false), 2000)
    })
  }, [width, height, frames])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleApplySize()
    },
    [handleApplySize]
  )

  if (!mounted) return null

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Grid3x3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-sm font-semibold tracking-tight font-mono">
            Pixel Editor
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="flex items-center justify-center rounded border border-border bg-secondary p-1.5 text-foreground transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              title="Undo (Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="flex items-center justify-center rounded border border-border bg-secondary p-1.5 text-foreground transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              title="Redo (Y)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              Opt: erase
            </kbd>
            <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              Shift: line
            </kbd>
            <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              Z / Y: undo/redo
            </kbd>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="flex flex-row lg:flex-col items-start gap-6 border-b lg:border-b-0 lg:border-r border-border p-5 lg:w-60 flex-shrink-0">
          {/* Canvas Size */}
          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Canvas Size
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={64}
                value={inputWidth}
                onChange={(e) => setInputWidth(e.target.value)}
                onBlur={handleApplySize}
                onKeyDown={handleKeyDown}
                className="h-8 w-16 rounded border border-border bg-secondary px-2 text-center text-sm font-mono text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground font-mono">x</span>
              <input
                type="number"
                min={1}
                max={64}
                value={inputHeight}
                onChange={(e) => setInputHeight(e.target.value)}
                onBlur={handleApplySize}
                onKeyDown={handleKeyDown}
                className="h-8 w-16 rounded border border-border bg-secondary px-2 text-center text-sm font-mono text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Zoom */}
          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Zoom
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={8}
                max={48}
                step={2}
                value={cellSize}
                onChange={(e) => setCellSize(parseInt(e.target.value))}
                className="w-28 accent-foreground"
              />
              <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                {cellSize}px
              </span>
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Preview ({width}x{height})
            </label>
            <PixelPreview width={width} height={height} pixels={pixels} />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 lg:mt-auto">
            <button
              onClick={handleClear}
              className="flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Frame
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              Export PNG
            </button>
            <button
              onClick={handleExportCSS}
              className="flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Code className="h-3.5 w-3.5" />
              {copiedCSS ? "Copied!" : frames.length > 1 ? "Copy Animated CSS" : "Copy CSS"}
            </button>
          </div>
        </aside>

        {/* Canvas Area */}
        <main className="flex flex-1 items-center justify-center overflow-auto p-8">
          <div className="inline-block border border-border bg-card shadow-lg shadow-black/30">
            <PixelGrid
              width={width}
              height={height}
              pixels={pixels}
              ghostPixels={ghostPixels}
              onPixelsChange={handlePixelsChange}
              onDrawStart={handleDrawStart}
              onDrawEnd={handleDrawEnd}
              cellSize={cellSize}
            />
          </div>
        </main>
      </div>

      {/* Timeline */}
      <FrameTimeline
        frames={frames}
        currentFrame={currentFrame}
        width={width}
        height={height}
        ghostEnabled={ghostEnabled}
        onSelectFrame={handleSelectFrame}
        onAddFrame={handleAddFrame}
        onDuplicateFrame={handleDuplicateFrame}
        onDeleteFrame={handleDeleteFrame}
        onToggleGhost={handleToggleGhost}
      />
    </div>
  )
}
