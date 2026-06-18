import { isIdentifierStart } from "../../../vendor/helper-validator-identifier/index.js";
export { isIdentifierStart, isIdentifierChar, isReservedWord, isStrictBindOnlyReservedWord, isStrictBindReservedWord, isStrictReservedWord, isKeyword } from "../../../vendor/helper-validator-identifier/index.js";
export const keywordRelationalOperator = /^in(stanceof)?$/;
export function isIteratorStart(current, next, next2) {
  return current === 64 && next === 64 && isIdentifierStart(next2);
}
const reservedWordLikeSet = new Set(["break", "case", "catch", "continue", "debugger", "default", "do", "else", "finally", "for", "function", "if", "return", "switch", "throw", "try", "var", "const", "while", "with", "new", "this", "super", "class", "extends", "export", "import", "null", "true", "false", "in", "instanceof", "typeof", "void", "delete", "implements", "interface", "let", "package", "private", "protected", "public", "static", "yield", "eval", "arguments", "enum", "await"]);
export function canBeReservedWord(word) {
  return reservedWordLikeSet.has(word);
}

//# sourceMappingURL=identifier.js.map
