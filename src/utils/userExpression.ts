/** Normalize keyboard variants without NFKC, which would erase superscript powers. */
export function normalizeMathCharacters(input: string): string {
  return input
    .replace(/[！-～]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ")
    .replace(/[【〔]/g, "(")
    .replace(/[】〕]/g, ")")
    .replace(/[−–—﹣]/g, "-")
    .replace(/[×·⋅∙]/g, "*")
    .replace(/[÷∕]/g, "/");
}

/** Complete only trailing closing brackets; never invent an operand or discard text. */
export function completeUserExpression(input: string): {
  text: string;
  completion: string;
} {
  const text = normalizeMathCharacters(input).trim();
  let balance = 0;
  for (const char of text) {
    if (char === "(") balance++;
    if (char === ")") balance--;
    if (balance < 0) return { text, completion: "" };
  }
  if (balance > 0 && balance <= 16 && /[\wπΠ²³⁰¹⁴⁵⁶⁷⁸⁹)|]$/.test(text)) {
    const completion = ")".repeat(balance);
    return { text: text + completion, completion };
  }
  return { text, completion: "" };
}
