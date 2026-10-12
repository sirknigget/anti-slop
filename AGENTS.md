# Repository guidance

- `src/` is the canonical plugin implementation.
- Keep rules generic and suitable for reuse across repositories. Do not add application-specific names, paths, or exceptions.
- Use Oxlint's ESTree API for JavaScript/TypeScript; do not add another production parser. The optional `src/stylelint/` entry uses Stylelint's native PostCSS AST, PostCSS for comment-body parsing, and its maintained value parser for CSS constructs.
- Add focused RuleTester coverage for original native Oxlint rules and Stylelint API coverage for CSS rules. Test semantic wrappers around third-party JS plugins through the actual Oxlint CLI only when public ESLint types cannot use RuleTester without casts or compatibility shims. Assert diagnostics for meaningful input cases, use isolated temporary files, and remove them in `finally`.
- Run `pnpm check` before committing.
