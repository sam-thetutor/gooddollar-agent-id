import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripMarkdown } from "./telegram.js";

describe("stripMarkdown", () => {
  it("removes bold, italics-underscore, code and headings", () => {
    const input =
      "# Scoreboard\n**GameArena 1v1 (RPS)**\n- 345 matches\n__today__: 37\nWallet: `0xabc`";
    assert.equal(
      stripMarkdown(input),
      "Scoreboard\nGameArena 1v1 (RPS)\n- 345 matches\ntoday: 37\nWallet: 0xabc",
    );
  });

  it("unwraps fenced code blocks", () => {
    assert.equal(stripMarkdown("```js\nconst a = 1;\n```"), "const a = 1;\n");
  });

  it("leaves plain text and dash lists untouched", () => {
    const plain = "Hello — 2 wins / 8 losses\n- riven\n- anti-strike";
    assert.equal(stripMarkdown(plain), plain);
  });
});
