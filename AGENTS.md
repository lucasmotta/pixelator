# AGENTS.md

Project guidance for AI coding agents working in this repository.

## Project Summary

**Pixelator** is a browser-based pixel art animation editor.

- Draw pixels frame-by-frame
- Manage multiple animation frames
- Preview animation at configurable FPS
- Export as CSS, SVG, and GIF
- Save/load animations in `localStorage`
- Share animations via URL query (`?px=`)

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui + Radix primitives
- `pnpm` package manager

## Commands

```bash
pnpm dev      # start dev server
pnpm build    # production build
pnpm start    # run production server
pnpm lint     # eslint
```

## Core Architecture

- `/Users/lucasmotta/Lab/pixelator/app/page.tsx`
: App entry point, renders `PixelEditor`.
- `/Users/lucasmotta/Lab/pixelator/components/pixel-editor.tsx`
: Main orchestrator for editor state, history, persistence, sharing, and exports.
- `/Users/lucasmotta/Lab/pixelator/components/pixel-grid.tsx`
: Editable canvas grid (draw/erase/shift-line with Bresenham, ghost overlay).
- `/Users/lucasmotta/Lab/pixelator/components/frame-timeline.tsx`
: Frame thumbnails + add/duplicate/delete/select interactions.
- `/Users/lucasmotta/Lab/pixelator/components/pixel-preview.tsx`
: Animated preview canvas.
- `/Users/lucasmotta/Lab/pixelator/lib/gif-encoder.ts`
: Custom GIF89a encoder used for GIF download.

## Data Model

Frames are stored as:

- `boolean[][][]` indexed as `[frameIndex][y][x]`
- `true` = filled pixel, `false` = empty pixel

Saved animation shape:

- `name: string`
- `width: number`
- `height: number`
- `frames: boolean[][][]`
- `fps: number`
- `savedAt: number`

## Persistence and Sharing

`localStorage` keys:

- `pixel-editor-settings` (canvas width/height, zoom cell size)
- `pixel-editor-saves` (named saved animations)
- `pixel-editor-draft` (working draft state)

Share links:

- Query param `px`
- Format: `{width},{height},{fps},{numFrames}|{base64bits}`
- Frames are bit-packed before URL-safe base64 encoding

## History / Undo-Redo

In `pixel-editor.tsx`:

- Snapshot-based history with refs (`historyRef`, `historyIndexRef`)
- Max history length: `100`
- Drawing operations are batched to avoid one history entry per pixel move

## Keyboard Shortcuts

- `Cmd/Ctrl+Z`: undo
- `Cmd/Ctrl+Y` or `Cmd/Ctrl+Shift+Z`: redo
- `Cmd/Ctrl+S`: open save dialog
- `Cmd/Ctrl+O`: open load dialog
- `C`: clear current frame
- `Cmd/Ctrl+D`: duplicate frame after
- `Cmd/Ctrl+Shift+D`: duplicate frame before
- `Backspace`: delete current frame (if more than one)
- `Cmd/Ctrl+]`: add frame after
- `Cmd/Ctrl+[` : add frame before
- `ArrowLeft` / `ArrowRight`: navigate frames
- `Shift + drag`: line mode

## Export Behavior

- CSS export:
  - Single frame: static CSS background gradients
  - Multi-frame: spritesheet gradient + `steps()` keyframe animation
- SVG export:
  - Uses grouped `<rect>` runs by frame activity pattern
  - Animated with SMIL `<animate calcMode="discrete">`
- GIF export:
  - Uses custom encoder (`encodeGIF`)
  - Supports configurable foreground and optional background color

## UI and Styling Notes

- Dark theme tokens and Tailwind theme variables are in `/Users/lucasmotta/Lab/pixelator/app/globals.css`
- Many components in `/Users/lucasmotta/Lab/pixelator/components/ui` are generated shadcn primitives
- Prefer not to hand-edit generated UI primitives unless necessary

## Guardrails for Agents

- Preserve the frame data model (`boolean[][][]`)
- Keep URL/share encoding backward compatible unless intentionally versioned
- Maintain undo/redo behavior when changing draw interactions
- Respect `1..64` bounds for width/height and `1..24` for FPS in UI behavior
- Avoid adding heavy dependencies for export features; current approach is dependency-light
- Run `pnpm lint` after significant edits

## High-Impact Test Areas After Changes

1. Draw/erase/line behavior and ghost overlay
2. Frame operations (add/duplicate/delete/select)
3. Undo/redo consistency across frame changes
4. Save/load/draft restore correctness
5. Export outputs (CSS, SVG, GIF)
6. Share link encode/decode round-trip

