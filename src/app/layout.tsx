import React from 'react';

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { ChatWidgetMount } from "@/components/chat-widget-mount";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

const TAGLINE = "INSTANT PAYMENT — send, deposit and withdraw in one ledger";
const DESCRIPTION =
  "INSTANT PAYMENT is a digital wallet: send money to any @handle, add funds with a deposit code, request fee-free payouts, and track every movement in one ledger.";
const ALT_TEXT = "INSTANT PAYMENT — a digital wallet with one ledger for every movement";

/**
 * Absolute origin behind the icon and link-preview images.
 *
 * The public host cannot be inferred from the incoming request — the proxy
 * rewrites Host — so the published domain is declared here: set SITE_URL to the
 * domain the app is published on. The platform's own deployment host is used
 * when it provides one, and localhost only locally.
 *
 * SITE_URL is deliberately not a NEXT_PUBLIC_* name: those are inlined into the
 * bundle at compile time, which would freeze the published domain into the
 * build instead of reading it at runtime.
 */
function appOrigin(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit;

  // The hosting platform states where this deployment is served from.
  const platformUrl = process.env.IQX_PREVIEW_URL_WEB?.trim();
  if (platformUrl) return platformUrl;

  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost) return `https://${deploymentHost}`;

  return "http://localhost:3000";
}

/**
 * Built per request rather than as a module constant, so the configured domain
 * is read at render time: changing SITE_URL (for example on publish day) takes
 * effect without rebuilding or restarting anything.
 */
export function generateMetadata(): Metadata {
  const origin = appOrigin();
  const cardImage = `${origin}/api/og`;

  return {
    metadataBase: new URL(origin),
    applicationName: "INSTANT PAYMENT",
    title: TAGLINE,
    description: DESCRIPTION,
    keywords: [
      "digital wallet",
      "instant payments",
      "send money",
      "payouts",
      "deposit codes",
      "wallet ledger",
    ],
    openGraph: {
      type: "website",
      siteName: "INSTANT PAYMENT",
      title: TAGLINE,
      description: DESCRIPTION,
      url: origin,
      locale: "en_US",
      // Absolute on purpose: every crawler that unfurls the link can fetch it.
      images: [{ url: cardImage, width: 1200, height: 630, alt: ALT_TEXT }],
    },
    twitter: {
      card: "summary_large_image",
      title: TAGLINE,
      description: DESCRIPTION,
      images: [cardImage],
    },
    // Declared explicitly so the tab icon, the classic /favicon.ico and the iOS
    // home-screen icon are all the branded mark.
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      ],
      apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    },
    robots: { index: true, follow: true },
  };
}

/** Colours the mobile browser chrome to match the brand in each theme. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#071814" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <ChatWidgetMount />
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
