"use client";

import { useRef, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { Reorder } from "motion/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FrameTimelineProps {
  frames: boolean[][][];
  currentFrame: number;
  width: number;
  height: number;
  ghostEnabled: boolean;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onClearFrame: (index: number) => void;
  onDuplicateFrame: (index: number) => void;
  onDeleteFrame: (index: number) => void;
  onFlipVerticalFrame: (index: number) => void;
  onFlipHorizontalFrame: (index: number) => void;
  onRotateCwFrame: (index: number) => void;
  onRotateCcwFrame: (index: number) => void;
  onReorderFrames: (nextFrames: boolean[][][]) => void;
  onToggleGhost: () => void;
}

function FrameThumbnail({
  pixels,
  width,
  height,
  isActive,
  index,
  canDelete,
  onClick,
  onClear,
  onDuplicate,
  onDelete,
  onFlipVertical,
  onFlipHorizontal,
  onRotateCw,
  onRotateCcw,
}: {
  pixels: boolean[][];
  width: number;
  height: number;
  isActive: boolean;
  index: number;
  canDelete: boolean;
  onClick: () => void;
  onClear: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFlipVertical: () => void;
  onFlipHorizontal: () => void;
  onRotateCw: () => void;
  onRotateCcw: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbHeight = 40;
  const thumbWidth = Math.round((width / height) * thumbHeight);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = thumbWidth * dpr;
    canvas.height = thumbHeight * dpr;
    canvas.style.width = `${thumbWidth}px`;
    canvas.style.height = `${thumbHeight}px`;
    ctx.scale(dpr, dpr);

    // Background
    const cellW = thumbWidth / width;
    const cellH = thumbHeight / height;

    // Checkerboard
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isLight = (x + y) % 2 === 0;
        ctx.fillStyle = isLight ? "#2a2a2a" : "#222222";
        ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y]?.[x]) {
          ctx.fillStyle = "#e8e8e8";
          ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }
  }, [pixels, width, height, thumbWidth]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={(e) => {
            onClick();
            (e.currentTarget as HTMLButtonElement).blur();
          }}
          tabIndex={-1}
          className={`group relative flex flex-col items-center gap-1 rounded p-1.5 transition-colors outline-none ${
            isActive ? "bg-accent" : "hover:bg-accent/50"
          }`}
          style={
            isActive
              ? {
                  outline: "1px solid rgba(255,255,255,0.4)",
                  outlineOffset: "-1px",
                }
              : undefined
          }
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
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onClick={onClear}>
            Clear
            <ContextMenuShortcut>C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={onDuplicate}>
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Transform</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={onFlipVertical}>
              Flip vertical
            </ContextMenuItem>
            <ContextMenuItem onClick={onFlipHorizontal}>
              Flip horizontal
            </ContextMenuItem>
            <ContextMenuItem onClick={onRotateCw}>
              Rotate CW
            </ContextMenuItem>
            <ContextMenuItem onClick={onRotateCcw}>
              Rotate CCW
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            variant="destructive"
            onClick={onDelete}
            disabled={!canDelete}
          >
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FrameTimeline({
  frames,
  currentFrame,
  width,
  height,
  ghostEnabled,
  onSelectFrame,
  onAddFrame,
  onClearFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onFlipVerticalFrame,
  onFlipHorizontalFrame,
  onRotateCwFrame,
  onRotateCcwFrame,
  onReorderFrames,
  onToggleGhost,
}: FrameTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameIdsRef = useRef(new WeakMap<boolean[][], number>());
  const nextFrameIdRef = useRef(0);

  const getFrameId = useCallback((frame: boolean[][]) => {
    const existing = frameIdsRef.current.get(frame);
    if (existing !== undefined) return existing;
    const id = nextFrameIdRef.current++;
    frameIdsRef.current.set(frame, id);
    return id;
  }, []);

  // Scroll to keep current frame visible when it changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeEl = container.children[currentFrame] as
      | HTMLElement
      | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [currentFrame]);

  return (
    <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-3">
      {/* Frame thumbnails */}
      <Reorder.Group
        axis="x"
        values={frames}
        onReorder={onReorderFrames}
        as="div"
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 py-1"
      >
        {frames.map((frame, i) => (
          <Reorder.Item
            as="div"
            key={getFrameId(frame)}
            value={frame}
            className="shrink-0"
          >
            <FrameThumbnail
              pixels={frame}
              width={width}
              height={height}
              isActive={i === currentFrame}
              index={i}
              canDelete={frames.length > 1}
              onClick={() => onSelectFrame(i)}
              onClear={() => onClearFrame(i)}
              onDuplicate={() => onDuplicateFrame(i)}
              onDelete={() => onDeleteFrame(i)}
              onFlipVertical={() => onFlipVerticalFrame(i)}
              onFlipHorizontal={() => onFlipHorizontalFrame(i)}
              onRotateCw={() => onRotateCwFrame(i)}
              onRotateCcw={() => onRotateCcwFrame(i)}
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onAddFrame}
          tabIndex={-1}
          className="flex items-center justify-center rounded border border-border bg-secondary p-1.5 text-foreground transition-colors hover:bg-accent"
          title="Add frame"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="ml-2 text-[10px] font-mono text-muted-foreground">
          {currentFrame + 1}/{frames.length}
        </span>
      </div>
    </div>
  );
}
