import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionMemory } from "./memory.js";

describe("createSessionMemory", () => {
  it("appends and returns history per session", () => {
    const memory = createSessionMemory();
    memory.append("a", { role: "user", content: "1" });
    memory.append("a", { role: "assistant", content: "2" });
    memory.append("b", { role: "user", content: "other" });

    assert.equal(memory.history("a").length, 2);
    assert.equal(memory.history("b").length, 1);
  });

  it("trims to maxMessages without leaving an orphaned tool message first", () => {
    const memory = createSessionMemory({ maxMessages: 3 });
    memory.append("s", { role: "user", content: "u1" });
    memory.append("s", {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "c1", name: "t", arguments: {} }],
    });
    memory.append("s", { role: "tool", toolCallId: "c1", content: "{}" });
    memory.append("s", { role: "assistant", content: "done" });
    memory.append("s", { role: "user", content: "u2" });

    const history = memory.history("s");
    assert.ok(history.length <= 3);
    assert.notEqual(history[0].role, "tool");
    assert.deepEqual(history[history.length - 1], { role: "user", content: "u2" });
  });

  it("persists sessions to disk and reloads them", () => {
    const dir = mkdtempSync(join(tmpdir(), "brain-memory-"));
    const memory = createSessionMemory({ persistDir: dir });
    memory.append("tg:123", { role: "user", content: "remember me" });

    const onDisk = JSON.parse(readFileSync(join(dir, "tg_123.json"), "utf8"));
    assert.equal(onDisk[0].content, "remember me");

    // Fresh instance reads the same directory.
    const reloaded = createSessionMemory({ persistDir: dir });
    assert.equal(reloaded.history("tg:123")[0].content, "remember me");
  });

  it("clear() empties the session", () => {
    const memory = createSessionMemory();
    memory.append("s", { role: "user", content: "x" });
    memory.clear("s");
    assert.equal(memory.history("s").length, 0);
  });
});
