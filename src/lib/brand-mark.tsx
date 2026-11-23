import React from 'react';

import { ImageResponse } from "next/og";

/**
 * The INSTANT PAYMENT mark: three rising bars in the wallet's green → lime ramp,
 * matching the logo drawn inside the app. Pure geometry, so it stays crisp at
 * 16px and needs no font or bitmap asset to ship.
 */
export const BRAND = {
  ink: "#071814",
  plate: "#12332b",
  green: "#0f8a5f",
  greenBright: "#16c78b",
  lime: "#c8f24a",
} as const;

export function MarkIcon({ size }: { size: number }) {
  const unit = size / 64;
  const bar = (height: number, color: string) => (
    <div
      style={{
        display: "flex",
        width: 9 * unit,
        height,
        borderRadius: 4.5 * unit,
        background: color,
      }}
    />
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 5.5 * unit,
        paddingBottom: 13 * unit,
        background: `linear-gradient(150deg, ${BRAND.plate} 0%, #0b211c 45%, ${BRAND.ink} 100%)`,
      }}
    >
      {bar(16 * unit, BRAND.green)}
      {bar(25 * unit, BRAND.greenBright)}
      {bar(34 * unit, BRAND.lime)}
    </div>
  );
}

/** Renders the mark as a PNG at any square size, for icons and favicons. */
export function markIconResponse(size: number): ImageResponse {
  return new ImageResponse(<MarkIcon size={size} />, { width: size, height: size });
}

/** Wraps PNG frames in an .ico container (PNG-in-ICO, supported everywhere). */
export function buildIco(frames: Array<{ size: number; png: Uint8Array }>): Uint8Array {
  const headerSize = 6 + 16 * frames.length;
  const totalBytes = frames.reduce((sum, frame) => sum + frame.png.byteLength, headerSize);
  const file = new Uint8Array(totalBytes);
  const view = new DataView(file.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, frames.length, true);

  let offset = headerSize;
  frames.forEach((frame, index) => {
    const entry = 6 + 16 * index;
    file[entry] = frame.size >= 256 ? 0 : frame.size;
    file[entry + 1] = frame.size >= 256 ? 0 : frame.size;
    file[entry + 2] = 0; // palette
    file[entry + 3] = 0; // reserved
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, frame.png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    file.set(frame.png, offset);
    offset += frame.png.byteLength;
  });

  return file;
}
