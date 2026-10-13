/*
 * Checks original React prop rules with the native Oxlint RuleTester.
 * Uses semantic fixtures for declaration, consumption, scope, and default requiredness.
 */
import { RuleTester } from "oxlint/plugins-dev";

import { defaultPropsMatchPropTypesRule } from "./default-props.ts";
import { fixtures } from "./props-fixtures.test.ts";
import { noUnusedPropTypesRule } from "./unused-props.ts";

// Uses the same TSX host AST that the frontend CLI uses, without another parser.
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });

// Accepts concrete consumers and rejects a prop that remains unused by its own component.
tester.run("anti-slop-react/no-unused-prop-types", noUnusedPropTypesRule, {
	valid: fixtures.pass.map((fixture) => ({ name: fixture.name, code: fixture.code })),
	invalid: fixtures.reject.filter((fixture) => fixture.rule === "no-unused-prop-types").map((fixture) => ({ name: fixture.name, code: fixture.code, errors: [{ messageId: "unusedProp" }] })),
});

// Rejects required or undeclared legacy default keys while accepting modern parameter defaults.
tester.run("anti-slop-react/default-props-match-prop-types", defaultPropsMatchPropTypesRule, {
	valid: fixtures.pass.map((fixture) => ({ name: fixture.name, code: fixture.code })),
	invalid: fixtures.reject.filter((fixture) => fixture.rule === "default-props-match-prop-types").map((fixture) => ({ name: fixture.name, code: fixture.code, errors: [{ messageId: fixture.name.startsWith("required-") ? "requiredDefault" : "unknownDefault" }] })),
});

// Accepts a required known default only under the explicit public required-default option.
tester.run("anti-slop-react/default-props-match-prop-types with required defaults allowed", defaultPropsMatchPropTypesRule, {
	valid: [{ name: "accepts a known required default only with allowRequiredDefaults", code: "type Props = { name: string }; function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { name: 'Hello' };", options: [{ allowRequiredDefaults: true }] }],
	invalid: [{ name: "rejects an unknown default even with allowRequiredDefaults", code: "type Props = { name: string }; function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { other: 'Hello' };", options: [{ allowRequiredDefaults: true }], errors: [{ messageId: "unknownDefault" }] }],
});
