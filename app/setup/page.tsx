"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { SetupIndex } from "@/src/components/setup/SetupIndex";
import { DevAppInstructions } from "@/src/components/setup/DevAppInstructions";
import { ClientIdStep } from "@/src/components/setup/ClientIdStep";
import { AnthropicKeyStep } from "@/src/components/setup/AnthropicKeyStep";
import { PrefixStep } from "@/src/components/setup/PrefixStep";
import {
  fieldProblem,
  keyVerdict,
  type SetupValues,
  type StepId,
} from "@/src/components/setup/checks";

const STEPS: readonly { id: StepId; label: string; title: string }[] = [
  { id: "intro", label: "Spotify app", title: "Make a Spotify app." },
  { id: "client", label: "Client ID", title: "Paste its Client ID." },
  { id: "anthropic", label: "Anthropic key", title: "Paste an Anthropic key." },
  { id: "prefix", label: "Prefix", title: "Prefix the new playlists." },
];
const LABELS = STEPS.map((s) => s.label);

// field: the value is wrong, so the field is marked invalid.
// form: a request failed; the value may be fine.
type Problem = { field?: string; form?: string };
type Busy = false | "checking" | "saving";

// A new card face nudges 8px in the way you are going. The old one leaves at
// once: fading both overlaps two titles (and the taller one hangs out of the
// card), and focus lands in the new field immediately.
const SHIFT = 8;

export default function SetupPage() {
  const router = useRouter();
  const { reduced } = useMotionConfig();
  const [idx, setIdx] = useState(0);
  // +1 forward, -1 back: the card face nudges the way you are going.
  const [dir, setDir] = useState(1);
  // The first face arrives with the file's own entrance, not the swap.
  const [moved, setMoved] = useState(false);
  const [values, setValues] = useState<SetupValues>({
    clientId: "",
    anthropicKey: "",
    prefix: "✨",
  });
  const [problem, setProblem] = useState<Problem>({});
  const [busy, setBusy] = useState<Busy>(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[idx];
  useNavLock(busy !== false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => {
        if (d.configured) router.replace("/");
      })
      // Unknown means stay: this page is where an unconfigured app belongs.
      .catch(() => {});
  }, [router]);

  function go(to: number) {
    setDir(to > idx ? 1 : -1);
    setMoved(true);
    setIdx(to);
    setProblem({});
  }

  function edit(field: keyof SetupValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setProblem({});
  }

  // Back, or an earlier card's tab. The first card has no field to take
  // focus, and the control that had it (Back, the tab) is about to go.
  function back(to: number) {
    if (to === 0) primaryRef.current?.focus();
    go(to);
  }

  async function keyIsGood(): Promise<boolean> {
    setBusy("checking");
    setProblem({});
    try {
      const r = await fetch("/api/llm/validate", {
        method: "POST",
        body: JSON.stringify({ apiKey: values.anthropicKey }),
        headers: { "content-type": "application/json" },
      });
      const verdict = keyVerdict(
        (await r.json()) as { ok: boolean; message?: string },
      );
      if (verdict === "rejected")
        setProblem({ field: "Anthropic rejected that key." });
      if (verdict === "unchecked")
        setProblem({ form: "Couldn't check the key with Anthropic." });
      return verdict === "ok";
    } catch {
      setProblem({ form: "Couldn't check the key with Anthropic." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy("saving");
    setProblem({});
    let saved = false;
    try {
      const r = await fetch("/api/config", {
        method: "POST",
        body: JSON.stringify({
          spotify_client_id: values.clientId,
          anthropic_api_key: values.anthropicKey,
          prefix: values.prefix.trim(),
        }),
        headers: { "content-type": "application/json" },
      });
      saved = r.ok;
      if (!saved) setProblem({ form: "Couldn't save the settings." });
    } catch {
      setProblem({ form: "Couldn't reach the app to save." });
    } finally {
      // Stays locked on success so Save can't fire twice while home loads.
      if (!saved) setBusy(false);
    }
    // Replace, so Back from home doesn't reopen a finished setup.
    if (saved) router.replace("/");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const field = fieldProblem(step.id, values);
    if (field) {
      setProblem({ field });
      return;
    }
    if (step.id === "prefix") return save();
    if (step.id === "anthropic" && !(await keyIsGood())) return;
    go(idx + 1);
  }

  const fieldProps = { error: problem.field, busy: busy !== false };
  // The step's busy label, held in reserve so the button keeps its width.
  const busyLabel =
    step.id === "anthropic"
      ? "Checking…"
      : step.id === "prefix"
        ? "Saving…"
        : null;
  const primaryLabel =
    busy === "checking"
      ? "Checking…"
      : busy === "saving"
        ? "Saving…"
        : step.id === "prefix"
          ? "Save"
          : step.id === "anthropic" && problem.form
            ? "Try again"
            : "Continue";

  return (
    // The shop counter: no site nav here, so the counter is the whole ground
    // and the card file is dealt onto it.
    <main className="min-h-dvh bg-counter bg-[image:var(--grain)]">
      <div className="page-frame pt-8 pb-section tab:pt-section">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduced
              ? { duration: DURATION.reduced }
              : { duration: DURATION.scene, ease: EASE_OUT }
          }
          className="mx-auto max-w-[46rem]"
        >
          <SetupIndex
            steps={LABELS}
            current={idx}
            locked={busy !== false}
            onBack={back}
          />
          <form
            noValidate
            onSubmit={submit}
            className="rounded-[3px] border border-rule-strong bg-card p-4 pt-6 tab:p-12"
          >
            <motion.section
              key={step.id}
              initial={
                !moved
                  ? false
                  : reduced
                    ? { opacity: 0 }
                    : { opacity: 0, x: dir * SHIFT }
              }
              animate={{ opacity: 1, x: 0 }}
              transition={
                reduced
                  ? { duration: DURATION.reduced }
                  : { duration: DURATION.state, ease: EASE_OUT }
              }
            >
              <h1 className="text-balance font-display text-display-3 text-ink">
                {step.title}
              </h1>
              {/* The index card's head rule, edge to edge. */}
              <div
                aria-hidden
                className="-mx-4 mt-4 mb-6 h-px bg-rule tab:-mx-12 tab:mt-6 tab:mb-8"
              />
              {step.id === "intro" && <DevAppInstructions />}
              {step.id === "client" && (
                <ClientIdStep
                  value={values.clientId}
                  onChange={(v) => edit("clientId", v)}
                  {...fieldProps}
                />
              )}
              {step.id === "anthropic" && (
                <AnthropicKeyStep
                  value={values.anthropicKey}
                  onChange={(v) => edit("anthropicKey", v)}
                  {...fieldProps}
                />
              )}
              {step.id === "prefix" && (
                <PrefixStep
                  value={values.prefix}
                  onChange={(v) => edit("prefix", v)}
                  {...fieldProps}
                />
              )}
            </motion.section>
            {/* Outside the keyed face, so the same buttons (and focus on them)
                survive a step change. */}
            <div className="pt-8 tab:pt-12">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 tab:gap-x-8">
                <Button
                  ref={primaryRef}
                  type="submit"
                  busy={busy !== false}
                >
                  {busyLabel ? (
                    <span className="grid justify-items-center">
                      <span className="col-start-1 row-start-1">
                        {primaryLabel}
                      </span>
                      <span
                        aria-hidden
                        className="invisible col-start-1 row-start-1"
                      >
                        {busyLabel}
                      </span>
                    </span>
                  ) : (
                    primaryLabel
                  )}
                </Button>
                {idx > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => back(idx - 1)}
                    disabled={busy !== false}
                  >
                    Back
                  </Button>
                )}
              </div>
              {/* A busy button's new label isn't announced. */}
              <p role="status" className="sr-only">
                {busy === "checking"
                  ? "Checking the key with Anthropic…"
                  : busy === "saving"
                    ? "Saving the settings…"
                    : ""}
              </p>
              {problem.form && (
                <p role="alert" className="mt-3 text-danger">
                  {problem.form}
                </p>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    </main>
  );
}
