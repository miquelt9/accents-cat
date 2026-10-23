import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vitest/config";
import config from "./vite.config";

function resolve(command: ConfigEnv["command"] = "serve"): UserConfig {
  if (typeof config === "function") {
    return config({ command, mode: "test" });
  }
  return config;
}

describe("same-origin API proxy", () => {
  it("routes analysis finalization to FastAPI", () => {
    const proxy = resolve().server?.proxy as Record<string, string>;

    expect(proxy["/analysis-finalize"]).toBe("http://127.0.0.1:8000");
  });
});

describe("production source maps", () => {
  it("builds hidden source maps so they are not referenced from the bundles", () => {
    expect(resolve("build").build?.sourcemap).toBe("hidden");
  });
});
