import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MathFormula from "../components/MathFormula";
describe("mathematical formula display", () => {
  it("renders a composite exponent entirely in superscript", () => {
    const html = renderToStaticMarkup(<MathFormula expression="e^(πx)" />);
    const exponent = html.match(/<sup>(.*?)<\/sup>/)?.[1];
    expect(exponent).toContain("π");
    expect(exponent).toContain("x");
  });
  it("leaves multiplication outside an ungrouped exponent", () => {
    const html = renderToStaticMarkup(<MathFormula expression="e^π*x" />);
    const exponent = html.match(/<sup>(.*?)<\/sup>/)?.[1];
    expect(exponent).toContain("π");
    expect(exponent).not.toContain("x");
  });
  it("shows an empty exponent slot while editing", () => {
    const html = renderToStaticMarkup(<MathFormula expression="e^()" />);
    expect(html).toContain("<sup><i>□</i></sup>");
  });
});
