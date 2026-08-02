import assert from "node:assert/strict";
import test from "node:test";
import { createStubSkill, createMockSkillContext } from "@goodagent/skill-sdk";

test("stub skill lifecycle hooks run", async () => {
  const skill = createStubSkill();
  const ctx = createMockSkillContext();
  await skill.onStart?.(ctx);
  assert.equal(skill.started, true);
  await skill.onStop?.(ctx);
  assert.equal(skill.stopped, true);
});
