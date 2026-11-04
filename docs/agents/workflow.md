# Workflow

## Branches and PRs

- Branch from `main`, and open a PR that says `Closes #<issue>`.
- Keep a PR to one concern, and file anything else you find as its own issue.
- Commit messages are Conventional Commits with the issue number: `fix(pool): copy-on-write asteroid and explosion slots (#156)`.
- In the PR, describe what you verified and how, including anything you didn't test.

## Before pushing

Run `vp check`, `vp test` and `vp build`. The deploy workflow runs the same three.

- `vp check` must report 0 errors. Don't add to the existing warnings.
- If it reports formatting problems, run `vp fmt <file>`.

## Dependencies

- `package-lock.json` is tracked, so commit it with any dependency change.
- The deploy workflow installs with `vp install -- --legacy-peer-deps`. Use the same command if a plain install fails on peer dependencies.

## Releases

- **Pushing a `v*` tag deploys to GitHub Pages**, through `.github/workflows/deploy.yml`. Merging to `main` doesn't deploy anything, so fixes don't reach players until the next tag.
- Only tag when the maintainer asks you to.
- Release numbers live in the tags. The `version` field in `package.json` stays at `0.0.0`.
- Pages serves the app under `/asteroid-defender/`, which is set as `base` in `vite.config.js`. Use relative or base-aware asset paths.
