import { isIdentifierName, isStrictReservedWord, isKeyword } from "../../../vendor/helper-validator-identifier/index.js";
export default function isValidIdentifier(name, reserved = true) {
  if (typeof name !== "string") return false;
  if (reserved) {
    if (isKeyword(name) || isStrictReservedWord(name, true)) {
      return false;
    }
  }
  return isIdentifierName(name);
}

//# sourceMappingURL=isValidIdentifier.js.map
