"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type Transition,
  type Variants,
} from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { EASE_OUT_EXPO, useMotionConfig } from "@/src/hooks/useMotionConfig";
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

const SHIFT = 16;
const swap: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * SHIFT }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -SHIFT }),
};

// The leaving step keeps its space out of the flow (popLayout) and out of
// reach: no clicks, no focus, not read out alongside the new one.
function StepSection({
  ref,
  dir,
  transition,
  children,
}: {
  ref?: Ref<HTMLElement>;
  dir: number;
  transition: { enter: Transition; exit: Transition };
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <motion.section
      ref={ref}
      custom={dir}
      variants={swap}
      initial="enter"
      animate="center"
      exit="exit"
      transition={present ? transition.enter : transition.exit}
      inert={!present}
      aria-hidden={present ? undefined : true}
    >
      {children}
    </motion.section>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const { reduced, spring } = useMotionConfig();
  const [idx, setIdx] = useState(0);
  // +1 forward, -1 back: the steps slide the way you are going.
  const [dir, setDir] = useState(1);
  const [values, setValues] = useState<SetupValues>({
    clientId: "",
    anthropicKey: "",
    prefix: "✨",
  });
  const [problem, setProblem] = useState<Problem>({});
  const [busy, setBusy] = useState<Busy>(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[idx];

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
    setIdx(to);
    setProblem({});
  }

  function edit(field: keyof SetupValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setProblem({});
  }

  function back() {
    // Back disappears on the first step, which has no field to take focus.
    if (idx === 1) primaryRef.current?.focus();
    go(idx - 1);
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
  const transition = reduced
    ? { enter: { duration: 0 }, exit: { duration: 0 } }
    : {
        enter: { x: spring, opacity: { duration: 0.3, ease: EASE_OUT_EXPO } },
        exit: { duration: 0.15, ease: EASE_OUT_EXPO },
      };

  return (
    <PageShell>
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,36rem)] lg:gap-x-20">
        <SetupIndex steps={LABELS} current={idx} />
        <form noValidate onSubmit={submit} className="relative min-w-0">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <StepSection key={step.id} dir={dir} transition={transition}>
              <h1 className="mb-10 text-balance font-[family-name:var(--font-display)] text-display-2 tracking-tight text-[var(--color-text-primary)]">
                {step.title}
              </h1>
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
            </StepSection>
          </AnimatePresence>
          {/* Outside the swap, so the buttons glide to their new place
              instead of vanishing with the old step. */}
          <motion.div
            layout={reduced ? false : "position"}
            transition={spring}
            className="mt-12"
          >
            <div className="-ml-1 flex items-baseline gap-8">
              <Button ref={primaryRef} type="submit" disabled={busy !== false}>
                {primaryLabel}
              </Button>
              {idx > 0 && (
                <Button
                  variant="ghost"
                  onClick={back}
                  disabled={busy !== false}
                >
                  Back
                </Button>
              )}
            </div>
            {problem.form && (
              <p
                role="alert"
                className="mt-4 px-1 text-sm text-[var(--color-danger)]"
              >
                {problem.form}
              </p>
            )}
          </motion.div>
        </form>
      </div>
    </PageShell>
  );
}
