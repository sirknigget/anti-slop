# Repository guidance

- `src/` is the canonical plugin implementation.
- Keep rules generic and suitable for reuse across repositories. Do not add application-specific names, paths, or exceptions.
- Use Oxlint's ESTree API for JavaScript/TypeScript; do not add another production parser. The optional `src/stylelint/` entry uses Stylelint's native PostCSS AST, PostCSS for comment-body parsing, and its maintained value parser for CSS constructs.
- Add focused RuleTester coverage for semantic Oxlint changes and Stylelint API coverage for CSS changes.
- Run `pnpm check` before committing.
