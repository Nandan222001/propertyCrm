# Dependency Management

Third-party code is our largest attack surface: an ERP backend pulls in ~40
transitive Python packages and the SPA ~200 npm packages. This document is the
policy that keeps that surface small, known and patched.

## 1. Rules

1. **Exact pinning in production.** `backend/requirements.txt` pins every direct
   dependency to `==x.y.z`; the frontend relies on `package-lock.json` committed
   to the repo and `npm ci` (never `npm install`) in CI and images.
2. **Two manifests.** Runtime (`requirements.txt`) and tooling
   (`requirements-dev.txt`) are separate so test tools never ship in the image.
3. **No install scripts.** `npm ci --ignore-scripts` — a compromised transitive
   package cannot run a post-install hook in our build.
4. **New dependency checklist** (PR template):
   * is it actively maintained (release in the last 12 months)?
   * does an existing dependency already do this (DRY applies to libraries too)?
   * license compatible (AGPL/SSPL denied by policy)?
   * no known HIGH/CRITICAL advisory (`pip-audit` / `npm audit` output in the PR);
   * minimal transitive footprint, no network calls at import time.
5. **One upgrade at a time.** Security patches may go straight to `main` after a
   green CI run; feature upgrades land weekly through Dependabot PRs.

## 2. Automated scanning

| Where | Tool | Gate |
| --- | --- | --- |
| PR | `pip-audit -r requirements.txt --strict`, `npm audit --audit-level=high` | block |
| PR | `actions/dependency-review-action` (new dependency diff + license check) | block on HIGH |
| PR | gitleaks (secrets), trivy (container OS + language layers) | block |
| Weekly (schedule) | full `pip-audit` (runtime + dev), `npm audit` incl. moderate | auto-issue |
| Continuous | Dependabot (pip, npm, docker, github-actions) | grouped PRs |

## 3. Patch SLAs

| Severity (CVSS / advisory) | Acknowledge | Patch into production |
| --- | --- | --- |
| Critical + exploitable against us | same day | **72 hours** |
| High | 1 business day | **7 days** |
| Medium | 3 business days | 30 days |
| Low / informational | backlog | next scheduled release |
| No fix available upstream | 3 business days | mitigating control + documented risk acceptance (security lead signs off) |

When a patch cannot be applied in time, the mitigation (WAF rule, feature flag
off, network restriction) is recorded in the risk register with an expiry date.

## 4. Deliberate holds and substitutions

| Package | Decision | Reason |
| --- | --- | --- |
| `bcrypt` | held at `4.0.1` | passlib 1.7.4 mis-detects bcrypt ≥ 4.1 (`(trapped) error reading bcrypt version`). Revisit when passlib ships a fix. |
| `PyJWT` | replaced `python-jose` | python-jose 3.3.0 carried PYSEC-2024-232/233 and pulled the abandoned `ecdsa` (PYSEC-2026-1325), `rsa` and `pyasn1`. PyJWT is maintained, uses `cryptography`'s Rust implementation, and needs no other change (HS256 + claim validation only). |
| `starlette`, `python-multipart`, `cryptography` | explicitly pinned, minimums enforced | these are the parsing/TLS layers; an advisory in any of them is exploitable at the edge, so CI (pip-audit `--strict`) blocks a downgrade. |

Any hold longer than 6 months is re-justified in writing at the release review.
Current state: `pip-audit -r requirements.txt` and `-r requirements-dev.txt`
both report **no known vulnerabilities**.

## 5. Release artefacts

Every release tags the repository and attaches:

* SBOM for the API image (`syft` / `trivy sbom`) and for the SPA (`npm sbom`),
* the `pip-audit` + `npm audit` reports,
* the trivy container scan result,
* the Terraform plan output for the infra change (if any).

SBOMs are kept with the release so a future CVE can be answered with
"are we affected?" in minutes instead of days.

## 6. Continuous verification

`python -m pytest tests -q` and `npm run verify` (build + render smoke) run on
every PR together with the scanners above, so a dependency bump that breaks the
application or a security control cannot be merged on the strength of a green
audit alone.
