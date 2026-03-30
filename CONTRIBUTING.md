# Contributing

## Local loop

1. Install dependencies with `npm install`.
2. Run `npm test`.
3. Keep Pack examples and tests aligned when engine behavior changes.

## Change expectations

- explain finance-domain reasoning in pull requests
- add or update at least one test for rule-engine behavior changes
- add or update auth/session coverage when touching identity, CSRF, or OIDC flows
- keep Pack examples reviewable and source-linked
- avoid claiming production legal coverage without official-source references
- keep README and `docs/enterprise-readiness.md` aligned with the actual shipped security posture

## Good first contributions

- new example Packs
- replay diff improvements
- connector adapter scaffolds
- README demos and walkthroughs
- audit export and identity-operations docs refinements
