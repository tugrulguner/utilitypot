# Deployment and release contract

## Family parity

The deployment structure follows the current ModePot static-site and LifePot production patterns: push to `main` or manual dispatch, immutable checkout pins, Node 22, `npm ci`, a `production` environment, serial deployments, repository-level `CLOUDFLARE_ACCOUNT_ID`, durable `CLOUDFLARE_API_TOKEN`, and Wrangler-managed custom domains. UtilityPot adds full reusable CI before deployment. It deliberately deploys every main-branch change rather than maintaining an incomplete path filter.

The release structure adapts Dexpot's tag → CI → main ancestry/version/changelog gates → artifact build → checksummed GitHub Release sequence to a website. UtilityPot is not a Python package: there is no PyPI publishing, wheel matrix or OIDC package-index environment. No npm publishing is introduced either.

## Production prerequisites

- GitHub environment `production`, restricted to `main`.
- Repository variable `CLOUDFLARE_ACCOUNT_ID`, matching the ModePot Cloudflare account.
- Repository secret `CLOUDFLARE_API_TOKEN`, a durable least-privilege API token authorized to deploy this Worker and manage the intended custom domain. Existing sibling GitHub secrets cannot be read back or copied through GitHub's API. Never use local Wrangler OAuth/refresh tokens as CI credentials.
- `modepot.io` must be active in the corresponding Cloudflare account, with permission to attach `utilitypot.modepot.io`.
- Before enabling public AI, provision the Worker secret `TYPESAFE_API_KEY` securely and configure provider spending limits. It is not a frontend variable or GitHub build secret. Without it, manual utilities work and AI requests fail closed.

A workflow file, configured variable, dry-run or canonical URL does not prove deployment readiness. The deployment job fails explicitly when credentials are absent. Never paste credential values in issues, PRs, logs or chat.

## Deployment

`.github/workflows/deploy-website.yml` runs the complete reusable CI, then builds and deploys **utilitypot-site** from `main`. Manual dispatch is also restricted to `main`. Wrangler's `custom_domain: true` route owns the hostname binding. This never repoints `modepot-site` or LifePot.

After an authorized merge enables the workflow, require successful exact-default-branch CI and deployment, then independently check DNS, TLS, the canonical page and utility assets, `/privacy/`, API failure paths and live Jev behavior if the secret was configured. Do not declare launch complete from a dry-run alone.

## Release preparation

`package.json` is the sole editable version source. Use npm's version command so the lockfile updates with it:

```sh
npm version 0.1.0 --no-git-tag-version --allow-same-version
```

Prepare a focused release change moving the chosen `CHANGELOG.md` entries from `[Unreleased]` into one exact heading, for example `## [0.1.0] - YYYY-MM-DD`. Use the intended publication **UTC date**, nonempty user-visible notes, and keep future work in `[Unreleased]`. Do not describe untagged changes as already published. The initial automation change intentionally retains only Unreleased notes; a tag is blocked until release preparation lands.

After that release-preparation change is separately reviewed, authorized and merged, verify exact-main CI. Only with explicit release authorization, tag that verified main commit as `v<package.json version>`. Do not tag a feature branch or use a future version unsupported by the metadata/changelog.

## Release artifact and publication

`.github/workflows/release.yml` runs the full CI on `v*` tags, checks that the tag commit is reachable from `origin/main`, validates the exact version and publication-date changelog, and builds the site from the tag. It uploads one archive, `SHA256SUMS` and extracted release notes. A separate least-privilege publication job downloads and verifies the checksums before creating a normal GitHub Release. It does not deploy production or publish to a package index.

The archive contains compiled `worker/index.js`, static `assets/`, a standalone `wrangler.json`, license and `BUILD.json` with version/source commit. The builder dry-runs **that exact extracted layout**, and CI exercises it using a local real Worker. Artifacts contain no API credential. Secrets must be provisioned on the target Worker independently.

```sh
npm ci
npm run build
npm run release:bundle
npm run test:release-artifact
node scripts/release.mjs checksums release
```

After publication, independently read back the tag/commit, release visibility, assets and SHA-256 hashes. Announce the verified release through the project's GitHub Discussion and prepare an X draft linking it; do not post to X without separate approval. Source/automation changes do not themselves authorize a tag, release or deployment.

## Public reader transport requirement

The public reader uses this existing Worker with native fetch and the explicit `global_fetch_strictly_public` compatibility flag. Preserve this flag in source and release artifacts; it prevents own-zone private-origin shortcuts. General public hostname reading is active, with supplementary bounded Cloudflare DoH checks and no hostname allowlist. This relies on hosted Cloudflare's public Internet egress boundary, not DNS pinning or arbitrary Node-server safety. See [security controls, platform dependency and limits](public-page-reader.md). Owner-run live acceptance should cover ModePot and an unrelated public URL after an authorized preview/deployment; local fixtures cannot certify hosted egress.
