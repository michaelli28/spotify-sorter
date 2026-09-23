import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { PageTransition } from "@/src/components/design/PageTransition";
import { NavLockProvider } from "@/src/components/design/NavLock";
import { SiteNav } from "@/src/components/design/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpotifySorter",
  description: "A private record-listening room at 1am.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <NavLockProvider>
          {/* Outside PageTransition: the nav must not remount or fade per route. */}
          <SiteNav />
          <PageTransition>{children}</PageTransition>
        </NavLockProvider>
      </body>
    </html>
  );
}
