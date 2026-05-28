// PlantUML yaml examples extracted from https://plantuml.com/en/yaml.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface YamlSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_YAML_LIST: ReadonlyArray<YamlSample> = [
  {
    title: '1. Display YAML Data',
    source: `@startyaml
fruit: Apple
size: Large
color:
  - Red
  - Green
@endyaml`,
  },
  {
    title: '2. Complex example',
    source: `@startyaml
doe: "a deer, a female deer"
ray: "a drop of golden sun"
pi: 3.14159
xmas: true
french-hens: 3
calling-birds:
  - huey
  - dewey
  - louie
  - fred
xmas-fifth-day:
  calling-birds: four
  french-hens: 3
  golden-rings: 5
partridges:
  count: 1
  location: "a pear tree"
turtle-doves: two
@endyaml`,
  },
  {
    title: '3. Specific key (with symbols or unicode)',
    source: `@startyaml
@fruit: Apple
$size: Large
&color: Red
❤: Heart
‰: Per mille
@endyaml`,
  },
  {
    title: '4. Highlight parts',
    source: `@startyaml
#highlight "french-hens"
#highlight "xmas-fifth-day" / "partridges"
doe: "a deer, a female deer"
ray: "a drop of golden sun"
pi: 3.14159
xmas: true
french-hens: 3
calling-birds:
  - huey
  - dewey
  - louie
  - fred
xmas-fifth-day:
  calling-birds: four
  french-hens: 3
  golden-rings: 5
partridges:
  count: 1
  location: "a pear tree"
turtle-doves: two
@endyaml`,
  },
  {
    title: '5. Highlight parts',
    source: `@startyaml
<style>
yamlDiagram {
  highlight {
    BackGroundColor red
    FontColor white
    FontStyle italic
  }
}
</style>
#highlight "french-hens"
#highlight "xmas-fifth-day" / "partridges"
doe: "a deer, a female deer"
ray: "a drop of golden sun"
pi: 3.14159
xmas: true
french-hens: 3
calling-birds:
  - huey
  - dewey
  - louie
  - fred
xmas-fifth-day:
  calling-birds: four
  french-hens: 3
  golden-rings: 5
partridges:
  count: 1
  location: "a pear tree"
turtle-doves: two
@endyaml`,
  },
  {
    title: '6. Using different styles for highlight',
    source: `@startyaml
<style>
.h1 {
  BackGroundColor green
  FontColor white
  FontStyle italic
}
.h2 {
  BackGroundColor red
  FontColor white
  FontStyle italic
}
</style>
#highlight "french-hens" <<h1>>
#highlight "xmas-fifth-day" / "partridges" <<h2>>
doe: "a deer, a female deer"
ray: "a drop of golden sun"
pi: 3.14159
xmas: true
french-hens: 3
calling-birds:
  - huey
  - dewey
  - louie
  - fred
xmas-fifth-day:
  calling-birds: four
  french-hens: 3
  golden-rings: 5
partridges:
  count: 1
  location: "a pear tree"
turtle-doves: two
@endyaml`,
  },
  {
    title: '7. Using (global) style',
    source: `@startyaml
- name: Mark McGwire
  hr: 65
  avg: 0.278
- name: Sammy Sosa
  hr: 63
  avg: 0.288
@endyaml`,
  },
  {
    title: '8. Using (global) style',
    source: `@startyaml
<style>
yamlDiagram {
  node {
    BackGroundColor lightblue
    LineColor lightblue
    FontName Helvetica
    FontColor red
    FontSize 18
    FontStyle bold
    BackGroundColor Khaki
    RoundCorner 0
    LineThickness 2
    LineStyle 10-5
    separator {
      LineThickness 0.5
      LineColor black
      LineStyle 1-5
    }
  }
  arrow {
    BackGroundColor lightblue
    LineColor green
    LineThickness 2
    LineStyle 2-5
  }
}
</style>
- name: Mark McGwire
  hr: 65
  avg: 0.278
- name: Sammy Sosa
  hr: 63
  avg: 0.288
@endyaml`,
  },
  {
    title: '9. Creole on YAML',
    source: `@startyaml
Creole:
  wave: ~~wave~~
  bold: **bold**
  italics: //italics//
  monospaced: ""monospaced""
  stricken-out: --stricken-out--
  underlined: __underlined__
  not-underlined: ~__not underlined__
  wave-underlined: ~~wave-underlined~~
HTML Creole:
  bold: <b>bold
  italics: <i>italics
  monospaced: <font:monospaced>monospaced
  stroked: <s>stroked
  underlined: <u>underlined
  waved: <w>waved
  green-stroked: <s:green>stroked
  red-underlined: <u:red>underlined
  blue-waved: <w:#0000FF>waved
  Blue: <color:blue>Blue
  Orange: <back:orange>Orange background
  big: <size:20>big
Graphic:
  OpenIconic: account-login <&account-login>
  Unicode: This is <U+221E> long
  Emoji: <:calendar:> Calendar
  Image: <img:https://plantuml.com/logo3.png>
@endyaml`,
  },
];
