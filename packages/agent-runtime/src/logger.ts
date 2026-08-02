import type { SkillLogger } from "@goodagent/skill-sdk";

export function createRuntimeLogger(prefix: string): SkillLogger {
  const tag = `[${prefix}]`;
  return {
    debug(message, meta) {
      console.debug(meta ? `${tag} ${message}` : `${tag} ${message}`, meta ?? "");
    },
    info(message, meta) {
      console.log(meta ? `${tag} ${message}` : `${tag} ${message}`, meta ?? "");
    },
    warn(message, meta) {
      console.warn(meta ? `${tag} ${message}` : `${tag} ${message}`, meta ?? "");
    },
    error(message, meta) {
      console.error(meta ? `${tag} ${message}` : `${tag} ${message}`, meta ?? "");
    },
  };
}
