import type { ESTree } from "@oxlint/plugins";
import { type TypeAliasEnvironment as LexicalTypeAliasEnvironment } from "./type-alias-resolution.ts";
export type UnsafeDictionary = {
    readonly kind: "unsafe-dictionary";
    readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown";
};
export type WideningTargetKind = "anonymous object" | "generic container" | "object" | "open dictionary" | "unknown";
export type WideningTarget = {
    readonly kind: WideningTargetKind;
};
export type TypeEnvironment = {
    readonly interfaces: ReadonlyMap<string, readonly ESTree.TSInterfaceDeclaration[]>;
    readonly typeAliases: LexicalTypeAliasEnvironment;
};
export declare function createTypeEnvironment(program: ESTree.Program, visitorKeys: Readonly<Record<string, readonly string[]>>): TypeEnvironment;
export declare function classifyUnsafeDictionaryValue(valueType: ESTree.TSType, environment: TypeEnvironment): UnsafeDictionary | null;
export declare function classifyUnsafeDictionary(type: ESTree.TSType, environment: TypeEnvironment): UnsafeDictionary | null;
export declare function classifyWideningTarget(type: ESTree.TSType, environment: TypeEnvironment): WideningTarget | null;
export declare function isPopulatedObjectExpression(expression: ESTree.Expression): boolean;
export declare function isKnownEvidenceExpression(expression: ESTree.Expression): boolean;
