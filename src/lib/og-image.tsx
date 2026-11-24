import React from 'react';

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { BRAND } from "@/lib/brand-mark";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "INSTANT PAYMENT — a digital wallet with one ledger for every movement";

const INK = BRAND.ink;
const GREEN = BRAND.greenBright;
const LIME = BRAND.lime;

const FONT_NAME = "Space Grotesk";

/** The display face, by weight, and where to get it if it is not bundled. */
const FONT_SOURCES = [
  {
    weight: 700 as const,
    url: "https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff",
  },
  {
    weight: 500 as const,
    url: "https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff",
  },
];

type BrandFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" };

let cachedFonts: BrandFont[] | null | undefined;

async function loadFont(weight: 500 | 700, url: string): Promise<BrandFont | null> {
  const bundled = join(process.cwd(), "src/assets/fonts", `space-grotesk-latin-${weight}-normal.woff`);

  try {
    if (existsSync(bundled)) {
      const buffer = readFileSync(bundled);
      return {
        name: FONT_NAME,
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        weight,
        style: "normal",
      };
    }
  } catch {
    // Fall through to the network copy below.
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return { name: FONT_NAME, data: await response.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

/**
 * The card is drawn in the app's display face. The font file is used when it is
 * present next to the code, otherwise it is fetched once and kept in memory —
 * the app already fetches this same family at build time. If neither works the
 * card still renders in the default face rather than failing.
 */
async function brandFonts(): Promise<BrandFont[] | undefined> {
  if (cachedFonts !== undefined) return cachedFonts ?? undefined;

  const loaded = (await Promise.all(FONT_SOURCES.map((source) => loadFont(source.weight, source.url)))).filter(
    (font): font is BrandFont => font !== null,
  );

  cachedFonts = loaded.length > 0 ? loaded : null;
  return cachedFonts ?? undefined;
}

const PROOF_POINTS = ["Send to any @handle", "Deposit codes", "Flat payout fee, never deducted"];

/**
 * The card shown when an INSTANT PAYMENT link is shared, served from its own
 * route (rather than the metadata file convention) so the absolute URL in the
 * page head is fully under our control.
 */
export async function ogImageResponse(): Promise<ImageResponse> {
  const fonts = await brandFonts();

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "74px 84px",
          background: `linear-gradient(140deg, #0d2620 0%, ${INK} 52%, #0a1f19 100%)`,
          fontFamily: "Space Grotesk",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background: "radial-gradient(circle at 86% 10%, rgba(22,199,139,0.28), transparent 58%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 7 }}>
            <div style={{ display: "flex", width: 12, height: 24, borderRadius: 6, background: "#0f8a5f" }} />
            <div style={{ display: "flex", width: 12, height: 38, borderRadius: 6, background: GREEN }} />
            <div style={{ display: "flex", width: 12, height: 54, borderRadius: 6, background: LIME }} />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 31,
              fontWeight: 700,
              letterSpacing: 3.6,
              color: "#eefaf4",
            }}
          >
            INSTANT PAYMENT
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 19, fontWeight: 500, letterSpacing: 6, color: GREEN }}>
            DIGITAL WALLET
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              maxWidth: 940,
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1.6,
              color: "#f4fbf7",
            }}
          >
            Money that moves the moment you do.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              maxWidth: 900,
              fontSize: 26,
              fontWeight: 500,
              lineHeight: 1.5,
              color: "#9fbcb2",
            }}
          >
            Send to any @handle, add funds with a deposit code, and see every payout and movement
            recorded in one ledger.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {PROOF_POINTS.map((point, index) => (
            <div
              key={point}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "15px 26px",
                borderRadius: 999,
                border: "1px solid rgba(22,199,139,0.34)",
                background: "rgba(255,255,255,0.05)",
                fontSize: 21,
                fontWeight: 500,
                color: "#cdece0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  background: index === 2 ? LIME : GREEN,
                }}
              />
              {point}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
