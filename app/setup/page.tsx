"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { DevAppInstructions } from "@/src/components/setup/DevAppInstructions";
import { ClientIdStep } from "@/src/components/setup/ClientIdStep";
import { AnthropicKeyStep } from "@/src/components/setup/AnthropicKeyStep";
import { PrefixStep } from "@/src/components/setup/PrefixStep";

type State = {
  clientId: string;
  anthropicKey: string;
  prefix: string;
  error?: string;
};

const STEPS = ["intro", "client", "anthropic", "prefix"] as const;
type Step = (typeof STEPS)[number];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<State>({
    clientId: "",
    anthropicKey: "",
    prefix: "✨",
  });
  const [validating, setValidating] = useState(false);

  const idx = STEPS.indexOf(step);
  const canAdvance = (() => {
    if (step === "intro") return true;
    if (step === "client") return state.clientId.length >= 20;
    if (step === "anthropic") return state.anthropicKey.startsWith("sk-ant-");
    if (step === "prefix") return state.prefix.length > 0;
    return false;
  })();

  async function advance() {
    if (step === "anthropic") {
      setValidating(true);
      const r = await fetch("/api/llm/validate", {
        method: "POST",
        body: JSON.stringify({ apiKey: state.anthropicKey }),
        headers: { "content-type": "application/json" },
      });
      const json = (await r.json()) as { ok: boolean };
      setValidating(false);
      if (!json.ok) {
        setState({
          ...state,
          error:
            "That key was rejected. Double-check it on console.anthropic.com.",
        });
        return;
      }
    }
    if (step === "prefix") {
      const r = await fetch("/api/config", {
        method: "POST",
        body: JSON.stringify({
          spotify_client_id: state.clientId,
          anthropic_api_key: state.anthropicKey,
          prefix: state.prefix,
        }),
        headers: { "content-type": "application/json" },
      });
      if (r.ok) router.push("/");
      return;
    }
    setStep(STEPS[idx + 1]);
  }

  return (
    <PageShell
      eyebrow={`Setup — step ${idx + 1} of ${STEPS.length}`}
      title="Let's get connected."
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-10"
        >
          {step === "intro" && <DevAppInstructions />}
          {step === "client" && (
            <ClientIdStep
              value={state.clientId}
              onChange={(v) => setState({ ...state, clientId: v })}
            />
          )}
          {step === "anthropic" && (
            <AnthropicKeyStep
              value={state.anthropicKey}
              onChange={(v) =>
                setState({ ...state, anthropicKey: v, error: undefined })
              }
              error={state.error}
            />
          )}
          {step === "prefix" && (
            <PrefixStep
              value={state.prefix}
              onChange={(v) => setState({ ...state, prefix: v })}
            />
          )}
          <div className="pt-6">
            <Button onClick={advance} disabled={!canAdvance || validating}>
              {validating
                ? "Verifying…"
                : step === "prefix"
                  ? "Save and continue"
                  : "Continue"}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </PageShell>
  );
}
