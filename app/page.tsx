import Link from "next/link";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { ResumePrompt } from "@/src/components/shared/ResumePrompt";
import { EnvSchema } from "@/src/lib/config/env";

export default function Home() {
  const configured = EnvSchema.safeParse(process.env).success;
  const href = configured ? "/api/auth/login" : "/setup";
  const label = configured ? "Connect Spotify" : "Set up Spotify";
  return (
    <PageShell>
      <div className="mt-32 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-6">
          A private record-listening room.
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-7xl text-[var(--color-text-primary)] leading-[0.95] tracking-tight mb-12">
          Sort your <em>library</em> into vibes that mean something.
        </h1>
        <p className="text-[var(--color-text-secondary)] text-lg leading-relaxed mb-16 max-w-xl">
          SpotifySorter reads your playlists, asks Claude Haiku to invent 25-35
          sub-genre/mood categories tuned to your taste, and writes them back as
          new playlists in your account. Re-runs are incremental.
        </p>
        <Link href={href}>
          <Button>{label}</Button>
        </Link>
        <ResumePrompt />
      </div>
    </PageShell>
  );
}
