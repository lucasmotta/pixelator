# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev          # Start Next.js dev server (localhost:3000)
pnpm build        # Production build
pnpm start        # Run production server
pnpm lint         # ESLint
```

Note: This project uses **pnpm** (not npm/yarn/bun) due to an existing pnpm-lock.yaml.

## Architecture

**Pixelator** is a pixel art animation editor built with Next.js 16 App Router + React 19 + Tailwind CSS v4.

### Core Data Structure

Frames are stored as `boolean[][][]` — a 3D array indexed `[frameIndex][y][x]`. The `SavedAnimation` type persists name, width, height, frames, fps, and savedAt timestamp.

### Key Components

- **`components/pixel-editor.tsx`** (~900 lines) — Root orchestrator. Owns all editor state: frames, history, tool mode, FPS, grid dimensions. Handles localStorage persistence (STORAGE_KEY for settings, SAVES_KEY for saved animations), URL hash encoding/decoding for share links, PNG export, and CSS generation.

- **`components/pixel-grid.tsx`** — HTML Canvas rendering of the editable frame. Implements drawing, erasing, line mode (Shift), and ghost overlay. Uses Bresenham's line algorithm. High-DPI aware (devicePixelRatio scaling).

- **`components/frame-timeline.tsx`** — Horizontal frame strip with thumbnails. Add/duplicate/delete/select frames and toggle ghost overlay.

- **`components/pixel-preview.tsx`** — Small animated canvas in the sidebar. Cycles frames at the configured FPS using `setInterval`.

### State & History

- Undo/redo uses `historyRef` (array of frame snapshots) + `historyIndexRef`. Max 100 entries. Rapid pixel changes are batched into a single history entry.
- Keyboard shortcuts: `Z` = undo, `Y` = redo, `Shift` = line mode, `Option/Alt` = erase.

### CSS Export

The "Copy CSS" export uses a **spritesheet gradient approach**: each pixel is a `linear-gradient` stop. Animated CSS uses `@keyframes` stepping through sprite positions. The output is standalone and works in any web project.

### Share Links

Animation state is URL-hash encoded: frame bits are packed into a byte array → Base64. Format: `{width},{height},{fps},{numFrames}|{base64data}`.

### UI Components

`components/ui/` contains shadcn/ui components built on Radix UI primitives. Don't modify these directly — regenerate via `pnpm dlx shadcn@latest add <component>` if needed.
