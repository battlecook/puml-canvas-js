// PlantUML ebnf examples extracted from https://plantuml.com/en/ebnf.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface EbnfSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_EBNF_LIST: ReadonlyArray<EbnfSample> = [
  {
    title: '1. Minimal binary diagram',
    source: `@startebnf
binaryDigit = "0" | "1";
@endebnf`,
  },
  {
    title: '2. All EBNF Elements',
    source: `@startebnf
title All EBNF elements managed by PlantUML
(* Nodes *)
litteral = "a";
special = ? a ?;
rule = a;
(* Edges *)
required = a;
optional = [a];
zero_or_more = {a};
one_or_more = a, {a};
one_or_more_ebnf = {a}-;
zero_or_more_with_separator = [a, {',', a}];
one_or_more_with_separator = a, {',', a};
zero_or_more_with_terminator = {a, ','};
one_or_more_with_terminator = a, ',', {a, ','};
one_or_more_with_terminator_ebnf = {a, ','}-;
alternative = a | b;
group = (a | b) , c;
without_group = a | b , c;
@endebnf`,
  },
  {
    title: '3. Special sequence management with `special-sequence-symbol "?"`',
    source: `@startebnf
(* Example from §8.1 ISO-EBNF *)
h-tab = ? IS0 6429 character Horizontal Tabulation ? ;
new-line = { ? IS0 6429 character Carriage Return ? }, ? IS0 6429 character Line Feed ?, { ? IS0 6429 character Carriage Return ? };
(* Other possible examples: *)
h-tab = ?Unicode U+0009?;
empty-special = ??;
@endebnf`,
  },
  {
    title: '4. Full repetition management with `repetition-symbol "*"`',
    source: `@startebnf
(* Simplified Fortran example *)
Fortran_77_continuation_line = 5 * " ", '[...]', 66 * [character];
(* Minimal test *)
test = 4 * '2';
(* Example of §5.7 Syntactic-factor of ISO EBNF *)
aa = "A";
bb = 3 * aa, "B";
cc = 3 * [aa], "C";
dd = {aa}, "D";
ee = aa, {aa}, "E";
ff = 3 * aa, 3 * [aa], "F";
gg = 3 * {aa}, "D";
@endebnf`,
  },
  {
    title: '5. Drawing mode (Expanded mode)',
    source: `@startebnf
title Expanded mode
zero_or_more = {a};
one_or_more = a, {a};
one_or_more_ebnf = {a}-;
zero_or_more_with_separator = [a, {',', a}];
one_or_more_with_separator = a, {',', a};
zero_or_more_with_terminator = {a, ','};
one_or_more_with_terminator = a, ',', {a, ','};
@endebnf`,
  },
  {
    title: '6. Drawing mode (Compacted mode)',
    source: `@startebnf
!pragma compact
title Compacted mode
zero_or_more = {a};
one_or_more = a, {a};
one_or_more_ebnf = {a}-;
zero_or_more_with_separator = [a, {',', a}];
one_or_more_with_separator = a, {',', a};
zero_or_more_with_terminator = {a, ','};
one_or_more_with_terminator = a, ',', {a, ','};
@endebnf`,
  },
  {
    title: '7. Notes on Elements',
    source: `@startebnf
title Comments
(* Notes for Rule1 *)
Rule1 = {"a-z" (* any letter *)};
(* Notes for Rule2 *)
Rule2 =;
(* Additional notes and references *)
@endebnf`,
  },
  {
    title: '8. Using (global) style (Without style)',
    source: `@startebnf
title Title not_styled_ebnf
not_styled_ebnf = {"a", c , "a" (* Note on a *)} | ? special ? | "repetition", 4 * '2';
(* Global End Note *)
@endebnf`,
  },
  {
    title: '9. Using (global) style (With style)',
    source: `@startebnf
<style>
element {
  ebnf {
    LineColor blue
    Fontcolor green
    Backgroundcolor palegreen
    note {
      Backgroundcolor pink
    }
  }
}
</style>
title Title styled_ebnf
styled_ebnf = {"a", c , "a" (* Note on a *)} | ? special ? | "repetition", 4 * '2';
(* Global End Note *)
@endebnf`,
  },
  {
    title: '10. Example of LISP Grammar',
    source: `@startebnf
title LISP Grammar
grammars_expression = atomic_symbol | "(", s_expression, ".", s_expression, ")" | list;
list = "(", s_expression, { s_expression }, ")";
atomic_symbol = letter, atom_part;
atom_part = empty | letter, atom_part | number, atom_part;
letter = ? a-z ?;
number = ? 1-9 ?;
empty = " ";
@endebnf`,
  },
  {
    title: '11. EBNF of PlantUMLs EBNF Grammar',
    source: `@startebnf
grammar = { rule };
rule = lhs , "=" (* definition *) , rhs , ";" (* termination *);
lhs = identifier ;
rhs = identifier | terminal | "[" , rhs (* optional *) , "]" | "{" , rhs (* repetition *), "}" | "(" , rhs (* grouping *) , ")" | "(*" , string (* comment *) , "*)" | "?" , rhs (* special sequence, aka notation *) , "?" | rhs , "|" (* alternation *) , rhs | rhs , "," (* concatenation *), rhs ;
identifier = letter , { letter | digit | "_" } ;
terminal = "'" , character , { character } , "'" | '"' , character , { character } , '"' ;
character = letter | digit | symbol | "_" ;
symbol = "[" | "]" | "{" | "}" | "(" | ")" | "<" | ">" | "'" | '"' | "=" | "|" | "." | "," | ";" ;
digit = ? 0-9 ? ;
letter = ? A-Z or a-z ? ;
@endebnf`,
  },
  {
    title: '12. Java Language Specification (Packages and Modules)',
    source: `@startebnf
CompilationUnit = OrdinaryCompilationUnit | ModularCompilationUnit;
OrdinaryCompilationUnit = [PackageDeclaration], {ImportDeclaration}, {TopLevelClassOrInterfaceDeclaration};
ModularCompilationUnit = {ImportDeclaration}, ModuleDeclaration;
PackageDeclaration = {PackageModifier}, "package", Identifier, {Identifier}, ";";
PackageModifier = Annotation;
ImportDeclaration = SingleTypeImportDeclaration | TypeImportOnDemandDeclaration | SingleStaticImportDeclaration | StaticImportOnDemandDeclaration;
SingleTypeImportDeclaration = "import", TypeName, ";";
TypeImportOnDemandDeclaration = "import", PackageOrTypeName, ".*", ";";
SingleStaticImportDeclaration = "import", "static", TypeName, ".", Identifier, ";";
StaticImportOnDemandDeclaration = "import", "static", TypeName, ".*", ";";
TopLevelClassOrInterfaceDeclaration = (ClassDeclaration | InterfaceDeclaration), ";";
ModuleDeclaration = {Annotation}, [open], "module", Identifier, {Identifier}, "{", {ModuleDirective}, "}";
ModuleDirective = ("requires", {RequiresModifier}, ModuleName, ";") | ("exports", PackageName, ["to", ModuleName, {",", ModuleName}], ";") | ("opens", PackageName, ["to", ModuleName, {",", ModuleName}], ";") | ("uses", TypeName, ";") | ("provides", TypeName, "with", TypeName, {",", TypeName}, ";");
RequiresModifier = "transitive" | "static";
@endebnf`,
  },
  {
    title: '13. Java Language Specification (Lexical Structure)',
    source: `@startebnf
Identifier = ?IdentifierChars but not a ReservedKeyword or BooleanLiteral or NullLiteral?;
IdentifierChars = JavaLetter, {JavaLetterOrDigit};
JavaLetter = ? any Unicode character that is a "Java letter" ?;
JavaLetterOrDigit = ? any Unicode character that is a "Java letter-or-digit" ?;
TypeIdentifier = ? Identifier but not permits, record, sealed, var, or yield ?;
UnqualifiedMethodIdentifier = ? Identifier but not yield ?;
Literal = IntegerLiteral | FloatingPointLiteral | BooleanLiteral | CharacterLiteral | StringLiteral | TextBlock | NullLiteral;
@endebnf`,
  },
  {
    title: '14. Java Language Specification (Types, Values, and Variables)',
    source: `@startebnf
Type = PrimitiveType | ReferenceType;
PrimitiveType = [Annotation], (NumericType | boolean );
NumericType = IntegralType | FloatingPointType;
IntegralType = "byte" | "short" | "int" | "long" | "char";
FloatingPointType = "float" | "double";
ReferenceType = ClassOrInterfaceType | TypeVariable | ArrayType;
ClassOrInterfaceType = ClassType | InterfaceType;
ClassType = {Annotation}, TypeIdentifier, [TypeArguments];
PackageName = {Annotation}, TypeIdentifier, [TypeArguments];
ClassOrInterfaceType = {Annotation}, TypeIdentifier, [TypeArguments];
InterfaceType = ClassType;
TypeVariable = {Annotation}, TypeIdentifier;
ArrayType = (PrimitiveType | ClassOrInterfaceType | TypeVariable), Dims;
Dims= {Annotation}, "[", "]", {{Annotation}, "[", "]"};
TypeParameter = {TypeParameterModifier}, TypeIdentifier, [TypeBound];
TypeParameterModifier = Annotation;
TypeBound = ("extends", TypeVariable) | ("extends", ClassOrInterfaceType, {AdditionalBound});
AdditionalBound = "&", InterfaceType;
TypeArguments = "<", TypeArgumentList, ">";
TypeArgumentList = TypeArgument, {",", TypeArgument};
TypeArgument = ReferenceType | Wildcard;
Wildcard = {Annotation}, "?", [WildcardBounds];
WildcardBounds = ("extends" | "super"), ReferenceType;
@endebnf`,
  },
  {
    title: '15. Java Language Specification (Names)',
    source: `@startebnf
ModuleName = Identifier | ( ModuleName, ".", Identifier);
PackageName = Identifier | (PackageName, ".", Identifier);
TypeName = TypeIdentifier | (PackageOrTypeName, ".", TypeIdentifier);
ExpressionName = Identifier | ( AmbiguousName, ".", Identifier);
MethodName = UnqualifiedMethodIdentifier;
PackageOrTypeName = Identifier | (PackageOrTypeName, ".", Identifier);
AmbiguousName = Identifier | (AmbiguousName, ".", Identifier);
@endebnf`,
  },
  {
    title: '16. Java Language Specification (Classes)',
    source: `@startebnf
ClassDeclaration = NormalClassDeclaration | EnumDeclaration | RecordDeclaration;
NormalClassDeclaration = {ClassModifier}, "class", TypeIdentifier, [TypeParameters], [ClassExtends], [ClassImplements], [ClassPermits], ClassBody;
ClassModifier = Annotation | "public" | "protected" | "private" | "abstract" | "static" | "final" | "sealed" | "non-sealed" | "strictfp";
TypeParameters = "<", TypeParameterList, ">";
TypeParameterList = TypeParameter, {",", TypeParameter};
ClassExtends = "extends", ClassType;
ClassImplements = "implements", InterfaceTypeList;
InterfaceTypeList = InterfaceType, {",", InterfaceType};
ClassPermits = "permits", TypeName, {",", TypeName};
ClassBody = "{", {ClassBodyDeclaration}, "}";
ClassBodyDeclaration = ClassMemberDeclaration | InstanceInitializer | StaticInitializer | ConstructorDeclaration;
ClassMemberDeclaration = (FieldDeclaration | MethodDeclaration | ClassDeclaration | InterfaceDeclaration), ";";
FieldDeclaration = {FieldModifier}, UnannType, VariableDeclaratorList, ";";
FieldModifier = Annotation | "public" | "protected" | "private" | "static" | "final" | "transient" | "volatile";
VariableDeclaratorList = VariableDeclarator, {",", VariableDeclarator};
VariableDeclarator = VariableDeclaratorId, ["=", VariableInitializer];
VariableDeclaratorId = Identifier, [Dims];
VariableInitializer = Expression | ArrayInitializer;
UnannType = UnannPrimitiveType | UnannReferenceType;
UnannPrimitiveType = NumericType | boolean;
UnannReferenceType = UnannClassOrInterfaceType | UnannTypeVariable | UnannArrayType;
UnannClassOrInterfaceType = UnannClassType | UnannInterfaceType;
UnannClassType = (TypeIdentifier, [TypeArguments]) | (PackageName, ".", {Annotation}, TypeIdentifier, [TypeArguments]) | (UnannClassOrInterfaceType, ".", {Annotation}, TypeIdentifier, [TypeArguments]) | (TypeIdentifier, [TypeArguments]) | (TypeIdentifier, [TypeArguments]);
UnannInterfaceType = UnannClassType;
UnannTypeVariable = TypeIdentifier;
UnannArrayType = (UnannPrimitiveType, Dims) | (UnannClassOrInterfaceType, Dims) | (UnannTypeVariable, Dims);
MethodDeclaration = {MethodModifier}, MethodHeader, MethodBody;
MethodModifier = Annotation | "public" | "protected" | "private" | "abstract" | "static" | "final" | "synchronized" | "native" | "strictfp";
MethodHeader = (Result, MethodDeclarator, [Throws]) | (TypeParameters, {Annotation}, Result, MethodDeclarator, [Throws]);
Result = UnannType | "void";
MethodDeclarator = Identifier, ( [ ReceiverParameter, "," ], [FormalParameterList] ), [Dims];
ReceiverParameter = {Annotation}, UnannType, [Identifier, "."], "this";
FormalParameterList = FormalParameter, {",", FormalParameter};
FormalParameter = ({VariableModifier}, UnannType, VariableDeclaratorId) | VariableArityParameter;
VariableArityParameter = {VariableModifier}, UnannType, {Annotation}, "...", Identifier;
VariableModifier = Annotation | "final";
Throws = "throws", ExceptionTypeList;
ExceptionTypeList = ExceptionType, {",", ExceptionType};
ExceptionType = ClassType | TypeVariable;
MethodBody = Block | ";";
InstanceInitializer = Block;
StaticInitializer = "static", Block;
ConstructorDeclaration = {ConstructorModifier}, ConstructorDeclarator, [Throws], ConstructorBody;
ConstructorModifier = Annotation | "public" | "protected" | "private";
ConstructorDeclarator = [TypeParameters], SimpleTypeName, ( [ReceiverParameter, ","], [FormalParameterList] );
SimpleTypeName = TypeIdentifier;
ConstructorBody = { [ExplicitConstructorInvocation], [BlockStatements] };
ExplicitConstructorInvocation = ( [TypeArguments], "this", "(", [ArgumentList], ")", ";" ) | ([TypeArguments], "super", "(", [ArgumentList], ")", ";" ) | (ExpressionName, ".", [TypeArguments], "super", "(", [ArgumentList], ")", ";" ) | (Primary, "." [TypeArguments], "super", "(" [ArgumentList], ")", ";";
EnumDeclaration = {ClassModifier}, "enum", TypeIdentifier, [ClassImplements], EnumBody;
EnumBody = "{", [EnumConstantList], [","], [EnumBodyDeclarations], "}";
EnumConstantList = EnumConstant, {",", EnumConstant};
EnumConstant = {EnumConstantModifier}, Identifier, ["(", [ArgumentList], ")"], [ClassBody];
EnumConstantModifier = Annotation;
EnumBodyDeclarations = ";", {ClassBodyDeclaration};
RecordDeclaration = {ClassModifier}, "record", TypeIdentifier, [TypeParameters], RecordHeader, [ClassImplements], RecordBody;
RecordHeader = "(", [RecordComponentList], ")";
RecordComponentList = RecordComponent, {",", RecordComponent};
RecordComponent = (RecordComponentModifier}, UnannType, Identifier) | VariableArityRecordComponent;
VariableArityRecordComponent = {RecordComponentModifier}, UnannType, {Annotation}, "...", Identifier;
RecordComponentModifier = Annotation;
RecordBody = "{", {RecordBodyDeclaration}, "}";
RecordBodyDeclaration = ClassBodyDeclaration | CompactConstructorDeclaration;
CompactConstructorDeclaration = {ConstructorModifier}, SimpleTypeName, ConstructorBody;
@endebnf`,
  },
  {
    title: '17. Java Language Specification (Interfaces)',
    source: `@startebnf
InterfaceDeclaration = NormalInterfaceDeclaration | AnnotationInterfaceDeclaration;
NormalInterfaceDeclaration = {InterfaceModifier}, "interface", TypeIdentifier, [TypeParameters], [InterfaceExtends], [InterfacePermits], InterfaceBody;
InterfaceModifier = Annotation | "public" | "protected" | "private" | "abstract" | "static" | "sealed" | "non-sealed" | "strictfp";
InterfaceExtends = "extends", InterfaceTypeList;
InterfacePermits = "permits", TypeName, {",", TypeName};
InterfaceBody = "{", {InterfaceMemberDeclaration}, "}";
InterfaceMemberDeclaration = ConstantDeclaration | InterfaceMethodDeclaration | ClassDeclaration | InterfaceDeclaration | ";";
ConstantDeclaration = {ConstantModifier}, UnannType, VariableDeclaratorList, ";";
ConstantModifier = Annotation | "public" | "static" | "final";
InterfaceMethodDeclaration = {InterfaceMethodModifier}, MethodHeader, MethodBody;
InterfaceMethodModifier = Annotation | "public" | "private" | "abstract" | "default" | "static" | "strictfp";
AnnotationInterfaceDeclaration = {InterfaceModifier}, "@", "interface", TypeIdentifier, AnnotationInterfaceBody;
AnnotationInterfaceBody = "{", {AnnotationInterfaceMemberDeclaration}, "}";
AnnotationInterfaceMemberDeclaration = AnnotationInterfaceElementDeclaration | ConstantDeclaration | ClassDeclaration | InterfaceDeclaration, ";";
AnnotationInterfaceElementDeclaration = {AnnotationInterfaceElementModifier}, UnannType, Identifier, "(", ")", [Dims], [DefaultValue], ";";
AnnotationInterfaceElementModifier = Annotation | "public" | "abstract";
DefaultValue = "default", ElementValue;
Annotation = NormalAnnotation | MarkerAnnotation | SingleElementAnnotation;
NormalAnnotation = "@", TypeName, "(", [ElementValuePairList], ")";
ElementValuePairList = ElementValuePair, {",", ElementValuePair};
ElementValuePair = Identifier, "=", ElementValue;
ElementValue = ConditionalExpression | ElementValueArrayInitializer | Annotation;
ElementValueArrayInitializer = "{", [ElementValueList], [","], "}";
ElementValueList = ElementValue, {",", ElementValue};
MarkerAnnotation = "@", TypeName;
SingleElementAnnotation = "@", TypeName, "(", ElementValue, ")";
@endebnf`,
  },
  {
    title: '18. Java Language Specification (Arrays)',
    source: `@startebnf
ArrayInitializer = "{", [VariableInitializerList], [","], "}";
VariableInitializerList = VariableInitializer, {",", VariableInitializer};
@endebnf`,
  },
  {
    title: '19. Java Language Specification (Blocks, Statements, and Patterns)',
    source: `@startebnf
Block = "{", [BlockStatements], "}";
BlockStatements = BlockStatement, {BlockStatement};
BlockStatement = LocalClassOrInterfaceDeclaration | LocalVariableDeclarationStatement | Statement;
LocalClassOrInterfaceDeclaration = ClassDeclaration | NormalInterfaceDeclaration;
LocalVariableDeclarationStatement = LocalVariableDeclaration, ";";
LocalVariableDeclaration = {VariableModifier}, LocalVariableType, VariableDeclaratorList;
LocalVariableType = UnannType | "var";
Statement = StatementWithoutTrailingSubstatement | LabeledStatement | IfThenStatement | IfThenElseStatement | WhileStatement | ForStatement;
StatementNoShortIf = StatementWithoutTrailingSubstatement | LabeledStatementNoShortIf | IfThenElseStatementNoShortIf | WhileStatementNoShortIf | ForStatementNoShortIf;
StatementWithoutTrailingSubstatement = Block | EmptyStatement | ExpressionStatement | AssertStatement | SwitchStatement | DoStatement | BreakStatement | ContinueStatement | ReturnStatement | SynchronizedStatement | ThrowStatement | TryStatement | YieldStatement;
EmptyStatement = ";";
LabeledStatement = Identifier, ":", Statement;
LabeledStatementNoShortIf = Identifier, ":", StatementNoShortIf;
ExpressionStatement = StatementExpression, ";";
StatementExpression = Assignment | PreIncrementExpression | PreDecrementExpression | PostIncrementExpression | PostDecrementExpression | MethodInvocation | ClassInstanceCreationExpression;
IfThenStatement = "if", "(", Expression, ")", Statement;
IfThenElseStatement = "if", "(", Expression, ")", StatementNoShortIf, "else", Statement;
IfThenElseStatementNoShortIf = "if", "(", Expression, ")", StatementNoShortIf, "else", StatementNoShortIf;
AssertStatement = ("assert", Expression, ";") | ("assert", Expression, ":", Expression, ";");
SwitchStatement = "switch", "(", Expression, ")", SwitchBlock;
SwitchBlock = ( "{", SwitchRule, {SwitchRule}, "}" ) | ( "{", {SwitchBlockStatementGroup}, {SwitchLabel, ":"}, "}" );
SwitchRule = (SwitchLabel, "->", Expression, ";") |(SwitchLabel, "->", Block) | (SwitchLabel, "->", ThrowStatement);
SwitchBlockStatementGroup = SwitchLabel, ":", {SwitchLabel, ":"}, BlockStatements;
SwitchLabel = ("case", CaseConstant, {",", CaseConstant}) | "default";
CaseConstant = ConditionalExpression;
WhileStatement = "while", "(", Expression, ")", Statement;
WhileStatementNoShortIf = "while", "(", Expression, ")", StatementNoShortIf;
DoStatement = "do", Statement, "while", "(", Expression, ")", ";";
ForStatement = BasicForStatement | EnhancedForStatement | ForStatementNoShortIf | BasicForStatementNoShortIf | EnhancedForStatementNoShortIf;
BasicForStatement = "for", "(", [ForInit], ";", [Expression], ";", [ForUpdate], ")", Statement;
BasicForStatementNoShortIf = "for", "(", [ForInit], ";", [Expression], ";", [ForUpdate], ")", StatementNoShortIf;
ForInit = StatementExpressionList | LocalVariableDeclaration;
ForUpdate = StatementExpressionList;
StatementExpressionList = StatementExpression, {",", StatementExpression};
EnhancedForStatement = "for", "(", LocalVariableDeclaration, ":", Expression, ")", Statement;
EnhancedForStatementNoShortIf = "for", "(", LocalVariableDeclaration, ":", Expression, ")", StatementNoShortIf;
BreakStatement = break, [Identifier], ";";
YieldStatement = "yield", Expression, ";";
ContinueStatement = "continue", [Identifier], ";";
ReturnStatement = "return" [Expression], ";";
ThrowStatement = "throw", Expression, ";";
SynchronizedStatement = "synchronized", "(", Expression, ")", Block;
TryStatement = ("try", Block, Catches) | ("try", Block, [Catches], Finally ) | TryWithResourcesStatement;
Catches = CatchClause, {CatchClause};
CatchClause = "catch", "(", CatchFormalParameter, ")", Block;
CatchFormalParameter = {VariableModifier}, CatchType, VariableDeclaratorId;
CatchType = UnannClassType, {"|", ClassType};
Finally = "finally", Block;
TryWithResourcesStatement = "try", ResourceSpecification, Block, [Catches], [Finally];
ResourceSpecification = "(", ResourceList, [";"], ")";
ResourceList = Resource, {";", Resource};
Resource = LocalVariableDeclaration | VariableAccess;
Pattern = TypePattern;
TypePattern = LocalVariableDeclaration;
(* Expressions *)
Primary = PrimaryNoNewArray | ArrayCreationExpression;
PrimaryNoNewArray = Literal | ClassLiteral | "this" | (TypeName, ".", "this") | ( "(", Expression, ")" ) | ClassInstanceCreationExpression | FieldAccess | ArrayAccess | MethodInvocation | MethodReference;
ClassLiteral = (TypeName, { "[", "]" }, ".", "class") | (NumericType, {"[", "]"}, ".", "class") | ("boolean", {"[", "]"}, ".", "class") | ("void", ".", "class");
ClassInstanceCreationExpression = UnqualifiedClassInstanceCreationExpression | (ExpressionName, ".", UnqualifiedClassInstanceCreationExpression) |(Primary, ".", UnqualifiedClassInstanceCreationExpression);
UnqualifiedClassInstanceCreationExpression = "new", [TypeArguments], ClassOrInterfaceTypeToInstantiate, "(", [ArgumentList], ")", [ClassBody];
ClassOrInterfaceTypeToInstantiate = {Annotation}, Identifier, {".", {Annotation}, Identifier}, [TypeArgumentsOrDiamond];
TypeArgumentsOrDiamond = TypeArguments | ("<",">");
ArrayCreationExpression = ArrayCreationExpressionWithoutInitializer | ArrayCreationExpressionWithInitializer;
ArrayCreationExpressionWithoutInitializer = ("new", PrimitiveType, DimExprs, [Dims]) | ("new", ClassOrInterfaceType, DimExprs, [Dims]);
ArrayCreationExpressionWithInitializer = ("new", PrimitiveType, Dims, ArrayInitializer) | ("new", ClassOrInterfaceType, Dims, ArrayInitializer);
DimExprs = DimExpr, {DimExpr};
DimExpr = ({Annotation}, [ Expression ]) | (ArrayAccess, "=", ExpressionName, "[", Expression, "]") | (PrimaryNoNewArray, "[", Expression, "]") | (ArrayCreationExpressionWithInitializer, "[", Expression, "]");
FieldAccess = (Primary, ".", Identifier), ("super", ".", Identifier), (TypeName, ".", super, ".", Identifier);
MethodInvocation = (MethodName, "(", [ArgumentList], ")") | (TypeName, ".", [TypeArguments], Identifier, "(", [ArgumentList], ")") | (ExpressionName, ".", [TypeArguments], Identifier, "(", [ArgumentList], ")") | (Primary, ".", [TypeArguments], Identifier, "(", [ArgumentList], ")") | ("super", ".", [TypeArguments], Identifier, "(", [ArgumentList], ")") | (TypeName, ".", "super", ".", [TypeArguments], Identifier, "(", [ArgumentList], ")");
ArgumentList = Expression, {",", Expression};
MethodReference = (ExpressionName, "::", [TypeArguments], Identifier) | (Primary, "::", [TypeArguments], Identifier) | (ReferenceType, "::", [TypeArguments], Identifier) | ("super", "::", [TypeArguments], Identifier) | (TypeName, ".", super, "::", [TypeArguments], Identifier) | (ClassType, "::", [TypeArguments], "new") | (ArrayType, "::", "new");
Expression = LambdaExpression | AssignmentExpression;
LambdaExpression = LambdaParameters, "->", LambdaBody;
LambdaParameters = ("(", [LambdaParameterList], ")") | Identifier;
LambdaParameterList = (LambdaParameter, {",", LambdaParameter}) | (Identifier, {",", Identifier});
LambdaParameter = ({VariableModifier}, LambdaParameterType, VariableDeclaratorId) | VariableArityParameter;
LambdaParameterType = UnannType | "var";
LambdaBody = Expression | Block;
AssignmentExpression = ConditionalExpression | Assignment;
Assignment = LeftHandSide | AssignmentOperator | Expression;
LeftHandSide = ExpressionName | FieldAccess | ArrayAccess;
AssignmentOperator = "=" | "*=" | "/=" | "%=" | "+=" | "-=" | "<<=" | ">>=" | ">>>=" | "&=" | "^=" | "|=";
ConditionalExpression = ConditionalOrExpression | (ConditionalOrExpression, "?", Expression, ":", ConditionalExpression) | (ConditionalOrExpression, "?", Expression, ":", LambdaExpression);
ConditionalOrExpression = ConditionalAndExpression | (ConditionalOrExpression, "||", ConditionalAndExpression);
ConditionalAndExpression = InclusiveOrExpression | (ConditionalAndExpression, "&&", InclusiveOrExpression);
InclusiveOrExpression = ExclusiveOrExpression | (InclusiveOrExpression, "|", ExclusiveOrExpression);
ExclusiveOrExpression = AndExpression | (ExclusiveOrExpression, "^", AndExpression);
AndExpression = EqualityExpression, (AndExpression, "&", EqualityExpression) | (EqualityExpression, "=", RelationalExpression) | (EqualityExpression, "==", RelationalExpression) | (EqualityExpression, "!=", RelationalExpression);
RelationalExpression = ShiftExpression | (RelationalExpression, "<", ShiftExpression) | (RelationalExpression, ">", ShiftExpression) | (RelationalExpression, "<=", ShiftExpression) | (RelationalExpression, ">=", ShiftExpression) | (InstanceofExpression);
InstanceofExpression = (RelationalExpression, "instanceof", ReferenceType) | (RelationalExpression, "instanceof", Pattern);
ShiftExpression = AdditiveExpression | (ShiftExpression, "<<", AdditiveExpression) | (ShiftExpression, ">>", AdditiveExpression) | (ShiftExpression, ">>>", AdditiveExpression);
AdditiveExpression = MultiplicativeExpression | (AdditiveExpression, "+", MultiplicativeExpression) | (AdditiveExpression, "-", MultiplicativeExpression);
MultiplicativeExpression = UnaryExpression | (MultiplicativeExpression, "*", UnaryExpression) | (MultiplicativeExpression, "/", UnaryExpression) | (MultiplicativeExpression, "%", UnaryExpression);
UnaryExpression = PreIncrementExpression | PreDecrementExpression | ("+", UnaryExpression) | ("-", UnaryExpression) | UnaryExpressionNotPlusMinus;
PreIncrementExpression = "++", UnaryExpression;
PreDecrementExpression = "--", UnaryExpression;
UnaryExpressionNotPlusMinus = PostfixExpression | ("~", UnaryExpression) | ("!", UnaryExpression) | CastExpression | SwitchExpression;
PostfixExpression = Primary | ExpressionName | PostIncrementExpression | PostDecrementExpression;
PostIncrementExpression = PostfixExpression, "++";
PostDecrementExpression = PostfixExpression, "--";
CastExpression = ("(", PrimitiveType, ")", UnaryExpression) | ("(", ReferenceType, {AdditionalBound}, ")", UnaryExpressionNotPlusMinus) | ("(", ReferenceType, {AdditionalBound}, ")", LambdaExpression);
SwitchExpression = "switch", "(", Expression, ")", SwitchBlock;
ConstantExpression = Expression;
@endebnf`,
  },
  {
    title: '20. Remaining defects (Could you put \'arrow head\' on all rerouted lines?)',
    source: `@startebnf
title Could you put 'arrow head' on all rerouted lines?
test = [1], [12], [123], [1234];
@endebnf`,
  },
  {
    title: '21. Remaining defects (Order issue)',
    source: `@startebnf
a = (one, two), three;
b = (one (* 1 *), two (* 2 *)), three (* 3 *);
@endebnf`,
  },
  {
    title: '22. Remaining defects (Allow accentuated or Unicode char on EBNF meta-identifier or rule name.)',
    source: `@startebnf
(* Test of accentuated or Unicode char*)
alt = été | hiver;
hiver = 'froid';
été = 'chaud';
@endebnf`,
  },
  {
    title: '23. Remaining defects (Allow full restriction management with `except-symbol "-"`)',
    source: `@startebnf
title First [modified] example of §5.8 Syntactic-term of ISO-EBNF
letter = ? "A" - "Z" ?;
vowel = "A" | "E" | "I" | "O" | "U";
consonant = letter - vowel;
@endebnf`,
  },
];
