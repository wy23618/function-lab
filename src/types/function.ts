export interface Domain {
  min: number;
  max: number;
  minInclusive: boolean;
  maxInclusive: boolean;
}
export interface GraphPoint {
  x: number;
  y: number;
  label?: string;
}
export interface TransformOperation {
  label: string;
  rule: string;
  explanation: string;
  from: string;
  to: string;
}
export interface FunctionDefinition {
  id: string;
  name: string;
  originalExpression: string;
  currentExpression: string;
  variable?: string;
  parameters?: Record<string, number>;
  bindings?: Record<string, FunctionDefinition>;
  liveBindings?: Record<string, string>;
  alias?: string;
  color: string;
  visible: boolean;
  locked: boolean;
  domain: Domain;
  domainConstraints?: { expression: string; domain: Domain }[];
  differentiabilityChecks?: {
    expression: string;
    argument: string;
    source?: FunctionDefinition;
  }[];
  lineStyle: "solid" | "dashed";
  kind: "function" | "relation";
  parentFunctionId?: string;
  transformHistory: TransformOperation[];
  source?: FunctionDefinition;
  reflection?: { a: number; b: number; c: number };
}
export interface Viewport {
  cx: number;
  cy: number;
  scale: number;
}
export const ALL_DOMAIN: Domain = {
  min: -Infinity,
  max: Infinity,
  minInclusive: false,
  maxInclusive: false,
};
