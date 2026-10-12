/*
 * Exposes original React prop rules through the native Oxlint ESTree API.
 * Keeps React prop policy separate from native React rules and their namespace.
 */
import { eslintCompatPlugin } from "@oxlint/plugins";

import { defaultPropsMatchPropTypesRule } from "./default-props.ts";
import { noUnusedPropTypesRule } from "./unused-props.ts";

// Loads only the two explicit prop checks; it does not enable a framework preset.
const reactPropsPlugin = eslintCompatPlugin({
	meta: { name: "anti-slop-react" },
	rules: {
		"no-unused-prop-types": noUnusedPropTypesRule,
		"default-props-match-prop-types": defaultPropsMatchPropTypesRule,
	},
});

export default reactPropsPlugin;
