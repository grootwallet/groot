# CSS refactoring for Groot 5.3

Tracking: #86. Recommended approach: plain CSS with Svelte component-scoped styles and a small global foundation. This plan does not authorize a visual redesign, new components, dependencies or wallet behavior changes.

## Ownership

| Location            | Owns                                                                                   | Avoid                                                      |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Global foundation   | Theme/color/spacing tokens, font loading, reset, document accessibility and app layout | Component internals and long chains reaching into children |
| Component `<style>` | Private markup, states and responsive behavior of that existing component              | Depending on a particular route's wrapper selectors        |
| Route `<style>`     | Page-specific arrangement of existing components                                       | Rebuilding shared cards, controls, typography or dialogs   |
| Component interface | Explicit variants and CSS variables for intentional customization                      | Arbitrary parent overrides of child internals              |

Use semantic tokens in every location. Scoped styles prevent most accidental leakage; they still inherit fonts/colors and add selector specificity. Portalled overlays and print markup need explicit global ownership where scoping cannot follow the rendered DOM. Keep local media queries beside the owning styles. Do not introduce cascade layers during the preservation pass.

Tailwind is useful when utility classes are the team's preferred styling language, but Groot already has reusable components, semantic tokens and working plain CSS. A migration would require extensive markup changes and a second verification program without directly fixing unclear ownership. Do not add Tailwind, Sass or another CSS framework for this cleanup. CSS Modules add little to Svelte's existing scoping.

## Delivery sequence

1. **Baseline and inventory (1–2 days).** Map each rule to its owner and note cross-component, portal, theme, responsive, motion and print dependencies. Capture the main routes and important loading/error/destructive/dialog states at 1180×780 and 390×844, light/dark and long FR/ES copy. Include keyboard focus, reduced motion, zoom and bottom safe-area spacing. Record CSS/build size. Type Button variants/sizes against real callers.
2. **Mechanical split (about 1 day).** Replace the large stylesheet with one ordered entry point importing contiguous sections: tokens/themes, base/accessibility, shell, shared primitives, wallet flows, responsive/print. If rules are interleaved, retain numbered chunks initially rather than grouping them in a way that changes order. Preserve selector text, declarations, specificity and final rule order. Compare built CSS semantics, computed styles and screenshots; keep this diff free of cleanup.
3. **Move ownership (2–3 days, small batches).** Start with low-coupling controls, then lists/forms, then dialogs/overlays and route arrangements. Move all relevant state/responsive rules together. Use existing props or add a narrow variant to an existing component when required. Check that scoped priority does not override theme/state rules. Replace parent-to-child overrides before removing their globals. Keep portal/print exceptions documented.
4. **Remove debt (1–2 days).** Delete a global rule only when its replacement covers all consumers and states. Consolidate repeated tokens/patterns after comparisons. Avoid a blind unused-selector purge: some classes are conditional or native-print-only. Keep a rule-owner checklist so the campaign finishes rather than leaving two implementations indefinitely.
5. **Enforce the result.** Document ownership in the design system; extend semantic-color checks to scoped styles with explicit QR/print exceptions. Review new global selectors for a shared purpose. Require focused visual/behavior checks for future changes. Keep `app.css` an entry point rather than a dumping ground.

Aim for roughly one focused engineering week plus review; the inventory determines the final size. Deliver the batches consecutively after the defect fixes and before a broad mobile UI expansion. Each batch is independently reversible and should have one clear owner; do not combine wallet logic changes with CSS movement.

## Acceptance and release

Keep the existing appearance and interaction intact. Run frontend types, units, browser acceptance, targeted screenshot/computed-style comparisons, formatting and mandatory validation. Inspect native WebKit as well as browser fixtures before claiming 5.3 UI acceptance; physical keyboard/safe-area/VoiceOver work remains platform evidence. Cover focus, reduced motion, scroll locking, toast layering and public backup print output. New reusable components still require verified-gap approval under AGENTS.md.

No profile/registry/database/backup/proposal format or BIP behavior changes. No dependency/toolchain or release trust changes. The reviewed-source gate must remain truthful; this plan never authorizes refreshing 5.2 source hashes.

References: [Svelte scoped styles](https://svelte.dev/docs/svelte/scoped-styles), [Tailwind compatibility guidance](https://tailwindcss.com/docs/compatibility). These explain the available mechanisms; the choice above is based on Groot's current architecture.

## Implementation

The scoped extraction is implemented in the working tree: the global entry now imports ordered sections and private rules live in existing owners. See [verification and compatibility boundaries](testing/css-refactoring-5.3.md) and [`src/lib/styles/README.md`](../src/lib/styles/README.md). Remaining shared presentation classes are intentional compatibility contracts, not duplicate private implementations. Further conversion of shared raw forms/buttons into existing components should be a separate reviewed change with visual evidence; it is not a reason to delay this extraction.
