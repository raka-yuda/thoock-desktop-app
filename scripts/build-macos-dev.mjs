import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.platform !== "darwin") {
  throw new Error("This development bundle command requires macOS.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = resolve(root, "src-tauri/target/debug/bundle/macos/Thoock.app");
execFileSync(
  resolve(root, "node_modules/.bin/tauri"),
  [
    "build",
    "--debug",
    "--bundles",
    "app",
    "--config",
    "src-tauri/tauri.macos.dev.conf.json",
  ],
  { cwd: root, stdio: "inherit" },
);
execFileSync(
  "/usr/bin/codesign",
  ["--verify", "--strict", "--verbose=2", bundle],
  { stdio: "inherit" },
);
