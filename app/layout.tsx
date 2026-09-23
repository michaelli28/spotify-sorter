import type { Metadata } from "next";
import { Caprasimo, Libre_Franklin } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { PageTransition } from "@/src/components/design/PageTransition";
import { NavLockProvider } from "@/src/components/design/NavLock";
import { SiteNav } from "@/src/components/design/SiteNav";
import { MotionRoot } from "@/src/components/design/MotionRoot";
import { SleeveDefs } from "@/src/components/graphics/SleeveDefs";
import {
  ActionStripProvider,
  ActionStripSlot,
} from "@/src/components/design/ActionBar";
import "./globals.css";

// Only the loaders' own variables here; globals.css builds the stacks
// (--font-display, --font-body, --font-mono) with the CJK fallback.
const caprasimo = Caprasimo({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-caprasimo",
});
const franklin = Libre_Franklin({
  subsets: ["latin", "latin-ext"],
  variable: "--font-franklin",
});

export const metadata: Metadata = {
  title: "SpotifySorter",
  description: "Your library as a record shop.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${caprasimo.variable} ${franklin.variable} ${GeistMono.variable}`}
    >
      <body>
        {/* One shared set of sleeve masks and patterns, referenced by every <Sleeve>. */}
        <SleeveDefs />
        <MotionRoot>
          <NavLockProvider>
            <ActionStripProvider>
              {/* Outside PageTransition: neither may remount or fade per route. */}
              <SiteNav />
              <ActionStripSlot />
              <PageTransition>{children}</PageTransition>
            </ActionStripProvider>
          </NavLockProvider>
        </MotionRoot>
      </body>
    </html>
  );
}
