# Repository guidance

- `src/` is the canonical plugin implementation.
- Keep rules generic and suitable for reuse across repositories. Do not add application-specific names, paths, or exceptions.
- Use Oxlint's ESTree API; do not add another production parser.
- Add focused RuleTester coverage for original native Oxlint rules. Test semantic wrappers around third-party JS plugins through the actual Oxlint CLI when public ESLint types cannot use RuleTester without casts or compatibility shims. These tests must assert diagnostics for meaningful input cases, use isolated temporary files, and remove them in `finally`.
- Run `pnpm check` before committing.
