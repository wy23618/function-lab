import type { Domain } from "../types/function";
export function formatDomain(domain: Domain): string {
  const format = (value: number) =>
    value === -Infinity
      ? "−∞"
      : value === Infinity
        ? "+∞"
        : Number(value.toPrecision(8)).toString();
  return `${domain.minInclusive ? "[" : "("}${format(domain.min)}, ${format(domain.max)}${domain.maxInclusive ? "]" : ")"}`;
}
