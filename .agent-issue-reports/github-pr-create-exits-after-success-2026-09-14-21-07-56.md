# GitHub PR create exits after success

- Observed: 2026-09-14 21:07:56 local time
- Area: harness
- Task: Create an Anti-Slop pull request from a clean pushed branch.

## Observation
`github-pr create` created the requested pull request and printed its URL. It then exited with status 1 because its follow-up lookup reported that no pull request existed for the same branch.

## Evidence
- Command: `github-pr create --repo sirknigget/anti-slop --title "Add callback-aware SonarJS quality rules" --body @/tmp/anti-slop-callback-aware-pr.md --base main`.
- Printed URL: `https://github.com/sirknigget/anti-slop/pull/2`.
- Final error: no pull requests found for `sirknigget:feat/callback-aware-sonarjs`.
- A separate `github-pr reviews` call confirmed that PR #2 exists and is open.
- The same failure recurred for `fix/describe-own-quality-metrics`: the command printed `https://github.com/sirknigget/anti-slop/pull/3`, then reported no pull request for `sirknigget:fix/describe-own-quality-metrics`.
- A full-URL `github-pr update` then rejected the same local head checkout as not matching `sirknigget/anti-slop:fix/describe-own-quality-metrics`.

## Impact
The create result appeared to fail after a successful mutation. A second network request was necessary to determine the real state.

## Expected behavior
A successful PR creation must exit zero and return the created PR identity.

## Suggested improvement
Use the PR identity returned by the create mutation instead of a branch lookup that can be stale immediately after creation.
