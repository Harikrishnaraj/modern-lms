import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// T-247: eslint-config-next 16 ships native flat configs, so this no longer needs the
// @eslint/eslintrc FlatCompat bridge (which broke under ESLint 10 with a circular-structure
// error trying to validate the legacy "next/core-web-vitals" shareable-config name).
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // .claude/worktrees holds other agents' checkouts (including their own node_modules/.next and
    // scratch scripts) - never app code, so it must never be linted as part of this tree.
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts", ".claude/worktrees/**"],
  },
];

export default eslintConfig;
