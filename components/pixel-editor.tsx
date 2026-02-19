"use client"

import { useState, useCallback, useRef } from "react"
import { PixelGrid } from "./pixel-grid"
import { PixelPreview } from "./pixel-preview"
import { Grid3x3, Trash2, Download } from "lucide-react"

function createEmptyGrid(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => Array(w).fill(false))
}

export function PixelEditor() {
  const [width, setWidth] = useState(16)
  const [height, setHeight] = useState(16)
  const [inputWidth, setInputWidth] = useState("16")
  const [inputHeight, setInputHeight] = useState("16")
  const [pixels, setPixels] = useState<boolean[][]>(() =>
    createEmptyGrid(16, 16)
  )
  const [cellSize, setCellSize] = useState(24)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)

  const handleApplySize = useCallback(() => {
    const w = Math.max(1, Math.min(64, parseInt(inputWidth) || 16))
    const h = Math.max(1, Math.min(64, parseInt(inputHeight) || 16))
    setWidth(w)
    setHeight(h)
    setInputWidth(String(w))
    setInputHeight(String(h))

    // Preserve existing pixels where possible
    const newGrid = createEmptyGrid(w, h)
    for (let y = 0; y < Math.min(h, pixels.length); y++) {
      for (let x = 0; x < Math.min(w, pixels[y]?.length ?? 0); x++) {
        newGrid[y][x] = pixels[y][x]
      }
    }
    setPixels(newGrid)
  }, [inputWidth, inputHeight, pixels])

  const handleClear = useCallback(() => {
    setPixels(createEmptyGrid(width, height))
  }, [width, height])

  const handleExport = useCallback(() => {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Transparent background
    ctx.clearRect(0, 0, width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y]?.[x]) {
          ctx.fillStyle = "#e8e8e8"
          ctx.fillRect(x, y, 1, 1)
        }
      }
    }

    const link = document.createElement("a")
    link.download = `pixel-art-${width}x${height}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }, [width, height, pixels])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleApplySize()
      }
    },
    [handleApplySize]
  )

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
        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Click to draw
          </kbd>
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Opt to erase
          </kbd>
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Shift for line
          </kbd>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
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
              <span className="text-xs text-muted-foreground font-mono">
                x
              </span>
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
            <PixelPreview
              width={width}
              height={height}
              pixels={pixels}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 lg:mt-auto">
            <button
              onClick={handleClear}
              className="flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              Export PNG
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
              onPixelsChange={setPixels}
              cellSize={cellSize}
            />
          </div>
        </main>
      </div>

      <canvas ref={exportCanvasRef} className="hidden" />
    </div>
  )
}
