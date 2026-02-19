"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { PixelGrid } from "./pixel-grid"
import { PixelPreview } from "./pixel-preview"
import { FrameTimeline } from "./frame-timeline"
import { Undo2, Redo2, Save, FolderOpen, Share2, X, Check, Trash2 } from "lucide-react"

const STORAGE_KEY = "pixel-editor-settings"
const SAVES_KEY = "pixel-editor-saves"
const MAX_HISTORY = 100

interface SavedAnimation {
  name: string
  width: number
  height: number
  frames: boolean[][][]
  fps: number
  savedAt: number
}

function loadSavedAnimations(): SavedAnimation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(SAVES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function persistSavedAnimations(saves: SavedAnimation[]) {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(saves))
  } catch {}
}

function encodeAnimationToHash(anim: { width: number; height: number; frames: boolean[][][]; fps: number }): string {
  // Pack frames as bitstring, then base64
  const { width, height, frames, fps } = anim
  const header = `${width},${height},${fps},${frames.length}`
  const bits: number[] = []
  for (const frame of frames) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bits.push(frame[y]?.[x] ? 1 : 0)
      }
    }
  }
  // Pack bits into bytes
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8 && i + j < bits.length; j++) {
      byte |= bits[i + j] << (7 - j)
    }
    bytes.push(byte)
  }
  const binaryStr = String.fromCharCode(...bytes)
  const b64 = btoa(binaryStr)
  return `${header}|${b64}`
}

function decodeAnimationFromHash(hash: string): { width: number; height: number; frames: boolean[][][]; fps: number } | null {
  try {
    const [header, b64] = hash.split("|")
    if (!header || !b64) return null
    const [w, h, f, n] = header.split(",").map(Number)
    if (!w || !h || !f || !n) return null
    const width = Math.min(64, Math.max(1, w))
    const height = Math.min(64, Math.max(1, h))
    const fps = Math.min(24, Math.max(1, f))
    const numFrames = Math.min(64, Math.max(1, n))

    const binaryStr = atob(b64)
    const bytes = Array.from(binaryStr, (ch) => ch.charCodeAt(0))
    const bits: number[] = []
    for (const byte of bytes) {
      for (let j = 7; j >= 0; j--) {
        bits.push((byte >> j) & 1)
      }
    }

    const frames: boolean[][][] = []
    let idx = 0
    for (let fi = 0; fi < numFrames; fi++) {
      const frame: boolean[][] = []
      for (let y = 0; y < height; y++) {
        const row: boolean[] = []
        for (let x = 0; x < width; x++) {
          row.push(bits[idx] === 1)
          idx++
        }
        frame.push(row)
      }
      frames.push(frame)
    }

    return { width, height, frames, fps }
  } catch {
    return null
  }
}

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

  if (bgImages.length === 0) return ".pixelated {\n  /* Empty canvas -- no filled pixels */\n}"

  const lines = [
    `.pixelated {`,
    `  --pixel-color: currentColor;`,
    `  width: ${width}px;`,
    `  height: ${height}px;`,
    `  background-image:`,
    `    ${bgImages.join(",\n    ")};`,
    `  background-position:`,
    `    ${bgPositions.join(",\n    ")};`,
    `  background-size:`,
    `    ${bgSizes.join(",\n    ")};`,
    `  background-repeat: no-repeat;`,
    `}`,
  ]
  return lines.join("\n")
}

function generateAnimatedCSS(width: number, height: number, frames: boolean[][][], fps: number = 5): string {
  // Spritesheet approach: lay all frames out side by side in a wide canvas,
  // then animate background-position to shift one frame-width at a time.
  const n = frames.length
  const frameDuration = Math.round(1000 / fps)
  const totalWidth = width * n

  // Collect all gradients across frames, offset each frame by (i * width)px horizontally
  const allBgImages: string[] = []
  const allBgPositions: string[] = []
  const allBgSizes: string[] = []

  for (let i = 0; i < n; i++) {
    const offsetX = i * width
    const { bgImages, bgPositions, bgSizes } = generateCssGradientForFrame(width, height, frames[i])

    for (let j = 0; j < bgImages.length; j++) {
      allBgImages.push(bgImages[j])
      // Parse original position "0 Ypx" and add frame offset to x
      const origPos = bgPositions[j] // "0 Ypx"
      const parts = origPos.split(" ")
      const xVal = parseInt(parts[0]) + offsetX
      allBgPositions.push(`${xVal}px ${parts[1]}`)
      allBgSizes.push(bgSizes[j])
    }
  }

  if (allBgImages.length === 0) return ".pixelated {\n  /* Empty canvas -- no filled pixels */\n}"

  const lines = [
    `.pixelated {`,
    `  --pixel-color: currentColor;`,
    `  --animation-speed: ${frameDuration}ms;`,
    `  width: ${width}px;`,
    `  height: ${height}px;`,
    `  overflow: hidden;`,
    `  background-image:`,
    `    ${allBgImages.join(",\n    ")};`,
    `  background-position:`,
    `    ${allBgPositions.join(",\n    ")};`,
    `  background-size:`,
    `    ${allBgSizes.join(",\n    ")};`,
    `  background-repeat: no-repeat;`,
    `  animation: pixel-animation calc(var(--animation-speed) * ${n}) steps(${n}) infinite;`,
    `}`,
    ``,
    `@keyframes pixel-animation {`,
    `  from {`,
    `    background-position:`,
    `      ${allBgPositions.join(",\n      ")};`,
    `  }`,
    `  to {`,
    `    background-position:`,
    `      ${allBgPositions.map((pos) => {
          const parts = pos.split(" ")
          const xVal = parseInt(parts[0]) - totalWidth
          return `${xVal}px ${parts[1]}`
        }).join(",\n      ")};`,
    `  }`,
    `}`,
  ]
  return lines.join("\n")
}

function generateSVG(width: number, height: number, frames: boolean[][][], fps: number): string {
  const n = frames.length
  const dur = (n / fps).toFixed(3)

  // Build pattern map: patternString → list of {x, y}
  const patternMap = new Map<string, Array<{ x: number; y: number }>>()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pattern = frames.map(f => (f[y]?.[x] ? '1' : '0')).join('')
      if (pattern === '0'.repeat(n)) continue // never active
      if (!patternMap.has(pattern)) patternMap.set(pattern, [])
      patternMap.get(pattern)!.push({ x, y })
    }
  }

  const groups: string[] = []
  for (const [pattern, pixels] of patternMap) {
    // Run-length encode per row
    const byRow = new Map<number, Array<{ startX: number; endX: number }>>()
    pixels.sort((a, b) => a.y - b.y || a.x - b.x)
    for (const { x, y } of pixels) {
      if (!byRow.has(y)) byRow.set(y, [])
      const row = byRow.get(y)!
      const last = row[row.length - 1]
      if (last && last.endX === x) {
        last.endX = x + 1
      } else {
        row.push({ startX: x, endX: x + 1 })
      }
    }
    const rects = Array.from(byRow.entries())
      .flatMap(([y, runs]) =>
        runs.map(({ startX, endX }) =>
          `    <rect x="${startX}" y="${y}" width="${endX - startX}" height="1"/>`
        )
      )
      .join('\n')

    const alwaysOn = pattern === '1'.repeat(n)
    const initialOpacity = pattern[0] === '1' ? '1' : '0'
    const animEl = alwaysOn
      ? ''
      : `\n    <animate attributeName="opacity" values="${pattern.split('').join(';')}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`

    groups.push(
      `  <g fill="currentColor" opacity="${initialOpacity}">\n${rects}${animEl}\n  </g>`
    )
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    ...groups,
    `</svg>`,
  ].join('\n')
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

  const [fps, setFps] = useState(5)
  const [copiedCSS, setCopiedCSS] = useState(false)
  const [copiedSVG, setCopiedSVG] = useState(false)

  // Save/Load state
  const [savedAnimations, setSavedAnimations] = useState<SavedAnimation[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [copiedShare, setCopiedShare] = useState(false)

  // Initialize from localStorage after mount (and check for shared animation in URL)
  useEffect(() => {
    const s = loadSettings()
    let initialWidth = s.width
    let initialHeight = s.height
    let initialFrames = [createEmptyGrid(s.width, s.height)]
    let initialFps = 5

    // Check query param for shared animation
    const px = new URLSearchParams(window.location.search).get("px")
    if (px) {
      const decoded = decodeAnimationFromHash(decodeURIComponent(px))
      if (decoded) {
        initialWidth = decoded.width
        initialHeight = decoded.height
        initialFrames = decoded.frames
        initialFps = decoded.fps
        // Clear param after loading
        window.history.replaceState(null, "", window.location.pathname)
      }
    }

    setWidth(initialWidth)
    setHeight(initialHeight)
    setInputWidth(String(initialWidth))
    setInputHeight(String(initialHeight))
    setCellSize(s.cellSize)
    setFrames(initialFrames)
    setFps(initialFps)
    setCurrentFrame(0)
    historyRef.current = [{ frames: initialFrames, currentFrame: 0 }]
    historyIndexRef.current = 0
    setSavedAnimations(loadSavedAnimations())
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

const handleExportCSS = useCallback(() => {
    const css =
      frames.length === 1
        ? generateSingleFrameCSS(width, height, frames[0])
        : generateAnimatedCSS(width, height, frames, fps)
    navigator.clipboard.writeText(css).then(() => {
      setCopiedCSS(true)
      setTimeout(() => setCopiedCSS(false), 2000)
    })
  }, [width, height, frames, fps])

  const handleExportSVG = useCallback(() => {
    const svg = generateSVG(width, height, frames, fps)
    navigator.clipboard.writeText(svg).then(() => {
      setCopiedSVG(true)
      setTimeout(() => setCopiedSVG(false), 2000)
    })
  }, [width, height, frames, fps])

  const handleSaveAnimation = useCallback(
    (name: string) => {
      if (!name.trim()) return
      const save: SavedAnimation = {
        name: name.trim(),
        width,
        height,
        frames: cloneFrames(frames),
        fps,
        savedAt: Date.now(),
      }
      setSavedAnimations((prev) => {
        // Replace if same name exists
        const filtered = prev.filter((s) => s.name !== save.name)
        const updated = [save, ...filtered]
        persistSavedAnimations(updated)
        return updated
      })
      setShowSaveDialog(false)
      setSaveName("")
    },
    [width, height, frames, fps]
  )

  const handleLoadAnimation = useCallback((save: SavedAnimation) => {
    setWidth(save.width)
    setHeight(save.height)
    setInputWidth(String(save.width))
    setInputHeight(String(save.height))
    setFrames(cloneFrames(save.frames))
    setFps(save.fps)
    setCurrentFrame(0)
    const newFrames = cloneFrames(save.frames)
    historyRef.current = [{ frames: newFrames, currentFrame: 0 }]
    historyIndexRef.current = 0
    setShowLoadDialog(false)
  }, [])

  const handleDeleteSave = useCallback((name: string) => {
    setSavedAnimations((prev) => {
      const updated = prev.filter((s) => s.name !== name)
      persistSavedAnimations(updated)
      return updated
    })
  }, [])

  const handleShareAnimation = useCallback(() => {
    const hash = encodeAnimationToHash({ width, height, frames, fps })
    const url = `${window.location.origin}${window.location.pathname}?px=${encodeURIComponent(hash)}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedShare(true)
      setTimeout(() => setCopiedShare(false), 2000)
    })
  }, [width, height, frames, fps])

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
<div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="flex flex-row lg:flex-col items-start gap-6 border-b lg:border-b-0 lg:border-r border-border p-5 lg:w-[250px] flex-shrink-0">
          {/* Preview */}
          <div className="flex w-full flex-col gap-3">
            <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Preview ({width}x{height})
            </label>
            <div className="flex w-full items-center justify-center rounded-lg border border-border bg-secondary/40" style={{ aspectRatio: "1 / 1" }}>
              <PixelPreview width={width} height={height} frames={frames} fps={fps} />
            </div>
            {frames.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-mono text-muted-foreground">FPS</label>
                <input
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                  className="w-20 accent-foreground"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">
                  {fps}
                </span>
              </div>
            )}
          </div>

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

          {/* Actions */}
          <div className="flex flex-col gap-2 lg:mt-auto w-full">
<button
              onClick={handleExportCSS}
              className="flex w-full items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0"><path d="M48,180c0,11,7.18,20,16,20a14.24,14.24,0,0,0,10.22-4.66A8,8,0,1,1,85.77,206.4,30,30,0,0,1,64,216c-17.65,0-32-16.15-32-36s14.35-36,32-36a30,30,0,0,1,21.77,9.6,8,8,0,1,1-11.55,11.06A14.24,14.24,0,0,0,64,160C55.18,160,48,169,48,180Zm79.6-8.69c-4-1.16-8.14-2.35-10.45-3.84-1.26-.81-1.23-1-1.12-1.9a4.54,4.54,0,0,1,2-3.67c4.6-3.12,15.34-1.73,19.83-.56a8,8,0,0,0,4.07-15.48c-2.12-.55-21-5.22-32.83,2.76a20.55,20.55,0,0,0-9,14.95c-2,15.88,13.64,20.41,23,23.11,12.07,3.49,13.13,4.92,12.78,7.59-.31,2.41-1.26,3.34-2.14,3.93-4.6,3.06-15.17,1.56-19.55.36a8,8,0,0,0-4.3,15.41,61.23,61.23,0,0,0,15.18,2c5.83,0,12.3-1,17.49-4.46a20.82,20.82,0,0,0,9.19-15.23C154,179,137.48,174.17,127.6,171.31Zm64,0c-4-1.16-8.14-2.35-10.45-3.84-1.25-.81-1.23-1-1.12-1.9a4.54,4.54,0,0,1,2-3.67c4.6-3.12,15.34-1.73,19.82-.56a8,8,0,0,0,4.07-15.48c-2.11-.55-21-5.22-32.83,2.76a20.58,20.58,0,0,0-8.95,14.95c-2,15.88,13.65,20.41,23,23.11,12.06,3.49,13.12,4.92,12.78,7.59-.31,2.41-1.26,3.34-2.15,3.93-4.6,3.06-15.16,1.56-19.54.36A8,8,0,0,0,173.93,214a61.34,61.34,0,0,0,15.19,2c5.82,0,12.3-1,17.49-4.46a20.81,20.81,0,0,0,9.18-15.23C218,179,201.48,174.17,191.59,171.31ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,1,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.68L160,51.31Z"/></svg>
              <span>{copiedCSS ? "Copied!" : frames.length > 1 ? "Copy Animated CSS" : "Copy CSS"}</span>
            </button>
            <button
              onClick={handleExportSVG}
              className="flex w-full items-center gap-2 rounded border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0"><path d="M87.82,196.31a20.82,20.82,0,0,1-9.19,15.23C73.44,215,67,216,61.14,216A61.23,61.23,0,0,1,46,214a8,8,0,0,1,4.3-15.41c4.38,1.2,14.95,2.7,19.55-.36.88-.59,1.83-1.52,2.14-3.93.35-2.67-.71-4.1-12.78-7.59-9.35-2.7-25-7.23-23-23.11a20.55,20.55,0,0,1,9-14.95c11.84-8,30.72-3.31,32.83-2.76a8,8,0,0,1-4.07,15.48c-4.48-1.17-15.23-2.56-19.83.56a4.54,4.54,0,0,0-2,3.67c-.11.9-.14,1.09,1.12,1.9,2.31,1.49,6.44,2.68,10.45,3.84C73.5,174.17,90.06,179,87.82,196.31ZM216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,1,1-16,0V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.65,2.34l56,56A8,8,0,0,1,216,88Zm-56-8h28.69L160,51.31Zm-13.3,64.47a8,8,0,0,0-10.23,4.84L124,184.21l-12.47-34.9a8,8,0,1,0-15.06,5.38l20,56a8,8,0,0,0,15.07,0l20-56A8,8,0,0,0,146.7,144.47ZM208,176h-8a8,8,0,0,0,0,16v5.29a13.38,13.38,0,0,1-8,2.71c-8.82,0-16-9-16-20s7.18-20,16-20a13.27,13.27,0,0,1,7.53,2.38,8,8,0,0,0,8.95-13.26A29.38,29.38,0,0,0,192,144c-17.64,0-32,16.15-32,36s14.36,36,32,36a30.06,30.06,0,0,0,21.78-9.6,8,8,0,0,0,2.22-5.53V184A8,8,0,0,0,208,176Z"/></svg>
              <span>{copiedSVG ? "Copied!" : frames.length > 1 ? "Copy Animated SVG" : "Copy SVG"}</span>
            </button>

            <div className="my-1 h-px w-full bg-border" />

            <div className="flex w-full items-center gap-1">
              <button
                onClick={() => { setSaveName(""); setShowSaveDialog(true) }}
                aria-label="Save animation"
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-secondary px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                onClick={() => setShowLoadDialog(true)}
                aria-label="Load animation"
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-secondary px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Load
              </button>
              <button
                onClick={handleShareAnimation}
                aria-label="Share link"
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-secondary px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {copiedShare ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                {copiedShare ? "Copied!" : "Share"}
              </button>
            </div>
          </div>
        </aside>

        {/* Canvas Area */}
        <main className="relative flex flex-1 items-center justify-center overflow-auto p-8">
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
          {/* Undo / Redo */}
          <div className="absolute top-4 right-4 flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="flex items-center justify-center rounded border border-border bg-card/80 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              title="Undo (Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="flex items-center justify-center rounded border border-border bg-card/80 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              title="Redo (Y)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <a
              href="https://github.com/lucasmotta/pixelator"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>
            </a>
          </div>
          {/* Keyboard hints */}
          <div className="absolute bottom-4 left-4 hidden sm:flex items-center gap-1.5">
            <kbd className="inline-flex items-center rounded border border-border bg-card/80 px-1.5 py-1 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
              Shift: line
            </kbd>
            <kbd className="inline-flex items-center rounded border border-border bg-card/80 px-1.5 py-1 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
              Z / Y: undo/redo
            </kbd>
          </div>
          {/* Zoom */}
          <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2 backdrop-blur-sm">
            <label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Zoom</label>
            <input
              type="range"
              min={8}
              max={48}
              step={2}
              value={cellSize}
              onChange={(e) => setCellSize(parseInt(e.target.value))}
              className="w-24 accent-foreground"
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

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex w-80 flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold font-mono">Save Animation</h2>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveAnimation(saveName)
                if (e.key === "Escape") setShowSaveDialog(false)
              }}
              placeholder="Animation name..."
              autoFocus
              className="h-9 rounded border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            {savedAnimations.some((s) => s.name === saveName.trim()) && (
              <p className="text-[11px] text-muted-foreground">
                A save with this name already exists and will be overwritten.
              </p>
            )}
            <button
              onClick={() => handleSaveAnimation(saveName)}
              disabled={!saveName.trim()}
              className="flex items-center justify-center gap-2 rounded border border-border bg-foreground px-3 py-2 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Check className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex w-96 max-h-[70vh] flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold font-mono">Load Animation</h2>
              <button
                onClick={() => setShowLoadDialog(false)}
                className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {savedAnimations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No saved animations yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1 overflow-y-auto">
                {savedAnimations.map((save) => (
                  <div
                    key={save.name}
                    className="group flex items-center gap-3 rounded border border-border bg-secondary p-3 transition-colors hover:bg-accent"
                  >
                    <PixelPreview
                      width={save.width}
                      height={save.height}
                      frames={save.frames}
                      fps={save.fps}
                    />
                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium text-foreground truncate">
                        {save.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {save.width}x{save.height} &middot; {save.frames.length} frame{save.frames.length !== 1 ? "s" : ""} &middot; {save.fps} fps
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleLoadAnimation(save)}
                        className="rounded border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteSave(save.name)}
                        className="flex items-center justify-center rounded border border-border bg-card p-1 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
