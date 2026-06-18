import * as generatorFunctions from "./generators/index.js";
import defer * as _tsGen from "./generators/typescript.js";
import defer * as _flowGen from "./generators/flow.js";
const generatorInfosMap = new Map();
const TS_KEYS = new Set(["TSAnyKeyword","TSArrayType","TSAsExpression","TSBigIntKeyword","TSBooleanKeyword","TSCallSignatureDeclaration","TSClassImplements","TSConditionalType","TSConstructSignatureDeclaration","TSConstructorType","TSDeclareFunction","TSDeclareMethod","TSEnumBody","TSEnumDeclaration","TSEnumMember","TSExportAssignment","TSExternalModuleReference","TSFunctionType","TSImportEqualsDeclaration","TSImportType","TSIndexSignature","TSIndexedAccessType","TSInferType","TSInstantiationExpression","TSInterfaceBody","TSInterfaceDeclaration","TSInterfaceHeritage","TSIntersectionType","TSIntrinsicKeyword","TSLiteralType","TSMappedType","TSMethodSignature","TSModuleBlock","TSModuleDeclaration","TSNamedTupleMember","TSNamespaceExportDeclaration","TSNeverKeyword","TSNonNullExpression","TSNullKeyword","TSNumberKeyword","TSObjectKeyword","TSOptionalType","TSParameterProperty","TSParenthesizedType","TSPropertySignature","TSQualifiedName","TSRestType","TSSatisfiesExpression","TSStringKeyword","TSSymbolKeyword","TSTemplateLiteralType","TSThisType","TSTupleType","TSTypeAliasDeclaration","TSTypeAnnotation","TSTypeAssertion","TSTypeLiteral","TSTypeOperator","TSTypeParameter","TSTypeParameterDeclaration","TSTypeParameterInstantiation","TSTypePredicate","TSTypeQuery","TSTypeReference","TSUndefinedKeyword","TSUnionType","TSUnknownKeyword","TSVoidKeyword"]);
const FLOW_KEYS = new Set(["AnyTypeAnnotation","ArrayTypeAnnotation","BigIntLiteralTypeAnnotation","BooleanLiteralTypeAnnotation","BooleanTypeAnnotation","ClassImplements","DeclareClass","DeclareExportAllDeclaration","DeclareExportDeclaration","DeclareFunction","DeclareInterface","DeclareModule","DeclareModuleExports","DeclareOpaqueType","DeclareTypeAlias","DeclareVariable","DeclaredPredicate","EmptyTypeAnnotation","EnumBooleanBody","EnumBooleanMember","EnumDeclaration","EnumDefaultedMember","EnumNumberBody","EnumNumberMember","EnumStringBody","EnumStringMember","EnumSymbolBody","ExistsTypeAnnotation","FunctionTypeAnnotation","FunctionTypeParam","GenericTypeAnnotation","IndexedAccessType","InferredPredicate","InterfaceDeclaration","InterfaceExtends","InterfaceTypeAnnotation","IntersectionTypeAnnotation","MixedTypeAnnotation","NullLiteralTypeAnnotation","NullableTypeAnnotation","NumberLiteralTypeAnnotation","NumberTypeAnnotation","ObjectTypeAnnotation","ObjectTypeCallProperty","ObjectTypeIndexer","ObjectTypeInternalSlot","ObjectTypeProperty","ObjectTypeSpreadProperty","OpaqueType","OptionalIndexedAccessType","QualifiedTypeIdentifier","StringLiteralTypeAnnotation","StringTypeAnnotation","SymbolTypeAnnotation","ThisTypeAnnotation","TupleTypeAnnotation","TypeAlias","TypeAnnotation","TypeCastExpression","TypeParameter","TypeParameterDeclaration","TypeParameterInstantiation","TypeofTypeAnnotation","UnionTypeAnnotation","Variance","VoidTypeAnnotation"]);
const allKeys = [
  ...new Set([...Object.keys(generatorFunctions), ...TS_KEYS, ...FLOW_KEYS]),
].sort();
let index = 0;
for (const key of allKeys) {
  if (key.startsWith("_")) continue;
  let fn;
  if (TS_KEYS.has(key)) {
    fn = function (...a) { return _tsGen[key].apply(this, a); };
  } else if (FLOW_KEYS.has(key)) {
    fn = function (...a) { return _flowGen[key].apply(this, a); };
  } else {
    fn = generatorFunctions[key];
  }
  generatorInfosMap.set(key, [fn, index++, undefined]);
}
export { generatorInfosMap };
