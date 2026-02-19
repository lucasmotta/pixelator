/**
 * GIF89a encoder for 2-color pixel art animations.
 *
 * Palette layout (3 entries, min colour table size = 2 bits → 4 slots):
 *   index 0 — transparent (rendered as black #000000, flagged transparent)
 *   index 1 — black  (#000000, the drawn colour)
 *   index 2 — unused (#ffffff, padding to fill the 4-entry table)
 *   index 3 — unused (#ffffff, padding)
 *
 * Each frame uses a Graphics Control Extension that marks index 0 as the
 * transparent colour, so "false" pixels show the page background through.
 *
 * LZW minimum code size is 2 (the minimum GIF allows).
 */

// ---------------------------------------------------------------------------
// Byte-stream helpers
// ---------------------------------------------------------------------------

class ByteStream {
  private buf: number[] = [];

  /** Append a single byte (0–255). */
  byte(v: number): void {
    this.buf.push(v & 0xff);
  }

  /** Append a 16-bit little-endian word. */
  word(v: number): void {
    this.buf.push(v & 0xff, (v >> 8) & 0xff);
  }

  /** Append a sequence of bytes. */
  bytes(arr: number[] | Uint8Array): void {
    for (const b of arr) this.buf.push(b & 0xff);
  }

  /** Append an ASCII string as raw bytes. */
  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i) & 0xff);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ---------------------------------------------------------------------------
// LZW encoder (GIF variant)
// ---------------------------------------------------------------------------
//
// GIF LZW differs from the standard in one way: the first two special codes
// are always emitted relative to the *minimum code size*, not the actual
// palette size.
//
//   Clear code  = 1 << minCodeSize          (always 4 for minCodeSize=2)
//   EOI code    = (1 << minCodeSize) + 1    (always 5 for minCodeSize=2)
//
// The encoder starts with code width = minCodeSize + 1 (= 3 bits) and
// widens by one bit whenever the code table would overflow the current width.
// The table is reset after each Clear code.
//
// Output is packed LSB-first into bytes, which are emitted as GIF sub-blocks
// (each sub-block is preceded by a 1-byte length, max 255 bytes).

function lzwCompress(pixels: number[], minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode   = clearCode + 1;

  let bitBuf = 0;
  let bitLen = 0;
  const rawBytes: number[] = [];

  const emitCode = (code: number, width: number): void => {
    bitBuf |= code << bitLen;
    bitLen += width;
    while (bitLen >= 8) {
      rawBytes.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitLen -= 8;
    }
  };

  const buildTable = (): Map<string, number> => {
    const t = new Map<string, number>();
    for (let i = 0; i < clearCode; i++) t.set(`:${i}`, i);
    return t;
  };

  let table     = buildTable();
  let nextCode  = eoiCode + 1;
  let codeWidth = minCodeSize + 1;

  emitCode(clearCode, codeWidth);

  if (pixels.length === 0) {
    emitCode(eoiCode, codeWidth);
    if (bitLen > 0) rawBytes.push(bitBuf & 0xff);
    return rawBytes;
  }

  // Standard GIF LZW: seed the prefix with the first pixel value.
  // Pixel values 0..(clearCode-1) are their own codes, so this is valid.
  // Never use a sentinel like -1 — that creates single-pixel compound entries
  // that diverge from the decoder's table (which starts compound entries at
  // two-pixel sequences).
  let prefix = pixels[0];

  for (let i = 1; i < pixels.length; i++) {
    const sym = pixels[i];
    const key = `${prefix}:${sym}`;

    if (table.has(key)) {
      prefix = table.get(key)!;
    } else {
      emitCode(prefix, codeWidth);

      if (nextCode <= 0xfff) {
        table.set(key, nextCode++);
        if (nextCode > (1 << codeWidth) && codeWidth < 12) codeWidth++;
      } else {
        // Table full — emit Clear and reset
        emitCode(clearCode, codeWidth);
        table     = buildTable();
        nextCode  = eoiCode + 1;
        codeWidth = minCodeSize + 1;
      }

      prefix = sym;
    }
  }

  emitCode(prefix, codeWidth);
  emitCode(eoiCode, codeWidth);

  // Flush remaining bits
  if (bitLen > 0) rawBytes.push(bitBuf & 0xff);

  return rawBytes;
}

// ---------------------------------------------------------------------------
// Sub-block packing
// ---------------------------------------------------------------------------
// GIF image data is split into sub-blocks of at most 255 bytes each,
// each preceded by its byte count.  The sequence ends with a 0x00 terminator.

function packSubBlocks(data: number[]): number[] {
  const out: number[] = [];
  let offset = 0;
  while (offset < data.length) {
    const blockSize = Math.min(255, data.length - offset);
    out.push(blockSize);
    for (let i = 0; i < blockSize; i++) {
      out.push(data[offset + i]);
    }
    offset += blockSize;
  }
  out.push(0x00); // block terminator
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode a sequence of 1-bit pixel frames as an animated GIF89a.
 *
 * @param width   Canvas width in pixels.
 * @param height  Canvas height in pixels.
 * @param frames  `frames[frameIndex][y][x]` — true = black pixel, false = transparent.
 * @param fps     Playback speed; frame delay = Math.round(100 / fps) centiseconds.
 * @param scale   Upscale factor (default 8). Each canvas pixel becomes scale×scale GIF pixels.
 * @returns       Raw GIF byte sequence as Uint8Array.
 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function encodeGIF(
  width: number,
  height: number,
  frames: boolean[][][],
  fps: number,
  scale = 8,
  fgColor = "#000000",
  bgColor?: string,
): Uint8Array {
  const out = new ByteStream();

  const gifWidth  = width  * scale;
  const gifHeight = height * scale;

  const [fgR, fgG, fgB] = hexToRgb(fgColor)
  const hasBg = bgColor !== undefined
  const bgRgb = hasBg ? hexToRgb(bgColor!) : [0, 0, 0]

  // ---- Constants ---------------------------------------------------------
  const MIN_CODE_SIZE   = 2;
  const TRANSPARENT_IDX = 0;  // index 0: transparent (or bg when hasBg)
  const FG_IDX          = 1;  // index 1: foreground pixel color

  // Frame delay in GIF centiseconds (1/100 s units).
  const safeFps = Math.max(1, Math.min(100, fps));
  const frameDelay = Math.round(100 / safeFps);

  // ---- GIF Header (6 bytes) ----------------------------------------------
  out.ascii("GIF89a");

  // ---- Logical Screen Descriptor (7 bytes) -------------------------------
  out.word(gifWidth);
  out.word(gifHeight);

  //   Packed byte:
  //     bit 7    : Global Color Table Flag = 1   (we have a GCT)
  //     bits 6-4 : Color Resolution - 1 = 1      (2-bit colour)
  //     bit 3    : Sort Flag = 0
  //     bits 2-0 : Size of Global Color Table = 1 (2^(1+1) = 4 entries)
  //
  //   Size field value N means the table has 2^(N+1) entries.
  //   We need 4 entries (the minimum for minCodeSize=2), so N=1.
  out.byte(0b10110001); // GCT flag + colour res + GCT size=1

  out.byte(0);  // Background Color Index (index 0 = transparent placeholder)
  out.byte(0);  // Pixel Aspect Ratio (0 = square)

  // ---- Global Color Table (4 × 3 = 12 bytes) -----------------------------
  // Entry 0: bg color (used as transparent when !hasBg)
  out.bytes(bgRgb);
  // Entry 1: foreground pixel color
  out.bytes([fgR, fgG, fgB]);
  // Entries 2-3: unused filler
  out.bytes([0xff, 0xff, 0xff]);
  out.bytes([0xff, 0xff, 0xff]);

  // ---- Netscape Application Extension (looping, 19 bytes) ----------------
  out.byte(0x21);          // Extension introducer
  out.byte(0xff);          // Application Extension label
  out.byte(0x0b);          // Block size: always 11
  out.ascii("NETSCAPE");   // Application identifier (8 bytes)
  out.ascii("2.0");        // Application auth code (3 bytes)
  out.byte(0x03);          // Sub-block size
  out.byte(0x01);          // Sub-block ID
  out.word(0x0000);        // Loop count (0 = infinite)
  out.byte(0x00);          // Block terminator

  // ---- Per-Frame Data ----------------------------------------------------
  for (const frame of frames) {
    // -- Graphics Control Extension (8 bytes) ------------------------------
    out.byte(0x21);  // Extension introducer
    out.byte(0xf9);  // Graphic Control Label
    out.byte(0x04);  // Block size: always 4

    //   Packed byte:
    //     bits 7-5 : Reserved = 000
    //     bits 4-2 : Disposal Method = 2 (restore to background)
    //                This ensures transparent areas are cleared between frames.
    //     bit 1    : User Input Flag = 0
    //     bit 0    : Transparent Color Flag = 1
    // bit 0 = transparent flag: only set when background is transparent
    out.byte(hasBg ? 0b00001000 : 0b00001001);

    out.word(frameDelay);      // Delay time (centiseconds)
    out.byte(TRANSPARENT_IDX); // Transparent Color Index (ignored when hasBg)
    out.byte(0x00);            // Block terminator

    // -- Image Descriptor (10 bytes) ----------------------------------------
    out.byte(0x2c);      // Image separator
    out.word(0);         // Image Left
    out.word(0);         // Image Top
    out.word(gifWidth);  // Image Width
    out.word(gifHeight); // Image Height

    //   Packed byte:
    //     bit 7    : Local Color Table Flag = 0 (use global table)
    //     bit 6    : Interlace Flag = 0
    //     bit 5    : Sort Flag = 0
    //     bits 4-3 : Reserved = 00
    //     bits 2-0 : Size of Local Color Table = 0 (ignored when flag=0)
    out.byte(0x00);

    // -- Image Data -----------------------------------------------------------
    // Each canvas pixel is expanded to scale×scale GIF pixels.
    const pixels: number[] = new Array(gifWidth * gifHeight);
    let p = 0;
    for (let y = 0; y < height; y++) {
      const row = frame[y];
      for (let sy = 0; sy < scale; sy++) {
        for (let x = 0; x < width; x++) {
          const idx = row?.[x] ? FG_IDX : TRANSPARENT_IDX;
          for (let sx = 0; sx < scale; sx++) {
            pixels[p++] = idx;
          }
        }
      }
    }

    out.byte(MIN_CODE_SIZE); // LZW Minimum Code Size

    const compressed = lzwCompress(pixels, MIN_CODE_SIZE);
    out.bytes(packSubBlocks(compressed));
  }

  // ---- GIF Trailer (1 byte) -----------------------------------------------
  out.byte(0x3b);

  return out.toUint8Array();
}
