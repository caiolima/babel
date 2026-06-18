// Shared class-modifier helpers extracted from typescript.js / flow.js so
// those printer modules can be deferred. Used by the always-loaded class
// printing path (classes.js) and by flow.js. Self-contained (Printer methods).
export function _tsPrintClassMemberModifiers(node) {
  const isPrivateField = node.type === "ClassPrivateProperty";
  const isPublicField = node.type === "ClassAccessorProperty" || node.type === "ClassProperty";
  printModifiersList(this, node, [isPublicField && node.declare && "declare", !isPrivateField && node.accessibility]);
  if (node.static) {
    this.word("static");
    this.space();
  }
  printModifiersList(this, node, [!isPrivateField && node.abstract && "abstract", !isPrivateField && node.override && "override", (isPublicField || isPrivateField) && node.readonly && "readonly"]);
}

function printModifiersList(printer, node, modifiers) {
  const modifiersSet = new Set();
  for (const modifier of modifiers) {
    if (modifier) modifiersSet.add(modifier);
  }
  printer.tokenMap?.find(node, tok => {
    if (modifiersSet.has(tok.value)) {
      printer.token(tok.value);
      printer.space();
      modifiersSet.delete(tok.value);
      return modifiersSet.size === 0;
    }
    return false;
  });
  for (const modifier of modifiersSet) {
    printer.word(modifier);
    printer.space();
  }
}

export function _variance(node) {
  const kind = node.variance?.kind;
  if (kind != null) {
    if (kind === "plus") {
      this.tokenChar(43);
    } else if (kind === "minus") {
      this.tokenChar(45);
    }
  }
}
