# Frontend agent guide

This file extends the root `AGENTS.md` for `src/`.

- Routes orchestrate view state only. Call `walletService`; never import dummy/Tauri adapters or invoke Tauri directly.
- Put stable frontend DTOs and operations in `lib/wallet/contracts.ts`, adapter code in `lib/wallet/{dummy,tauri}.ts`, and pure invariants in `lib/wallet/policy.ts` or `lib/multisig/policy.ts`.
- Compose new feature UI from the reusable components already in `lib/components/`; do not build a route-local substitute for an existing pattern. If no component satisfies a verified need, explain the gap and obtain the user's explicit approval before creating a new reusable component. A component may format public DTOs but must not derive wallet truth.
- Keep credentials in the narrowest possible local state, clear them after every attempt, and never place secrets in stores, URLs, accessibility labels, toasts, logs, or persisted browser state.
- Every async action needs loading, inline result/error, retry, and an appropriate toast. Disabled actions need a visible reason.
- Use semantic CSS tokens from `app.css`; verify light/dark at 1180×780 and 390×844 with no overflow.
- Add Vitest tests for pure rules and Playwright coverage for every changed user flow, including error and retry paths.
- `pnpm test:boundaries` is intentionally strict. Extend a stable adapter boundary rather than bypassing it.
