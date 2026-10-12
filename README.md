# anti-slop

Opinionated Oxlint rules that reject low-evidence and low-signal TypeScript and JavaScript patterns.

Anti-slop is first and foremost the ruleset I use with my work, projects, and team. It reflects my preferences and taste rather than attempting to be a universal coding standard.

## Installation

Install the plugin as a development dependency:

```bash
pnpm add -D oxlint-plugin-anti-slop
```

Register the package in `oxlint.config.ts` and enable the rules you want:

```ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: [
    { name: "anti-slop", specifier: "oxlint-plugin-anti-slop" },
  ],
  rules: {
    "anti-slop/cognitive-complexity": ["error", 12],
    "anti-slop/cyclomatic-complexity": ["error", { threshold: 8 }],
    "anti-slop/max-lines": ["error", { maximum: 500 }],
    "anti-slop/max-lines-per-function": ["error", { maximum: 50 }],
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error"
  }
});
```

The same `jsPlugins` and rules work under `lint` in a Vite+ config.

### Optional Effect rules

Effect-specific rules live in a separate plugin so projects that do not use Effect do not inherit Effect architecture policy. Register the Effect entry point only in repositories that use Effect:

```ts
export default defineConfig({
  jsPlugins: [
    { name: "anti-slop", specifier: "oxlint-plugin-anti-slop" },
    {
      name: "anti-slop-effect",
      specifier: "oxlint-plugin-anti-slop/effect"
    }
  ],
  rules: {
    "anti-slop-effect/no-service-constructor-imports": "error"
  }
});
```

## Rules

### Generic rules

- `cognitive-complexity` — exposes the official SonarJS cognitive-complexity rule. Suite callbacks and their nested functions are measured independently.
- `cyclomatic-complexity` — exposes the official SonarJS cyclomatic-complexity rule. Suite callbacks and their nested functions are measured independently.
- `max-lines` — exposes the official SonarJS file-length rule without callback filtering.
- `max-lines-per-function` — exposes the official SonarJS function-length rule. Suite callbacks count only their own lines; nested functions are checked independently.
- `no-chained-type-assertions` — rejects nested `as` and angle-bracket assertions that fabricate evidence; chains made only of `as const` remain valid.
- `no-conditional-empty-object-spread` — reports object spreads that use a conditional `{}` branch to omit fields. It intentionally has no autofix because omission is not equivalent to assigning `undefined`.
- `no-known-value-widening` — rejects known expressions flowing into explicit `unknown`, `object`, anonymous-object, or open-dictionary targets, including known arguments passed to local `unknown` type predicates. Empty dictionary accumulators and finite-key `Record` targets remain valid.
- `no-module-mocking` — rejects Vitest and Jest `mock`, `doMock`, and `unstable_mockModule` calls in favor of real dependency seams.
- `no-object-parameters` — rejects `object`, unions containing it, and scoped or transparent generic aliases that resolve to it on function inputs.
- `no-reflect-apply` — rejects global `Reflect.apply` in favor of typed function calls.
- `no-reflect-get` — rejects global `Reflect.get` in favor of typed property access or boundary parsing.
- `no-runtime-typeof` — requires boundary parsing instead of ad hoc `typeof` narrowing. Existence probes against the string `"undefined"` are allowed, and type predicates can be enabled explicitly.
- `no-shape-in-symbol-names` — rejects the case-insensitive substring `shape` in locally owned symbol names while allowing static member names such as Zod's `schema.shape` that cannot be renamed locally.
- `no-unknown-parameters` — rejects `unknown` and unions containing it on function inputs except the explicit `cause` convention and the exact subject of a type predicate.
- `no-unknown-returns` — rejects explicit function contracts that resolve to `unknown`, `Promise<unknown>`, or `PromiseLike<unknown>`, including scoped and transparent generic aliases.
- `no-unknown-type-aliases` — rejects scoped and transparent generic aliases whose resolved type is `unknown`.
- `no-unsafe-dictionary-type` — rejects dictionary value contracts based on `unknown`, `any`, `object`, `{}`, and semantic equivalents. Generic constraints such as `T extends Record<string, unknown>` are allowed.
- `no-widen-then-assert` — rejects immutable local flows that widen known evidence to `unknown`, `any`, `object`, or a broad record and later assert it back to a narrower type.
- `require-safety-comment-for-type-assertion` — requires each non-const assertion to have a nearby, non-empty invariant justification. Marker prefixes are configurable and default to `SAFETY`.

The suite-aware rules recognize `describe`, `describe.only`, `describe.skip`, `describe.each`, `describe.only.each`, `describe.skip.each`, `fdescribe`, and `xdescribe`. Direct suite code is checked, while nested tests, hooks, helpers, callbacks, and functions are excluded from the suite's metrics and checked independently. Rule options are the unchanged SonarJS options.

### Effect rules

- `no-service-constructor-imports` — rejects named `make<CapabilityName>` imports from relative project modules outside `*.test.*` and `*.spec.*` files. Runtime callers should import the owning Layer and yield the contextual service instead. Package and path-alias imports, default imports, and static constructors such as `WorkspaceName.make` are outside the rule.

### Analysis boundaries

The rules use Oxlint's ESTree and lexical-scope APIs rather than a TypeScript type checker. They resolve same-file aliases—including block-scoped aliases, forward references, and transparent generic aliases—but do not infer imported type definitions or cross-file call signatures. Rules that inspect calls therefore document when enforcement is intentionally local.

## Violation examples

Each snippet below is rejected by the named rule.

### `no-chained-type-assertions`

```ts
const user = input as object as User;
```

### `no-conditional-empty-object-spread`

```ts
const options = {
  ...(timeout !== undefined ? { timeout } : {}),
};
```

### `no-known-value-widening`

```ts
const handlers: Record<string, Handler> = {
  start: startHandler,
};
```

This discards the known `start` key. Preserve inference or use `satisfies Record<string, Handler>` instead.

Known values must not be widened back to `unknown` through a local type predicate:

```ts
function isUser(value: unknown): value is User {
  return UserSchema.safeParse(value).success;
}

declare const user: User;
isUser(user);
```

Call the predicate at the unparsed boundary, while the argument is still `unknown`.

### `no-module-mocking`

```ts
vi.mock("./user-store");
```

### `no-object-parameters`

```ts
function save(value: object) {}
```

### `no-reflect-apply`

```ts
const value = Reflect.apply(operation, owner, args);
```

### `no-reflect-get`

```ts
const value = Reflect.get(owner, key);
```

### `no-runtime-typeof`

```ts
if (typeof input === "string") {
  useName(input);
}
```

Schema-free projects can permit `typeof` checks directly inside type predicate and
assertion functions while continuing to reject ad hoc checks elsewhere:

```json
{
  "anti-slop/no-runtime-typeof": [
    "error",
    { "allowInTypeGuards": true }
  ]
}
```

The option defaults to `false`. Existence probes such as `typeof document === "undefined"` are always allowed because they establish whether a binding exists rather than narrow its representation.

### `no-shape-in-symbol-names`

```ts
interface UserShape {
  id: string;
}
```

Static member reads such as `schema.shape` are allowed because the member name belongs to the value's owner and cannot be renamed locally.

### Effect: `no-service-constructor-imports`

```ts
import { makeIssueService } from "./issue-service.ts";
```

Import the owning Layer and yield `IssueService` instead. Focused `*.test.*` and `*.spec.*` files may import the constructor directly.

### `no-unknown-parameters`

```ts
function handle(input: unknown) {}
```

A type predicate may accept `unknown` for the parameter it narrows; other `unknown`
parameters on the same function remain rejected.

### `no-unknown-returns`

```ts
function loadUser(): unknown {
  return input;
}
```

### `no-unknown-type-aliases`

```ts
type ExternalValue = unknown;
```

### `no-unsafe-dictionary-type`

```ts
type Metadata = Record<string, unknown>;
type OtherMetadata = { [key: string]: object };
```

### `no-widen-then-assert`

```ts
const loaded: User = loadUser();
const stored: unknown = loaded;
const user = stored as User;
```

### `require-safety-comment-for-type-assertion`

```ts
const userId = value as UserId;
```

Add a specific justification immediately before a necessary assertion:

```ts
// SAFETY: parseUserId validated the identifier before branding it.
const userId = value as UserId;
```

`SAFETY` remains the default marker. Comments immediately above exported declarations are recognized. Repositories with an established convention can configure one or more alternatives; every marker must still be followed by a colon and a non-empty justification:

```json
{
  "anti-slop/require-safety-comment-for-type-assertion": [
    "error",
    { "markers": ["INVARIANT", "SAFETY"] }
  ]
}
```

## Development

```bash
pnpm install
pnpm check
```

`src/` is canonical. `pnpm check` runs the generic secret scan, Oxlint, every RuleTester suite, TypeScript typechecking, and the package build.

### Secret scanning

Development and CI use **Gitleaks 8.30.1**, an external **MIT** executable. It is not included in the published npm package or exported as bespoke anti-slop rules. No npm, Python, Go or global tool dependency is added. Upstream explicitly declares Gitleaks feature-complete with future security patches only; provider-format additions are not promised.

Acquire the official binary in Git-ignored `.tools/`, verify SHA256, and extract only `gitleaks`. Linux ARM64:

```bash
mkdir -p .tools
curl --fail --location --silent --show-error https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_arm64.tar.gz --output .tools/gitleaks.tar.gz
printf '%s  %s\n' 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080' '.tools/gitleaks.tar.gz' | sha256sum --check --status
tar -xzf .tools/gitleaks.tar.gz -C .tools gitleaks
rm .tools/gitleaks.tar.gz
.tools/gitleaks version
```

The [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) and [checksums](https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt) provide other platforms. Linux AMD64 (CI), archive suffix `linux_x64.tar.gz`, SHA256 is `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`; macOS ARM64 is `b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5`; macOS AMD64, suffix `darwin_x64.tar.gz`, is `dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709`. Use `shasum -a 256 -c` on macOS. The canonical script rejects a missing binary or different version.

```bash
pnpm quality:secrets
scripts/check-secrets.sh --staged
```

`pnpm quality:secrets` delegates to canonical `scripts/check-secrets.sh`. Default mode runs native `gitleaks dir .` over the current working directory, **including ordinary untracked and Git-ignored files such as private `.env` files**. CI uses its clean checkout. Staged mode runs native `gitleaks git --staged .` on the actual index, not the working copy. Native directory mode does not follow links; the default command also streams only tracked links' target text to native `gitleaks stdin`, without reading external targets or creating snapshots.

All invocations use `--redact=100 --no-banner --no-color --exit-code=183`; findings exit 183, other nonzero statuses are operational failures and remain failing. Directory, stdin and Git detection are offline without credential-validation requests. Native summaries remain visible. Do not add `--verbose` or report output: auxiliary finding output is not proved fully redacted. No sanitizer, custom detector, baseline, `.gitleaksignore` or repository exclusion list is added.

Tracked `.env`, fixtures, tests and reports are not blanket-ignored. The [pinned built-in configuration](https://github.com/gitleaks/gitleaks/blob/v8.30.1/config/gitleaks.toml) does exclude standard dependency/vendor directories, `.git`, lockfiles, image/font/binary/document extensions, wrapper files and `gitleaks.toml` paths. Recognized application binaries are skipped; archive traversal/recursive decoding are not enabled by default. This does not promise every tracked byte or exact Sonar secret-rule parity. Generic assignment matching requires eligible length/context/entropy and can miss short or low-entropy passwords. Dedicated provider gaps include Azure Storage/subscription, database URIs, Discord webhooks, Docker Hub/swarm, Infura, Splunk and scoped Sonar organization tokens.

The tracked `.githooks/pre-commit` calls the canonical staged command. The existing sbx global dispatcher chains it before package gates. Outside sbx, have the existing hook manager invoke it; only when no hook manager exists, opt in with `git config --local core.hooksPath .githooks`. Never overwrite an existing hook path or global configuration.

Remove and rotate actual credentials. Review explicitly dummy findings before replacing them with obvious placeholders or approving narrow exceptions; never blanket-ignore environment files, fixtures or reports to obtain a passing scan.

## License

MIT
