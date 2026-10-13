/*
 * Rejects React defaultProps that contradict static or runtime prop declarations.
 * Checks each declaration contract separately and does not invent imported type information.
 */
import { defineRule } from "@oxlint/plugins";

import { analyzeReactProps } from "./props-analysis.ts";

// Keeps defaults optional in every known prop declaration contract.
export const defaultPropsMatchPropTypesRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Require React defaultProps to match non-required prop declarations." },
		schema: [{ type: "object", properties: { allowRequiredDefaults: { type: "boolean" } }, additionalProperties: false }],
		messages: {
			requiredDefault: "Default prop `{{name}}` corresponds to a required prop declaration.",
			unknownDefault: "Default prop `{{name}}` has no corresponding prop declaration.",
		},
	},
	// Preserves the public optional allowRequiredDefaults setting without weakening its default.
	createOnce(context) {
		return {
			// Checks legacy defaultProps only; parameter defaults are separate JavaScript behavior.
			Program(program) {
				const option: unknown = context.options[0];
				const allowRequired = typeof option === "object" && option !== null && "allowRequiredDefaults" in option && option.allowRequiredDefaults === true;
				for (const component of analyzeReactProps(program, context)) {
					if (!component.defaults) continue;
					for (const [name, node] of component.defaults) {
						const unknown = component.defaultContracts.some((contract) => contract.complete && !contract.props.has(name));
						const required = component.defaultContracts.some((contract) => contract.props.get(name)?.required);
						if (unknown) context.report({ node, messageId: "unknownDefault", data: { name } });
						else if (required && !allowRequired) context.report({ node, messageId: "requiredDefault", data: { name } });
					}
				}
			},
		};
	},
});
