/*
 * Exercise established backing-field defects without treating arbitrary accessors
 * as storage aliases. These fixtures cover class isolation, naming conventions,
 * constructor evidence and intentional computation/delegation.
 */
import { RuleTester } from "oxlint/plugins-dev";

import { accessorFieldConsistencyRule } from "./accessor-field-consistency.ts";

// Parse TypeScript fixtures through Oxlint's own RuleTester integration.
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "wrongField" };

tester.run("anti-slop/accessor-field-consistency", accessorFieldConsistencyRule, {
  valid: [
    // An underscore-backed getter/setter pair uses its intended storage.
    "class A { _value = 1; get value() { return this._value; } set value(v: number) { this._value = v; } }",
    // ECMAScript private fields retain their distinct identity.
    "class A { #value = 1; get value() { return this.#value; } set value(v: number) { this.#value = v; } }",
    // Named getX/setX methods support an exact public field name.
    "class A { value = 1; getValue() { return this.value; } setValue(v: number) { this.value = v; } }",
    // A private underscore field follows the same unambiguous convention.
    "class A { #_value = 1; getValue() { return this.#_value; } }",
    // A direct alias without a matching backing field is intentional until proven otherwise.
    "class A { _stored = 1; get value() { return this._stored; } set value(v: number) { this._stored = v; } }",
    // A computed getter does not promise direct backing-field forwarding.
    "class A { _value = 1; _other = 2; get value() { return this._other * 2; } }",
    // A delegating getter cannot be classified from its member name alone.
    "class A { _value = 1; _other = 2; get value() { return this.read(); } read() { return this._other; } }",
    // A setter transformation is not a direct parameter assignment.
    "class A { _value = 1; _other = 2; set value(v: number) { this._other = normalize(v); } }",
    // Multi-statement dataflow is explicitly outside this conservative rule's coverage.
    "class A { _value = 1; _other = 2; get value() { const result = this._other; return result; } }",
    // A compound assignment may encode an intentional update rather than storage replacement.
    "class A { _value = 1; _other = 2; set value(v: number) { this._other += v; } }",
    // A dynamic key provides no static field identity.
    "class A { _value = 1; _other = 2; get value() { return this[key]; } }",
    // Inherited storage is unresolved without a local matching declaration.
    "class A extends B { get value() { return this._other; } }",
    // Delegating to the superclass is not a local backing-field read.
    "class A extends B { _value = 1; get value() { return super.value; } }",
    // An unknown accessed member may be inherited or provided dynamically.
    "class A extends B { _value = 1; get value() { return this.inherited; } }",
    // Multiple matching conventions do not establish a unique intended field.
    "class A { _value = 1; #value = 2; _other = 3; get value() { return this._other; } }",
    // Arbitrary case folding is not part of the supported naming convention.
    "class A { _VALUE = 1; _other = 2; get value() { return this._other; } }",
    // Static accessors do not inherit instance-field evidence.
    "class A { _value = 1; static _other = 2; static get value() { return this._other; } }",
    // Fields in another class never establish this class's backing field.
    "class A { _value = 1; } class B { _other = 2; get value() { return this._other; } }",
    // Similar but distinct accessor suffixes must not match another field name.
    "class A { _value = 1; _other = 2; getValues() { return this._other; } }",
    // A multi-input named method is not a simple storage setter.
    "class A { _value = 1; _other = 2; setValue(a: number, b: number) { this._other = a; } }",
    // Object literal accessors have no class-local storage declaration contract.
    "const obj = { get value() { return this.other; } };",
    // Direct constructor initialization supports the intended JavaScript backing field.
    "class A { constructor() { this._value = 1; } get value() { return this._value; } set value(v: number) { this._value = v; } }",
    // TypeScript parameter properties provide explicit instance storage evidence.
    "class A { constructor(private _value: number, private _other: number) {} get value() { return this._value; } }",
    // A defaulted parameter property preserves the declared property's identity.
    "class A { constructor(private _value = 1) {} get value() { return this._value; } }",
    // An ordinary constructor argument is not an instance field.
    "class A { _other = 2; constructor(_value: number) {} get value() { return this._other; } }",
    // Conditional constructor assignments are not treated as unconditional storage establishment.
    "class A { _other = 2; constructor(ready: boolean) { if (ready) { this._value = 1; } } get value() { return this._other; } }",
    // Constructor instance storage cannot establish a static accessor's intended field.
    "class A { static _other = 2; constructor() { this._value = 1; } static get value() { return this._other; } }",
  ],
  invalid: [
    // Reproduce the historical project getter while its paired setter remains correct.
    { name: "historical project getter", code: "export class AccessorMismatch { private _value = 1; private _other = 2; get value(): number { return this._other; } set value(input: number) { this._value = input; } }", errors: [error] },
    // A direct setter assigning the wrong declared field is a copy/paste defect.
    { name: "setter copy paste", code: "class A { _value = 1; _other = 2; set value(v: number) { this._other = v; } }", errors: [error] },
    // Agreement between two wrong accessors does not override matching-field evidence.
    { name: "both pair members wrong", code: "class A { _value = 1; _other = 2; get value() { return this._other; } set value(v: number) { this._other = v; } }", errors: [error, error] },
    // Both getter and setter defects are detected for ECMAScript private fields.
    { name: "private fields", code: "class A { #value = 1; #other = 2; get value() { return this.#other; } set value(v: number) { this.#other = v; } }", errors: [error, error] },
    // Private underscore-backed storage is distinguished from the unrelated public field.
    { name: "underscore private backing", code: "class A { #_value = 1; _other = 2; get value() { return this._other; } }", errors: [error] },
    // Named getX/setX methods are checked using the first-letter suffix convention.
    { name: "named methods", code: "class A { value = 1; other = 2; getValue() { return this.other; } setValue(v: number) { this.other = v; } }", errors: [error, error] },
    // Static getters/setters resolve only the class's static storage set.
    { name: "static pair", code: "class A { static _value = 1; static _other = 2; static get value() { return this._other; } static set value(v: number) { this._other = v; } }", errors: [error, error] },
    // A literal computed key still provides a statically known wrong field.
    { name: "literal property access", code: "class A { _value = 1; _other = 2; get value() { return this['_other']; } }", errors: [error] },
    // Class expressions have the same local storage contract as declarations.
    { name: "class expression", code: "const A = class { _value = 1; _other = 2; get value() { return this._other; } };", errors: [error] },
    // A nested class receives independent field evidence from its own body.
    { name: "nested independent class", code: "class A { _value = 1; get value() { return this._value; } method() { return class B { _value = 1; _other = 2; get value() { return this._other; } }; } }", errors: [error] },
    // JavaScript constructor initialization establishes both fields without declarations.
    { name: "constructor initialized pair", code: "class A { constructor() { this._value = 1; this._other = 2; } get value() { return this._other; } set value(v: number) { this._other = v; } }", errors: [error, error] },
    // Explicit parameter properties establish the intended and wrongly accessed fields.
    { name: "parameter property pair", code: "class A { constructor(private _value: number, private _other: number) {} get value() { return this._other; } set value(v: number) { this._other = v; } }", errors: [error, error] },
    // Defaulted parameter properties are storage declarations, not ordinary arguments.
    { name: "defaulted parameter property", code: "class A { constructor(private _value = 1, private _other = 2) {} get value() { return this._other; } }", errors: [error] },
    // A class field and direct constructor initialization can jointly establish storage.
    { name: "mixed declaration evidence", code: "class A { _other = 2; constructor() { this._value = 1; } get value() { return this._other; } }", errors: [error] },
  ],
});
