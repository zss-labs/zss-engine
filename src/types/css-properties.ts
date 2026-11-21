import type { CSSDefs } from 'cssdefs';

type CSSVariableKey = `--${string}`;
type CSSVariableValue = `var(${CSSVariableKey})`;
type CSSVariableProperty = { [key: CSSVariableKey]: string | number };

type BaseCSSProperties = {
  [K in keyof CSSDefs]: CSSDefs[K] | CSSVariableValue;
};

type ArrayString = `[${string}`;
type ArraySelector = {
  [key in ArrayString]: BaseCSSProperties | CSSVariableProperty;
};

type ColonString = `:${string}`;
type ColonSelector = {
  [key in ColonString]: BaseCSSProperties | CSSVariableProperty;
};

type Query =
  | `@media ${string}`
  | `@container ${string}`
  | `@supports ${string}`
  | '@starting-style';

type QuerySelector = {
  [K in Query]:
    | BaseCSSProperties
    | ColonSelector
    | ArraySelector
    | CSSVariableProperty
    | QuerySelector;
};

export type CSSProperties =
  | BaseCSSProperties
  | ArraySelector
  | ColonSelector
  | QuerySelector
  | CSSVariableProperty;
