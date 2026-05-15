import { z } from "zod";

export const EnvSchema = z.object({
  SPOTIFY_CLIENT_ID: z
    .string()
    .min(20, "SPOTIFY_CLIENT_ID must be at least 20 chars"),
  ANTHROPIC_API_KEY: z
    .string()
    .regex(/^sk-ant-/, "ANTHROPIC_API_KEY must start with sk-ant-"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Env {
  return EnvSchema.parse(source);
}

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}
