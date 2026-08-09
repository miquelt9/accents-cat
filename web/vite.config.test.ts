import { describe, expect, it } from "vitest";
import config from "./vite.config";

describe("same-origin API proxy", () => {
  it("routes analysis finalization to FastAPI", () => {
    const proxy = config.server?.proxy as Record<string, string>;

    expect(proxy["/analysis-finalize"]).toBe("http://127.0.0.1:8000");
  });
});
