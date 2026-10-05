## What changed

<!-- One paragraph: the problem and the approach. Link the issue/requirement. -->

## Checklist

- [ ] Tests added/updated and `make verify` passes locally
- [ ] Migrations are reversible (`alembic downgrade -1` then `upgrade head`) — if schema changed
- [ ] No secret, credential, PII sample or real customer data is added to the repo
- [ ] Security controls documented in `docs/SECURITY.md` if behaviour changed
- [ ] Authorisation: new endpoints declare permissions in the service layer (not only the route)
- [ ] Logging: mutations write an audit row; rejections emit a security event
- [ ] Dependency changes pass `pip-audit` / `npm audit` and are pinned
- [ ] UI changes verified for every affected role (admin, agent, accounts, customer)

## Security review

- Impacted control areas (tick all that apply):
  - [ ] Authentication / session
  - [ ] Authorisation / row scoping
  - [ ] Sensitive data (PII, money)
  - [ ] Input validation
  - [ ] Logging / audit
  - [ ] Infra / secrets / CI
- Risks considered and mitigations:
