import type { ESTree } from "@oxlint/plugins";
type VisitorKeys = Readonly<Record<string, readonly string[]>>;
/** Collect type binders that are in scope at a node and can shadow module aliases. */
export declare function lexicalTypeParameterNames(node: ESTree.Node, visitorKeys: VisitorKeys): ReadonlySet<string>;
export {};
