/*
 * Rejects unused React props from static types and runtime PropTypes declarations.
 * Uses original host-ESTree analysis, including real helper and typed factory consumers.
 */
import { defineRule } from "@oxlint/plugins";

import { analyzeReactProps } from "./props-analysis.ts";

// Reports a declaration only when its own component has no consumer for that prop.
export const noUnusedPropTypesRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow unused React typed and runtime PropTypes props." },
		schema: [],
		messages: { unusedProp: "React prop `{{name}}` is declared but is not consumed by this component." },
	},
	// Uses independent program models instead of sharing usage between components with the same type.
	createOnce(context) {
		return {
			// Reports unconsumed declarations after host scope information is available.
			Program(program) {
				for (const component of analyzeReactProps(program, context)) {
					if (component.consumesAll) continue;
					for (const [name, declaration] of component.props) {
						if (!declaration.checkUnused || component.used.has(name)) continue;
						context.report({ node: declaration.node, messageId: "unusedProp", data: { name } });
					}
				}
			},
		};
	},
});
