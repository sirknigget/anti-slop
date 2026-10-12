/*
 * Defines React prop contracts for real Oxlint plugin tests.
 * Covers static types, runtime PropTypes, defaults, and indirect prop consumers.
 */
// Keeps each fixture independent from application imports and build output.
export const fixtures = {
  "reject": [
    // Rejects a typed class prop that its render method does not consume.
    {
      "name": "unused-class-ts",
      "rule": "no-unused-prop-types",
      "code": "import React from 'react'; type Props = { name: string }; export class Hello extends React.Component<Props> { render() { return <div>Hello</div>; } }"
    },
    // Rejects a declared function prop omitted by its destructured parameter.
    {
      "name": "unused-function-ts",
      "rule": "no-unused-prop-types",
      "code": "type Props = { used: string; unused: string }; export function Hello({ used }: Props) { return <div>{used}</div>; }"
    },
    // Rejects a runtime PropType that a class does not consume.
    {
      "name": "unused-runtime",
      "rule": "no-unused-prop-types",
      "code": "import React from 'react'; import PropTypes from 'prop-types'; export class Hello extends React.Component { static propTypes = { name: PropTypes.string }; render() { return <div>Hello</div>; } }"
    },
    // Rejects a default value for a required TypeScript prop.
    {
      "name": "required-default-ts",
      "rule": "default-props-match-prop-types",
      "code": "type Props = { name: string }; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { name: 'hello' };"
    },
    // Rejects a default key absent from the TypeScript prop declaration.
    {
      "name": "missing-default-ts",
      "rule": "default-props-match-prop-types",
      "code": "type Props = { name?: string }; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { other: 'hello' };"
    },
    // Rejects a default value for an isRequired runtime PropType.
    {
      "name": "required-default-runtime",
      "rule": "default-props-match-prop-types",
      "code": "import PropTypes from 'prop-types'; export function Hello({ name }) { return <div>{name}</div>; } Hello.propTypes = { name: PropTypes.string.isRequired }; Hello.defaultProps = { name: 'hello' };"
    },
    // Rejects a default key absent from runtime PropTypes.
    {
      "name": "missing-default-runtime",
      "rule": "default-props-match-prop-types",
      "code": "import PropTypes from 'prop-types'; export function Hello({ name }) { return <div>{name}</div>; } Hello.propTypes = { name: PropTypes.string }; Hello.defaultProps = { other: 'hello' };"
    },
    // Rejects the remaining unused prop when a typed factory reads a different prop.
    {
      name: "decorator-does-not-hide-other-unused",
      rule: "no-unused-prop-types",
      code: "declare function track<P>(mapper: (props: P) => Record<string, unknown>): <T>(target: T) => T; type Props = { name: string; unused: string }; function Hello(props: Props) { return <div>Hello</div>; } export const TrackedHello = track((trackedProps: Props) => ({ name: trackedProps.name }))(Hello);"
    },
    // Rejects a real unused prop when only a shadowed helper parameter is forwarded.
    {
      name: "shadowed-parameter-not-consumed",
      rule: "no-unused-prop-types",
      code: "import { consume } from './helpers'; type Props = { name: string }; export function Hello(props: Props) { function helper(props: { other: string }) { consume(props); } helper({ other: 'x' }); return <div>Hello</div>; }"
    },
    // Rejects one unused component even when another component forwards the shared props type.
    {
      name: "shared-type-unused-component",
      rule: "no-unused-prop-types",
      code: "import React from 'react'; import { consume } from './helpers'; type Props = { name: string }; export class Used extends React.Component<Props> { render() { return <div>{consume(this.props)}</div>; } } export class Unused extends React.Component<Props> { render() { return <div>Hello</div>; } }"
    },
    // Rejects props with no consumer in an unrelated typed factory callback.
    {
      name: "unrelated-typed-callback",
      rule: "no-unused-prop-types",
      code: "type Props = { name: string }; export function Hello(props: Props) { return <div>Hello</div>; } export const unrelated = (props: Props) => ({ name: props.name });"
    },
    // Rejects an inherited interface member that remains unused by the component.
    {
      name: "unused-interface-extension",
      rule: "no-unused-prop-types",
      code: "interface Base { name: string } interface Props extends Base { used: string } export function Hello({ used }: Props) { return <div>{used}</div>; }"
    },
    // Rejects a field preserved by transparent nested generic aliases.
    {
      name: "unused-generic-alias",
      rule: "no-unused-prop-types",
      code: "type Identity<T> = T; type Wrapped<U> = Identity<U>; type Props = Readonly<Wrapped<{ name: string }>>; export function Hello(props: Props) { return <div>Hello</div>; }"
    },
    // Rejects a field selected by the local Pick form used in the frontend.
    {
      name: "unused-finite-pick",
      rule: "no-unused-prop-types",
      code: "type All = { name: string; ignored: number }; type Props = Pick<All, 'name'>; export function Hello(props: Props) { return <div>Hello</div>; }"
    },
    // Rejects a field declared through a finite utility in interface heritage.
    {
      name: "unused-interface-pick-extension",
      rule: "no-unused-prop-types",
      code: "type Base = { name: string; ignored: number }; interface Props extends Pick<Base, 'name'> { used: string } export function Hello({ used }: Props) { return <div>{used}</div>; }"
    },
    // Rejects an unread field removed from an otherwise forwarded rest object.
    {
      name: "unused-excluded-rest-prop",
      rule: "no-unused-prop-types",
      code: "import { Child } from './child'; type Props = { name: string; other: string }; export function Hello({ name, ...rest }: Props) { return <Child {...rest} />; }"
    },
    // Rejects an unused class field despite normal React superclass initialization.
    {
      name: "unused-constructor-super-prop",
      rule: "no-unused-prop-types",
      code: "import React from 'react'; type Props = { name: string }; export class Hello extends React.Component<Props> { constructor(props: Props) { super(props); } render() { return <div>Hello</div>; } }"
    },
    // Rejects an instance prop when a static method reads a different static props object.
    {
      name: "unused-instance-prop-static-receiver",
      rule: "no-unused-prop-types",
      code: "import React from 'react'; type Props = { name: string }; export class Hello extends React.Component<Props> { static props = { name: 'other' }; static label() { return this.props.name; } render() { return <div>Hello</div>; } }"
    },
    // Rejects a subclass prop when its own render method replaces the parent's consumer.
    {
      name: "unused-overridden-parent-render",
      rule: "no-unused-prop-types",
      code: "import React from 'react'; type Props = { name: string }; class Base extends React.Component<Props> { render() { return <div>{this.props.name}</div>; } } export class Hello extends Base { render() { return <div>Hello</div>; } }"
    },
    // Rejects an unused prop on an explicitly typed function component that returns null.
    {
      name: "unused-null-function-component-alias",
      rule: "no-unused-prop-types",
      code: "import type { FC as FunctionType } from 'react'; type Props = { name: string }; type Widget<P> = FunctionType<P>; export const Hello: Widget<Props> = () => null;"
    },
    // Rejects a public FC prop omitted by the function's narrower parameter annotation.
    {
      name: "unused-public-fc-prop",
      rule: "no-unused-prop-types",
      code: "import type { FC } from 'react'; type Props = { name: string; unused: string }; export const Hello: FC<Props> = ({ name }: Pick<Props, 'name'>) => <div>{name}</div>;"
    },
    // Rejects a prop through the memo component-type overload without losing its parameter type.
    {
      name: "unused-memo-typeof-component",
      rule: "no-unused-prop-types",
      code: "import { memo } from 'react'; type Props = { name: string }; function Hello(props: Props) { return <div>Hello</div>; } export const MemoHello = memo<typeof Hello>(Hello);"
    },
    // Rejects an unused declared field across a local discriminated union.
    {
      name: "unused-local-union-prop",
      rule: "no-unused-prop-types",
      code: "type Props = { kind: 'one'; name: string } | { kind: 'two' }; export function Hello({ kind }: Props) { return <div>{kind}</div>; }"
    },
    // Rejects an unused field in an anonymous default-exported component.
    {
      name: "unused-anonymous-default-component",
      rule: "no-unused-prop-types",
      code: "type Props = { name: string }; export default function(props: Props) { return <div>Hello</div>; }"
    },
    // Rejects an unknown key in a complete interface contract.
    {
      name: "missing-interface-default",
      rule: "default-props-match-prop-types",
      code: "interface Base { name?: string } interface Props extends Base {} export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { other: 'Hello' };"
    },
    // Rejects defaults for required props inherited through a local interface.
    {
      name: "required-interface-default",
      rule: "default-props-match-prop-types",
      code: "interface Base { name: string } interface Props extends Base {} export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { name: 'Hello' };"
    },
    // Rejects required runtime defaults stored in a static React class field.
    {
      name: "required-runtime-class-default",
      rule: "default-props-match-prop-types",
      code: "import React from 'react'; import P from 'prop-types'; export class Hello extends React.Component { static propTypes = { name: P.string.isRequired }; static defaultProps = { name: 'Hello' }; render() { return <div>{this.props.name}</div>; } }"
    },
    // Rejects an inherited runtime contract even when the subclass's static type is optional.
    {
      name: "required-inherited-runtime-default",
      rule: "default-props-match-prop-types",
      code: "import React from 'react'; import P from 'prop-types'; type Props = { name?: string }; class Base extends React.Component<Props> { static propTypes = { name: P.string.isRequired }; render() { return <div>{this.props.name}</div>; } } export class Hello extends Base { static defaultProps = { name: 'Hello' }; }"
    },
    // Rejects a required runtime default despite an optional TypeScript declaration.
    {
      name: "required-runtime-despite-optional-types",
      rule: "default-props-match-prop-types",
      code: "import P from 'prop-types'; type Props = { name?: string }; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.propTypes = { name: P.string.isRequired }; Hello.defaultProps = { name: 'Hello' };"
    },
    // Rejects a missing runtime declaration even when TypeScript declares that optional default.
    {
      name: "missing-runtime-despite-static-type",
      rule: "default-props-match-prop-types",
      code: "import P from 'prop-types'; type Props = { name?: string }; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.propTypes = { other: P.string }; Hello.defaultProps = { name: 'Hello' };"
    },
    // Rejects a known required default without hiding it behind an unresolved spread.
    {
      name: "required-default-with-unresolved-spread",
      rule: "default-props-match-prop-types",
      code: "import extra from './defaults'; type Props = { name: string }; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { name: 'Hello', ...extra };"
    }
  ],
  "pass": [
    // Accepts a typed class prop read through this.props.
    {
      "name": "used-class-ts",
      "code": "import React from 'react'; type Props = { name: string }; export class Hello extends React.Component<Props> { render() { return <div>{this.props.name}</div>; } }"
    },
    // Accepts a modern optional prop with a destructured parameter default.
    {
      "name": "modern-default-ts",
      "code": "type Props = { name?: string }; export function Hello({ name = 'hello' }: Props) { return <div>{name}</div>; }"
    },
    // Accepts a legacy default for an optional TypeScript prop.
    {
      "name": "optional-default-ts",
      "code": "type Props = { name?: string }; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { name: 'hello' };"
    },
    // Accepts a legacy default for a non-required runtime PropType.
    {
      "name": "optional-default-runtime",
      "code": "import PropTypes from 'prop-types'; export function Hello({ name }) { return <div>{name}</div>; } Hello.propTypes = { name: PropTypes.string }; Hello.defaultProps = { name: 'hello' };"
    },
    // Accepts a consumed typed prop inside the maintained memo component pattern.
    {
      "name": "memo-ts",
      "code": "import { memo } from 'react'; type Props = { name: string }; export const Hello = memo(function Hello({ name }: Props) { return <div>{name}</div>; });"
    },
    // Accepts a consumed typed prop inside a forwardRef callback.
    {
      "name": "forward-ref-ts",
      "code": "import { forwardRef } from 'react'; type Props = { name: string }; export const Hello = forwardRef<HTMLDivElement, Props>((props, ref) => <div ref={ref}>{props.name}</div>);"
    },
    // Accepts a class prop read with an aliased React import.
    {
      "name": "import-alias-ts",
      "code": "import R from 'react'; type Props = { name: string }; export class Hello extends R.Component<Props> { render() { return <div>{this.props.name}</div>; } }"
    },
    // Accepts a prop read through a destructured local alias.
    {
      "name": "prop-alias-ts",
      "code": "type Props = { name: string }; export function Hello(props: Props) { const { name: label } = props; return <div>{label}</div>; }"
    },
    // Accepts the catalog's whole-this.props helper delegation example.
    {
      "name": "whole-props-helper-ts",
      "code": "import React from 'react'; import { getLabel } from './helpers'; type Props = { name: string }; export class Hello extends React.Component<Props> { render() { return <div>{getLabel(this.props)}</div>; } }"
    },
    // Accepts the catalog's typed decorator factory callback consumer.
    {
      "name": "typed-decorator-ts",
      "code": "declare function track<P>(mapper: (props: P) => Record<string, unknown>): <T>(target: T) => T; type Props = { name: string }; function Hello(props: Props) { return <div>Hello</div>; } export const TrackedHello = track((trackedProps: Props) => ({ name: trackedProps.name }))(Hello);"
    },
    // Accepts a function that passes its entire typed props object to a helper.
    {
      name: "whole-function-props-helper",
      code: "import { consume } from './helpers'; type Props = { name: string }; export function Hello(props: Props) { return <div>{consume(props)}</div>; }"
    },
    // Accepts whole props forwarded to a JSX component.
    {
      name: "jsx-props-forwarding",
      code: "import { Child } from './child'; type Props = { name: string }; export function Hello(props: Props) { return <Child {...props} />; }"
    },
    // Accepts whole props forwarded from a typed decorator factory callback.
    {
      name: "decorator-props-helper",
      code: "import { consume } from './helpers'; declare function track<P>(mapper: (props: P) => Record<string, unknown>): <T>(target: T) => T; type Props = { name: string }; function Hello(props: Props) { return <div>Hello</div>; } export const TrackedHello = track((trackedProps: Props) => consume(trackedProps))(Hello);"
    },
    // Accepts a transparent local alias when the typed factory consumes the same declaration.
    {
      name: "decorator-local-type-alias",
      code: "declare function track<P>(mapper: (props: P) => Record<string, unknown>): <T>(target: T) => T; type Base = { name: string }; type Props = Base; function Hello(props: Props) { return <div>Hello</div>; } export const TrackedHello = track((trackedProps: Base) => ({ name: trackedProps.name }))(Hello);"
    },
    // Accepts all local inherited interface fields when each has a real read.
    {
      name: "used-interface-extension",
      code: "interface Base { name: string } interface Props extends Base { other: string } export function Hello({ name, other }: Props) { return <div>{name}{other}</div>; }"
    },
    // Accepts the local finite Pick declaration form used by frontend fields.
    {
      name: "used-finite-pick",
      code: "type All = { name: string; ignored: number }; type Props = Pick<All, 'name'>; export function Hello({ name }: Props) { return <div>{name}</div>; }"
    },
    // Accepts finite Pick interface heritage without treating excluded fields as props.
    {
      name: "used-interface-pick-extension",
      code: "type Base = { name: string; ignored: number }; interface Props extends Pick<Base, 'name'> { other: string } export function Hello({ name, other }: Props) { return <div>{name}{other}</div>; }"
    },
    // Accepts captured nested generic substitutions rather than resolving a shadowed parameter by name.
    {
      name: "used-nested-generic-alias",
      code: "type Identity<T> = T; type Outer<T> = Identity<Readonly<T>>; type Props = Outer<{ name: string }>; export function Hello({ name }: Props) { return <div>{name}</div>; }"
    },
    // Accepts finite Omit and Partial defaults when the retained prop is optional.
    {
      name: "optional-omit-partial-default",
      code: "type All = { name: string; ignored: number }; type Props = Partial<Omit<All, 'ignored'>>; export function Hello({ name }: Props) { return <div>{name}</div>; } Hello.defaultProps = { name: 'Hello' };"
    },
    // Accepts local constant runtime metadata and resolved object spreads.
    {
      name: "constant-runtime-metadata-spreads",
      code: "import P from 'prop-types'; const baseTypes = { name: P.string }; const types = { ...baseTypes }; const defaults = { name: 'Hello' }; export function Hello({ name }) { return <div>{name}</div>; } Hello.propTypes = types; Hello.defaultProps = { ...defaults };"
    },
    // Accepts an inherited render consumer on a known local React subclass.
    {
      name: "inherited-render-consumer",
      code: "import React from 'react'; type Props = { name: string }; class Base extends React.Component<Props> { render() { return <div>{this.props.name}</div>; } } export class Hello extends Base {}"
    },
    // Accepts an explicit super render call instead of discarding the parent's real consumer.
    {
      name: "explicit-super-render-consumer",
      code: "import React from 'react'; type Props = { name: string }; class Base extends React.Component<Props> { render() { return <div>{this.props.name}</div>; } } export class Hello extends Base { render() { return super.render(); } }"
    },
    // Accepts an immutable local React namespace alias with real prop consumption.
    {
      name: "local-react-namespace-alias",
      code: "import React from 'react'; const R = React; type Props = { name: string }; export class Hello extends R.Component<Props> { render() { return <div>{this.props.name}</div>; } }"
    },
    // Accepts a props alias that forwards the original object to a helper.
    {
      name: "local-props-value-alias",
      code: "import { consume } from './helpers'; type Props = { name: string }; export function Hello(props: Props) { const alias = props; return <div>{consume(alias)}</div>; }"
    },
    // Accepts a renamed class destructuring binding with a real JSX read.
    {
      name: "class-props-destructuring-alias",
      code: "import React from 'react'; type Props = { name: string }; export class Hello extends React.Component<Props> { render() { const { name: label } = this.props; return <div>{label}</div>; } }"
    },
    // Accepts a consumed excluded field and separately forwarded remaining props.
    {
      name: "consumed-rest-exclusion",
      code: "import { Child } from './child'; type Props = { name: string; other: string }; export function Hello({ name, ...rest }: Props) { return <div>{name}<Child {...rest} /></div>; }"
    },
    // Accepts only common union keys under keyof rather than inventing variant-specific Pick fields.
    {
      name: "pick-keyof-union-common-keys",
      code: "type All = { kind: 'one'; one: string } | { kind: 'two'; two: string }; type Props = Pick<All, keyof All>; export function Hello({ kind }: Props) { return <div>{kind}</div>; }"
    },
    // Accepts optional forbidden props expressed through transparent local never aliases.
    {
      name: "forbidden-never-prop-alias",
      code: "type Forbidden = never; type Props = { name: string; children?: Forbidden }; export function Hello({ name }: Props) { return <div>{name}</div>; }"
    },
    // Accepts a destructured typed factory callback that actually consumes the target's prop.
    {
      name: "destructured-factory-consumer",
      code: "declare function track<P>(mapper: (props: P) => Record<string, unknown>): <T>(target: T) => T; type Props = { name: string }; function Hello(props: Props) { return <div>Hello</div>; } export const TrackedHello = track(({ name }: Props) => ({ name }))(Hello);"
    },
    // Accepts a typed class decorator callback with the same local prop declaration.
    {
      name: "class-decorator-consumer",
      code: "import React from 'react'; declare function track<P>(mapper: (props: P) => Record<string, unknown>): <T>(target: T) => T; type Props = { name: string }; @track((props: Props) => ({ name: props.name })) export class Hello extends React.Component<Props> { render() { return <div>Hello</div>; } }"
    },
    // Accepts optional props and children in the explicit modern React utility.
    {
      name: "props-with-children",
      code: "import type { PropsWithChildren } from 'react'; type Props = PropsWithChildren<{ name: string }>; export function Hello({ name, children }: Props) { return <div>{name}{children}</div>; }"
    },
    // Does not reinterpret ordinary classes with JSX-returning methods as React components.
    {
      name: "ordinary-class-not-react",
      code: "type Props = { name: string }; class Base {} export class Ordinary extends Base { props!: Props; render() { return <div>Hello</div>; } }"
    },
    // Does not reinterpret typed array map callback records as React prop declarations.
    {
      name: "typed-map-callback-not-component",
      code: "type Row = { id: string; name: string }; const rows: Row[] = []; export function List() { return rows.map((row: Row) => <div>{row.name}</div>); }"
    },
    // Does not flag the broader typed input of a local lower-case JSX helper.
    {
      name: "local-jsx-helper-not-component",
      code: "type Props = { name: string; other: string }; function label(props: Props) { return <span>{props.name}</span>; } export function Hello(props: Props) { return <div>{label(props)}{props.other}</div>; }"
    },
    // Accepts a lower-case component implementation when a local JSX alias establishes its role.
    {
      name: "local-jsx-component-alias",
      code: "type Props = { name: string }; function implementation({ name }: Props) { return <div>{name}</div>; } const Alias = implementation; export function App() { return <Alias name='Hello' />; }"
    },
    // Does not invent requiredness for an earlier runtime validator that an unknown spread can replace.
    {
      name: "unknown-spread-runtime-requiredness",
      code: "import P from 'prop-types'; import extra from './types'; export function Hello({ name }) { return <div>{name}</div>; } Hello.propTypes = { name: P.string.isRequired, ...extra }; Hello.defaultProps = { name: 'Hello' };"
    }
  ]
};
