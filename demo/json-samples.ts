// PlantUML json examples extracted from https://plantuml.com/en/json.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface JsonSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_JSON_LIST: ReadonlyArray<JsonSample> = [
  {
    title: '1. Display JSON Data',
    source: `@startjson
{ "fruit":"Apple", "size":"Large", "color": ["Red", "Green"] }
@endjson`,
  },
  {
    title: '2. Complex example',
    source: `@startjson
{ "firstName": "John", "lastName": "Smith", "isAlive": true, "age": 27, "address": { "streetAddress": "21 2nd Street", "city": "New York", "state": "NY", "postalCode": "10021-3100" }, "phoneNumbers": [ { "type": "home", "number": "212 555-1234" }, { "type": "office", "number": "646 555-4567" } ], "children": [], "spouse": null }
@endjson`,
  },
  {
    title: '3. Highlight parts',
    source: `@startjson
#highlight "lastName"
#highlight "address" / "city"
#highlight "phoneNumbers" / "0" / "number"
{ "firstName": "John", "lastName": "Smith", "isAlive": true, "age": 28, "address": { "streetAddress": "21 2nd Street", "city": "New York", "state": "NY", "postalCode": "10021-3100" }, "phoneNumbers": [ { "type": "home", "number": "212 555-1234" }, { "type": "office", "number": "646 555-4567" } ], "children": [], "spouse": null }
@endjson`,
  },
  {
    title: '4. Using different styles for highlight',
    source: `@startjson
<style>
.h1 { BackGroundColor green FontColor white FontStyle italic }
.h2 { BackGroundColor red FontColor white FontStyle bold }
</style>
#highlight "lastName"
#highlight "address" / "city" <<h1>>
#highlight "phoneNumbers" / "0" / "number" <<h2>>
{ "firstName": "John", "lastName": "Smith", "isAlive": true, "age": 28, "address": { "streetAddress": "21 2nd Street", "city": "New York", "state": "NY", "postalCode": "10021-3100" }, "phoneNumbers": [ { "type": "home", "number": "212 555-1234" }, { "type": "office", "number": "646 555-4567" } ], "children": [], "spouse": null }
@endjson`,
  },
  {
    title: '5. JSON basic element',
    source: `@startjson
{ "null": null, "true": true, "false": false, "JSON_Number": [-1, -1.1, "<color:green>TBC"], "JSON_String": "a\\nb\\rc\\td <color:green>TBC...", "JSON_Object": { "{}": {}, "k_int": 123, "k_str": "abc", "k_obj": {"k": "v"} }, "JSON_Array" : [ [], [true, false], [-1, 1], ["a", "b", "c"], ["mix", null, true, 1, {"k": "v"}] ] }
@endjson`,
  },
  {
    title: '6. JSON array or table',
    source: `@startjson
{ "Numeric": [1, 2, 3], "String ": ["v1a", "v2b", "v3c"], "Boolean": [true, false, true] }
@endjson`,
  },
  {
    title: '7. JSON array or table',
    source: `@startjson
[1, 2, 3]
@endjson`,
  },
  {
    title: '8. JSON array or table',
    source: `@startjson
["1a", "2b", "3c"]
@endjson`,
  },
  {
    title: '9. JSON array or table',
    source: `@startjson
[true, false, true]
@endjson`,
  },
  {
    title: '10. JSON numbers',
    source: `@startjson
{ "DecimalNumber": [-1, 0, 1], "DecimalNumber . Digits": [-1.1, 0.1, 1.1], "DecimalNumber ExponentPart": [1E5] }
@endjson`,
  },
  {
    title: '11. JSON strings',
    source: `@startjson
{ "<color:blue><b>code": "<color:blue><b>value", "a\\\\u005Cb": "a\\b", "\\\\uD83D\\\\uDE10": "😐", "😐": "😐" }
@endjson`,
  },
  {
    title: '12. JSON strings',
    source: `@startjson
{ "**legend**: character name": ["**two-character escape sequence**", "example (between 'a' and 'b')"], "quotation mark character (U+0022)": ["\\\\\\"", "a\\"b"], "reverse solidus character (U+005C)": ["\\\\\\\\", "a\\\\b"], "solidus character (U+002F)": ["\\\\/", "a\\/b"], "backspace character (U+0008)": ["\\b", "a\\bb"], "form feed character (U+000C)": ["\\f", "a\\fb"], "line feed character (U+000A)": ["\\n", "a\\nb"], "carriage return character (U+000D)": ["\\r", "a\\rb"], "character tabulation character (U+0009)": ["\\t", "a\\tb"] }
@endjson`,
  },
  {
    title: '13. JSON strings',
    source: `@startjson
[ "\\\\\\\\", "\\n", "\\r", "\\t" ]
@endjson`,
  },
  {
    title: '14. Minimal JSON examples',
    source: `@startjson
"Hello world!"
@endjson`,
  },
  {
    title: '15. Minimal JSON examples',
    source: `@startjson
42
@endjson`,
  },
  {
    title: '16. Minimal JSON examples',
    source: `@startjson
true
@endjson`,
  },
  {
    title: '17. Empty table or list',
    source: `@startjson
{ "empty_tab": [], "empty_list": {} }
@endjson`,
  },
  {
    title: '18. Using (global) style',
    source: `@startjson
#highlight "1" / "hr"
[ { "name": "Mark McGwire", "hr": 65, "avg": 0.278 }, { "name": "Sammy Sosa", "hr": 63, "avg": 0.288 } ]
@endjson`,
  },
  {
    title: '19. Using (global) style',
    source: `@startjson
<style>
jsonDiagram {
node {
BackGroundColor Khaki
LineColor lightblue
FontName Helvetica
FontColor red
FontSize 18
FontStyle bold
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
highlight {
BackGroundColor red
FontColor white
FontStyle italic
}
}
</style>
#highlight "1" / "hr"
[ { "name": "Mark McGwire", "hr": 65, "avg": 0.278 }, { "name": "Sammy Sosa", "hr": 63, "avg": 0.288 } ]
@endjson`,
  },
  {
    title: '20. Display JSON Data on Class or Object diagram',
    source: `@startuml
class Class
object Object
json JSON {
"fruit":"Apple",
"size":"Large",
"color": ["Red", "Green"]
}
@enduml`,
  },
  {
    title: '21. Display JSON Data on Class or Object diagram',
    source: `@startuml
json "<b>JSON basic element" as J {
"null": null,
"true": true,
"false": false,
"JSON_Number": [-1, -1.1, "<color:green>TBC"],
"JSON_String": "a\\nb\\rc\\td <color:green>TBC...",
"JSON_Object": {
"{}": {},
"k_int": 123,
"k_str": "abc",
"k_obj": {"k": "v"}
},
"JSON_Array" : [
[],
[true, false],
[-1, 1],
["a", "b", "c"],
["mix", null, true, 1, {"k": "v"}]
]
}
@enduml`,
  },
  {
    title: '22. Display JSON Data on Deployment (Usecase, Component, Deployment) diagram',
    source: `@startuml
allowmixing
component Component
actor Actor
usecase Usecase
() Interface
node Node
cloud Cloud
json JSON {
"fruit":"Apple",
"size":"Large",
"color": ["Red", "Green"]
}
@enduml`,
  },
  {
    title: '23. Display JSON Data on Deployment (Usecase, Component, Deployment) diagram',
    source: `@startuml
allowmixing
agent Agent
stack {
json "JSON_file.json" as J {
"fruit":"Apple",
"size":"Large",
"color": ["Red", "Green"]
}
}
database Database
Agent -> J
J -> Database
@enduml`,
  },
  {
    title: '24. Display JSON Data on State diagram',
    source: `@startuml
state "A" as stateA
state "C" as stateC
{
state B
}
json J {
"fruit":"Apple",
"size":"Large",
"color": ["Red", "Green"]
}
@enduml`,
  },
  {
    title: '25. Creole on JSON',
    source: `@startjson
{ "Creole": { "wave": "~~wave~~", "bold": "**bold**", "italics": "//italics//", "stricken-out": "--stricken-out--", "underlined": "__underlined__", "not-underlined": "~__not underlined__", "wave-underlined": "~~wave-underlined~~" }, "HTML Creole": { "bold": "<b>bold", "italics": "<i>italics", "monospaced": "<font:monospaced>monospaced", "stroked": "<s>stroked", "underlined": "<u>underlined", "waved": "<w>waved", "green-stroked": "<s:green>stroked", "red-underlined": "<u:red>underlined", "blue-waved": "<w:#0000FF>waved", "Blue": "<color:blue>Blue", "Orange": "<back:orange>Orange background", "big": "<size:20>big" }, "Graphic": { "OpenIconic": "account-login <&account-login>", "Unicode": "This is <U+221E> long", "Emoji": "<:calendar:> Calendar", "Image": "<img:https://plantuml.com/logo3.png>" } }
@endjson`,
  },
];
