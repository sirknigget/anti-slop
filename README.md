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
    "anti-slop/accessor-field-consistency": "error",
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

### Optional React prop rules

The React entry point uses original rules on Oxlint's native ESTree and scope APIs. It does not replace native React checks, add a parser, or require an ESLint runner:

```ts
export default defineConfig({
  jsPlugins: [
    { name: "anti-slop-react", specifier: "oxlint-plugin-anti-slop/react" }
  ],
  rules: {
    "anti-slop-react/no-unused-prop-types": "error",
    "anti-slop-react/default-props-match-prop-types": [
      "error",
      { allowRequiredDefaults: false }
    ]
  }
});
```

- `no-unused-prop-types` rejects unconsumed top-level static or runtime typed props per component. It follows direct reads, destructuring and rest exclusions, local value aliases, helper/JSX forwarding, and typed factory callback consumers. Shared types do not share usage across unrelated components. React constructor initialization and static receiver reads do not hide unused instance props.
- `default-props-match-prop-types` rejects unknown `defaultProps` keys and defaults for required TypeScript or runtime PropTypes declarations. When both declarations exist, each must permit the default independently. JavaScript parameter defaults are not legacy `defaultProps`; `allowRequiredDefaults` defaults to `false`.

The rules recognize React import aliases, functions, classes and local React subclasses, `memo`, `forwardRef`, and `FC`/`FunctionComponent` annotations. Local types include transparent generic aliases, interfaces and extensions, unions/intersections, finite `keyof` sets, and finite `Readonly`, `Partial`, `Required`, `Pick`, `Omit`, `Record`, and `PropsWithChildren` forms. Local constant metadata and resolved object spreads are analyzed. Known default keys remain checked beside unresolved spreads; potentially overwritten validator values remain unknown rather than being treated as optional or required.

Component roles use conventional component bindings, explicit React wrappers/types, default exports, runtime metadata, or local JSX binding usage. Ordinary classes, array-map callback records, and lower-case local JSX helpers are not treated as React props. Local inheritance excludes overridden parent consumers unless a `super` read restores them. Typed factory consumers match the target's local prop declaration identities; arbitrary structural assignability is not inferred.

Oxlint JS plugins do not receive a TypeScript checker. Imported types, arbitrary mapped/conditional types, inferred decorator types, and unresolved metadata are not full-program coverage. Unknown inherited or spread declarations do not establish that a default key is absent. PropTypes checks inspect the runtime declaration contract; they do not claim to perform React runtime validation. React 19 no longer checks runtime PropTypes or function `defaultProps`, but existing declarations still need to be internally consistent.

`eslint-plugin-react@7.37.5` was considered but rejected: its declared ESLint peer range stops at 9, and actual package resolution selected incompatible ESLint 10. The original rules add no dependency, force no peers, and do not install an out-of-support ESLint runner. Native RuleTester cases cover the contracts; application smoke must also exercise the compiled plugin through the actual Oxlint CLI.

### Optional CSS rules

CSS rules use a separate Stylelint entry. Install Stylelint 17 or later alongside anti-slop and register only the rules you need in `.stylelintrc.json`:

```json
{
  "plugins": ["oxlint-plugin-anti-slop/stylelint"],
  "rules": {
    "anti-slop/no-commented-css": true,
    "anti-slop/no-orientation-lock": true,
    "anti-slop/no-small-important-text-spacing": true
  }
}
```

- `no-commented-css` detects CSS rules, at-rules and semicolon-terminated declarations in comments after successful native PostCSS parsing. Ordinary prose, URLs and malformed fragments pass. A complete CSS example in a comment is indistinguishable from disabled code; keep examples in documentation instead.
- `no-orientation-lock` detects rotations within 30 degrees of a quarter turn, modulo 180 degrees, inside orientation media queries. It covers `rotate`/`rotateZ`, Z-axis `rotate3d`, `matrix`/`matrix3d` and the individual `rotate` property. Function values in custom properties and other declarations are also checked, so reusable rotation values cannot bypass the gate. Rotation outside orientation media queries, other-axis rotation, translation and full turns pass. This is a static orientation-lock indicator, not a computed-cascade or rendered-page accessibility proof.
- `no-small-important-text-spacing` detects important `word-spacing`, `letter-spacing` and `line-height` below 0.16, 0.12 and 1.5 font-relative units respectively. Values at or above the thresholds, non-important declarations and unrelated properties pass. It preserves the static font-unit approximations: `%` divided by 100, `ex`/`ch` and root variants divided by 2, `cap` and `rcap` multiplied by 0.7, and `em`/`ic` plus root variants treated as em-equivalent. It checks numeric tokens inside functions too. Fixed units, unitless values, keywords and unresolved variables need computed font/DOM information and are not inferred.

The CSS entry consumes the AST supplied by Stylelint; it does not parse whole files again. Comment bodies use PostCSS, the same framework parser. No CSS tooling is loaded by the Oxlint root or Effect entries, and Stylelint is an optional peer dependency. The plugin does not introduce blanket bans on comments, rotations or `!important`.

Stylelint's normal CSS invocation checks stylesheets, not HTML attributes or JSX. A framework-native custom syntax can supply embedded CSS when the consuming project actually uses it; this package does not add a second HTML/JavaScript parser. React's supported `style` prop takes an object, not an HTML-style string, and does not support `!important` values.

Run `pnpm test:css` for CSS semantic tests; `pnpm check` includes them.

## Generic Unicode text checks

The separate `anti-slop-text` executable checks literal UTF-8 text of any format,
including Markdown, CSS, HTML, Python, shell, configuration and malformed source.
It uses Node built-ins, not an AST parser. It does not decode source-language escape
spellings, XML entities or percent escapes.

```bash
pnpm exec anti-slop-text -- "README.md" "src/file with spaces.ts"
pnpm exec anti-slop-text --git-root .
pnpm exec anti-slop-text --git-root . --staged --json
```

Explicit files must be regular UTF-8 text. Git mode checks tracked and nonignored
untracked working-tree files; staged mode checks the exact index blobs for
added/copied/modified/renamed paths, even when the working copy differs or is absent.
Git roots normalize to the repository top level. Both Git modes skip binary,
invalid-UTF-8, symlink and deleted-index entries. There are no extension exclusions.
Exit codes are
`0` for no findings, `1` for findings and `2` for input or tool errors.

| Check | Behavior |
| --- | --- |
| `unbalanced-bidi` | Reports unclosed U+202A/B/D/E formatting or U+2066/7/8 isolate controls per line. The two stacks are independent. Balanced pairs and standalone closing controls pass. Only localized Android `res/values-[a-zA-Z-]+/strings.xml` paths are exempt. |
| `hidden-unicode-tags` | Reports nonblank runs of at least two U+E0020–U+E007F tags outside black-flag context. A U+1F3F4 black flag skips following tags through the first cancel tag, non-tag or line end, without country-code validation. Hidden runs after the cancel tag are checked again. |
| `consecutive-variation-selectors` | Reports runs of at least two U+FE00–U+FE0F or U+E0100–U+E01EF selectors. Single selectors and ordinary emoji remain valid. |

These are original specification-based checks associated with Sonar Text S6389,
S7628 and S8522, not copied Sonar implementations. The published S8522 description
says two selectors; captured Sonar Text 2.47.0.11983 uses four. This checker follows
the published two-selector contract. It does not claim analyzer-version parity.
Locations use one-based lines and UTF-16 columns, which can differ from Sonar's
sequence column counting. No automatic removal or broad Unicode scalar ban is used.

Applications can use the parser-free API independently:

```ts
import { scanText } from "oxlint-plugin-anti-slop/text";

const findings = scanText(content, filename);
```

Prefer installed native Oxlint checks, then compatible existing plugins, over
duplicating standard language rules here. Generic text scanning belongs outside
AST rules; a scanner that bans every selector, tag or bidi character would also
reject legitimate emoji and balanced controls.

## Rules

### Generic rules

- `accessor-field-consistency` — detects simple class getters/setters (including `getX`/`setX` methods) reading/writing the wrong locally established backing field. Field declarations, TypeScript parameter properties (including defaults), and direct `this.field = ...` constructor statements establish storage. Exact `value`, `_value`, `#value`, and `#_value` conventions are supported when only one candidate exists; static and instance fields are separate. Named methods lower-case only their first suffix letter (`getValue` → `value`). Computed/delegating or multi-statement accessor bodies, conditional/nested constructor initialization, unresolved inherited fields, and ambiguous conventions are deliberately not inferred. A direct alias with no matching backing field passes; a getter/setter pair both using the wrong field still fails. This is a conservative original replacement for the backing-field part of [Sonar S4275](https://rules.sonarsource.com/typescript/RSPEC-4275/), not complete equivalence: `Object.defineProperty` is outside its scope and missing returns belong to native `getter-return`.
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

Install **Gitleaks** as a separate developer prerequisite available as `gitleaks` on `PATH`. On macOS:

```bash
brew install gitleaks
gitleaks version
```

On Linux, optionally install with **Go >= 1.24.11**:

```bash
go install github.com/zricethezav/gitleaks/v8@v8.30.1
export PATH="$(go env GOPATH)/bin:$PATH"
gitleaks version
```

Keep Go's binary directory on `PATH` (use `GOBIN` instead if configured). `pnpm install` installs project packages, not the Gitleaks CLI. Once the CLI is available:

```bash
pnpm install
pnpm check
```

`src/` is canonical. `pnpm check` runs the generic secret scan, Oxlint and the text CLI, every RuleTester suite, TypeScript typechecking, and the package build.

### Secret scanning

Secret scanning uses **Gitleaks**, an external **MIT** executable found on `PATH`. It is not included in the published npm package or exported as bespoke anti-slop rules; no npm or Go module dependency is added to this project. Local scans do not require an exact version: newer local 8.x releases, including Homebrew upgrades, may produce different findings from CI.

CI downloads the checksum-verified **8.30.1** Linux x64 binary into its ephemeral `.tools/` directory and adds it to `PATH`. The [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) and [checksums](https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt) document the pinned CI asset. Developers use their installed CLI, not a checkout-local binary. The canonical script fails with installation guidance if `gitleaks` is missing from `PATH`.

Upstream explicitly declares Gitleaks feature-complete with future security patches only; provider-format additions are not promised.

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
