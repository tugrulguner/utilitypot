# Dependency security qualification

This update repairs the reviewed dependency graph, not a demonstrated breach. Baseline npm audit reported three high and three moderate affected-package entries; propagated Wrangler/Miniflare entries are not separate proof of application vulnerabilities.

The affected copies belonged to check/build/dev/deployment tooling: fast-uri through AJV/YAML tooling, Vite/Zod through Astro, Undici through Unifont and Wrangler/Miniflare. The reviewed static application imports and Worker sourcemap did not include these packages. That is bounded source/artifact evidence, not a complete security certification or proof about every possible build environment.

Compatible resolution (no forced cross-major overrides): Astro 7.4.1, Wrangler 4.156.2, fast-uri 3.1.9, Vite 8.3.5, Zod 4.6.7, Undici 8.12.3 and Miniflare’s Undici 7.30.1. A fresh locked installation reports zero npm audit findings. Wrangler’s actual bundle embeds Undici 7.30.1 and Zod 4.6.6; Miniflare’s bundle embeds Zod 4.6.6. Those embedded copies are tested separately because a lockfile-only audit cannot inspect bundled dependencies.

CI audits all dependency scopes at moderate severity or higher before build. Release regressions inspect every nested lockfile copy in the reviewed vulnerable ranges and installed Wrangler/Miniflare bundle provenance. These guards complement, not replace, a current advisory feed. Future package removals are allowed; changed embedded provenance requires a fresh review.

Run npm ci, npm audit --audit-level=moderate, npm run test:release and the complete application/Worker/artifact gates. Passing candidate checks does not update production; merging and deployment require separate owner approval. No credential rotation is indicated by this dependency inventory alone, and no secrets were inspected.
