import { spawn } from "node:child_process";
import open from "open";

const child = spawn("pnpm", ["next", "dev", "-H", "127.0.0.1", "-p", "3000"], {
  stdio: "inherit",
  env: process.env,
});

const URL = "http://127.0.0.1:3000";
let opened = false;

setTimeout(async () => {
  if (opened) return;
  opened = true;
  await open(URL).catch(() => {
    console.log(`\nOpen ${URL} in your browser.`);
  });
}, 2500);

const stop = () => {
  child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.on("exit", (code) => process.exit(code ?? 0));
