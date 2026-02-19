# Pixelator

A pixel art animation editor that runs in the browser. Draw frame-by-frame animations and export them as pure CSS or SVG — no canvas, no dependencies, just code you can drop anywhere.

## Features

- Draw and erase pixels
- Multi-frame animations with configurable FPS
- Ghost overlay to see the previous frame while drawing
- Shift-click to draw straight lines (Bresenham's algorithm)
- Export as animated CSS (spritesheet gradient approach)
- Export as animated SVG (SMIL, pattern-grouped for small file size)
- Save/load animations to localStorage
- Share animations via URL (`?px=`)
- Undo/redo (Z / Y)

## Export formats

**CSS** — uses `linear-gradient`  to paint pixels. Works anywhere, no SVG required. Animated via `background-position` stepping.

**SVG** — uses `<rect>` elements grouped by on/off pattern across frames. Animated via SMIL `<animate calcMode="discrete">`. Both formats use `currentColor`, so the pixel color is controlled by the CSS `color` property on the element.

## Tech

Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui · v0

## Creator

Vibe coded by [@lucasmotta](https://x.com/lucasmotta).
