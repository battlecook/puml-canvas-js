// PlantUML regex-diagram examples extracted from https://plantuml.com/en/regex-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface RegexSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_REGEX_LIST: ReadonlyArray<RegexSample> = [
  {
    title: '1. Fundamentals of Regular Expressions',
    source: `@startregex title litteralText abc @endregex`,
  },
  {
    title: '2. Character Classes and Sequences',
    source: `@startregex title shorthandCharacterClasses \\d\\w\\s @endregex`,
  },
  {
    title: '3. Character Classes and Sequences',
    source: `@startregex title litteralCharacterSequence \\Qfoo\\E @endregex`,
  },
  {
    title: '4. Character Classes and Sequences',
    source: `@startregex title range [0-9] @endregex`,
  },
  {
    title: '5. Character Classes and Sequences',
    source: `@startregex title anyCharacter . @endregex`,
  },
  {
    title: '6. Character Classes and Sequences',
    source: `@startregex title specialEscapes \\t\\r\\n\\a\\e\\f @endregex`,
  },
  {
    title: '7. Descriptive Name and Language',
    source: `@startregex !option useDescriptiveNames false \\d?\\D+\\w*\\W{1,2}|\\s.\\S @endregex`,
  },
  {
    title: '8. Descriptive Name and Language',
    source: `@startregex !option language en !option useDescriptiveNames true \\d?\\D+\\w*\\W{1,2}|\\s.\\S @endregex`,
  },
  {
    title: '9. Descriptive Name and Language',
    source: `@startregex !option language de !option useDescriptiveNames true \\d?\\D+\\w*\\W{1,2}|\\s.\\S @endregex`,
  },
  {
    title: '10. Descriptive Name and Language',
    source: `@startregex !option language ja !option useDescriptiveNames true \\d?\\D+\\w*\\W{1,2}|\\s.\\S @endregex`,
  },
  {
    title: '11. Special Escapes',
    source: `@startregex title octalEscapes \\0377\\337 @endregex`,
  },
  {
    title: '12. Special Escapes',
    source: `@startregex title unicodeEscapes ￿\\x{FFFF} @endregex`,
  },
  {
    title: '13. Repetitions and Alternation',
    source: `@startregex title optional ab? @endregex`,
  },
  {
    title: '14. Repetitions and Alternation',
    source: `@startregex title requiredRepetition ab+ @endregex`,
  },
  {
    title: '15. Repetitions and Alternation',
    source: `@startregex title optionalRepetition ab* @endregex`,
  },
  {
    title: '16. Repetitions and Alternation',
    source: `@startregex title rangeRepetition ab{1,2} @endregex`,
  },
  {
    title: '17. Repetitions and Alternation',
    source: `@startregex title minimumRepetition ab{1}c{1,} @endregex`,
  },
  {
    title: '18. Repetitions and Alternation',
    source: `@startregex title repetitionEquivalance a{0,1}b{1,} is the same as a?b+ @endregex`,
  },
  {
    title: '19. Repetitions and Alternation',
    source: `@startregex title alternation a|b @endregex`,
  },
  {
    title: '20. Unicode',
    source: `@startregex title unicodeCategories letter \\p{L}\\p{Letter} lower \\p{Ll}\\p{Lowercase_letter} @endregex`,
  },
  {
    title: '21. Unicode',
    source: `@startregex title unicodeScripts latin \\p{Latin} @endregex`,
  },
  {
    title: '22. Unicode',
    source: `@startregex title unicodeBlocks \\p{InGeometric_Shapes} @endregex`,
  },
];
