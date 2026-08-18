import { describe, expect, it } from "vitest";
import { usdmForUsdtTarget } from "@goodagent/chain";
import {
  CHESS_ARENA_MIN_FUNDING_GS,
  computeChessArenaFundingGs,
} from "./skill-env.js";

describe("usdmForUsdtTarget", () => {
  it("maps 6-decimal USDT to 18-decimal USDm", () => {
    expect(usdmForUsdtTarget(1_000_000n)).toBe(10n ** 18n);
    expect(usdmForUsdtTarget(2_000_000n)).toBe(2n * 10n ** 18n);
  });
});

describe("computeChessArenaFundingGs", () => {
  it("raises deploy G$ above the chess arena minimum", () => {
    expect(computeChessArenaFundingGs(200)).toBe(CHESS_ARENA_MIN_FUNDING_GS);
    expect(computeChessArenaFundingGs(10_000)).toBe(10_000);
  });
});
