import { defineRule } from "@oxlint/plugins";
import { containsUnknownType, functionParameterBindingName, functionParameterTypeAnnotation, } from "../shared/function-parameters.js";
// Allows conventional names only at explicit error-handling boundaries.
const unknownErrorParameterNames = new Set(["cause", "error", "reason"]);
function isTypePredicateSubject(owner, parameterName) {
    const predicate = owner.returnType?.typeAnnotation;
    return (predicate?.type === "TSTypePredicate" &&
        predicate.parameterName.type === "Identifier" &&
        predicate.parameterName.name === parameterName);
}
/** Disallow unknown inputs except explicitly named error handling and type predicates. */
export const noUnknownParametersRule = defineRule({
    meta: {
        type: "problem",
        docs: {
            description: "Disallow explicitly unknown function parameters except conventional error parameters and type-predicate subjects; decode unknown input at its I/O boundary instead.",
        },
        messages: {
            unknownParameter: "Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.",
        },
    },
    createOnce(context) {
        const checkParameters = (node) => {
            for (const parameter of node.params) {
                const annotation = functionParameterTypeAnnotation(parameter);
                if (annotation === null || annotation === undefined)
                    continue;
                if (!containsUnknownType(annotation.typeAnnotation))
                    continue;
                const name = functionParameterBindingName(parameter, context.sourceCode);
                if (unknownErrorParameterNames.has(name) || isTypePredicateSubject(node, name))
                    continue;
                context.report({
                    node: annotation.typeAnnotation,
                    messageId: "unknownParameter",
                    data: { parameter: name },
                });
            }
        };
        return {
            ArrowFunctionExpression: checkParameters,
            FunctionDeclaration: checkParameters,
            FunctionExpression: checkParameters,
            TSCallSignatureDeclaration: checkParameters,
            TSConstructSignatureDeclaration: checkParameters,
            TSConstructorType: checkParameters,
            TSDeclareFunction: checkParameters,
            TSEmptyBodyFunctionExpression: checkParameters,
            TSFunctionType: checkParameters,
            TSMethodSignature: checkParameters,
        };
    },
});
