// PlantUML salt-wireframe examples extracted from https://plantuml.com/en/salt-wireframe.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface WireframeSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_WIREFRAME_LIST: ReadonlyArray<WireframeSample> = [
  {
    title: '1. Basic widgets',
    source: `@startsalt
{
Just plain text
[This is my button]
()
Unchecked radio
(X)
Checked radio
[]
Unchecked box
[X]
Checked box
"Enter text here "
^This is a droplist^
}
@endsalt`,
  },
  {
    title: '2. Text area',
    source: `@startsalt
{+
This is a long text in a textarea
.
" "
}
@endsalt`,
  },
  {
    title: '3. Text area',
    source: `@startsalt
{SI
This is a long text in a textarea
.
" "
}
@endsalt`,
  },
  {
    title: '4. Text area',
    source: `@startsalt
{S-
This is a long text in a textarea
.
" "
}
@endsalt`,
  },
  {
    title: '5. Open, close droplist',
    source: `@startsalt
{
^This is a closed droplist^ | ^This is an open droplist^^
item 1^^
item 2^
|
^This is another open droplist^
item 1^
item 2^
}
@endsalt`,
  },
  {
    title: '6. Using grid [| and #, !, -, +]',
    source: `@startsalt
{
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '7. Using grid [| and #, !, -, +]',
    source: `@startsalt
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '8. Group box [^]',
    source: `@startsalt
{^"My group box"
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '9. Using separator [.., ==, ~~, --]',
    source: `@startsalt
{
Text1
..
"Some field"
==
Note on usage
~~
Another text
--
[Ok]
}
@endsalt`,
  },
  {
    title: '10. Tree widget [T]',
    source: `@startsalt
{
{T
+ World
++ America
+++ Canada
+++ USA
++++ New York
++++ Boston
+++ Mexico
++ Europe
+++ Italy
+++ Germany
++++ Berlin
++ Africa
}
}
@endsalt`,
  },
  {
    title: '11. Tree table [T]',
    source: `@startsalt
{
{T
+Region | Population | Age
+ World | 7.13 billion | 30
++ America | 964 million | 30
+++ Canada | 35 million | 30
+++ USA | 319 million | 30
++++ NYC | 8 million | 30
++++ Boston | 617 thousand | 30
+++ Mexico | 117 million | 30
++ Europe | 601 million | 30
+++ Italy | 61 million | 30
+++ Germany | 82 million | 30
++++ Berlin | 3 million | 30
++ Africa | 1 billion | 30
}
}
@endsalt`,
  },
  {
    title: '12. Tree table [T]',
    source: `@startsalt
{
..
== with T!
{T!
+Region | Population | Age
+ World | 7.13 billion | 30
++ America | 964 million | 30
}
..
== with T-
{T-
+Region | Population | Age
+ World | 7.13 billion | 30
++ America | 964 million | 30
}
..
== with T+
{T+
+Region | Population | Age
+ World | 7.13 billion | 30
++ America | 964 million | 30
}
..
== with T#
{T#
+Region | Population | Age
+ World | 7.13 billion | 30
++ America | 964 million | 30
}
..
}
@endsalt`,
  },
  {
    title: '13. Enclosing brackets [{, }]',
    source: `@startsalt
{
Name | " "
Modifiers: | {
(X) public
() default
() private
() protected
[] abstract
[] final
[] static
}
Superclass: | {
"java.lang.Object "
| [Browse...]
}
}
@endsalt`,
  },
  {
    title: '14. Adding tabs [/]',
    source: `@startsalt
{+
{/
<b>General | Fullscreen | Behavior | Saving
}
{
{
Open image in: | ^Smart Mode^
}
[X] Smooth images when zoomed
[X] Confirm image deletion
[ ] Show hidden images
}
[Close]
}
@endsalt`,
  },
  {
    title: '15. Adding tabs [/]',
    source: `@startsalt
{+
{/
<b>General
Fullscreen
Behavior
Saving
}
|
{
{
Open image in: | ^Smart Mode^
}
[X] Smooth images when zoomed
[X] Confirm image deletion
[ ] Show hidden images
[Close]
}
}
@endsalt`,
  },
  {
    title: '16. Using menu [*]',
    source: `@startsalt
{+
{*
File | Edit | Source | Refactor
}
{/
General | Fullscreen | Behavior | Saving
}
{
{
Open image in: | ^Smart Mode^
}
[X] Smooth images when zoomed
[X] Confirm image deletion
[ ] Show hidden images
}
[Close]
}
@endsalt`,
  },
  {
    title: '17. Using menu [*]',
    source: `@startsalt
{+
{*
File | Edit | Source | Refactor
Refactor | New | Open File | - | Close | Close All
}
{/
General | Fullscreen | Behavior | Saving
}
{
{
Open image in: | ^Smart Mode^
}
[X] Smooth images when zoomed
[X] Confirm image deletion
[ ] Show hidden images
}
[Close]
}
@endsalt`,
  },
  {
    title: '18. Using menu [*]',
    source: `@startsalt
{+
{*
File | Edit | Source | Refactor
}
{/
General | Fullscreen | Behavior | Saving
}
{
{
Open image in: | ^Smart Mode^^Normal Mode^
}
[X] Smooth images when zoomed
[X] Confirm image deletion
[ ] Show hidden images
}
[Close]
}
@endsalt`,
  },
  {
    title: '19. Advanced table',
    source: `@startsalt
{#
. | Column 2 | Column 3
Row header 1 | value 1 | value 2
Row header 2 | A long cell | *
}
@endsalt`,
  },
  {
    title: '20. Scroll Bars [S, SI, S-]',
    source: `@startsalt
{S
Message
.
.
.
.
}
@endsalt`,
  },
  {
    title: '21. Scroll Bars [S, SI, S-]',
    source: `@startsalt
{SI
Message
.
.
.
.
}
@endsalt`,
  },
  {
    title: '22. Scroll Bars [S, SI, S-]',
    source: `@startsalt
{S-
Message
.
.
.
.
}
@endsalt`,
  },
  {
    title: '23. Colors',
    source: `@startsalt
{
<color:Blue>Just plain text
[This is my default button]
[<color:green>This is my green button]
[<color:#9a9a9a>This is my disabled button]
[]
<color:red>Unchecked box
[X]
<color:green>Checked box
"Enter text here "
^This is a droplist^
^<color:#9a9a9a>This is a disabled droplist^
^<color:red>This is a red droplist^
}
@endsalt`,
  },
  {
    title: '24. Creole on Salt',
    source: `@startsalt
{
{^==Creole
This is **bold**
This is //italics//
This is ""monospaced""
This is --stricken-out--
This is __underlined__
This is ~~wave-underlined~~
--test Unicode and icons--
This is <U+221E> long
This is a <&code> icon
Use image : <img:https://plantuml.com/logo3.png>
}
|
{^<b>HTML Creole
This is <b>bold</b>
This is <i>italics</i>
This is <font:monospaced>monospaced</font>
This is <s>stroked</s>
This is <u>underlined</u>
This is <w>waved</w>
This is <s:green>stroked</s>
This is <u:red>underlined</u>
This is <w:#0000FF>waved</w>
-- other examples --
This is <color:blue>Blue</color>
This is <back:orange>Orange background</back>
This is <size:20>big</size>
}
|
{^Creole line
You can have horizontal line
----
Or double line
====
Or strong line
____
Or dotted line
..My title..
Or dotted title
//and title... //
==Title==
Or double-line title
--Another title--
Or single-line title
Enjoy!
}
|
{^Creole list
item **test list 1**
* Bullet list
* Second item
** Sub item
*** Sub sub item
* Third item
----
**test list 2**
# Numbered list
# Second item
## Sub item
## Another sub item
# Third item
}
|
{^Mix on salt
==<color:Blue>Just plain text
[This is my default button]
[<b><color:green>This is my green button]
[ ---<color:#9a9a9a>This is my disabled button-- ]
[]
<size:20><color:red>Unchecked box
[X]
<color:green>Checked box
"//Enter text here// "
^This is a droplist^
^<color:#9a9a9a>This is a disabled droplist^
^<b><color:red>This is a red droplist^
}
}
@endsalt`,
  },
  {
    title: '25. Pseudo sprite [<<, >>]',
    source: `@startsalt
{
[X] checkbox|[] checkbox
() radio | (X) radio
This is a text|[This is my button]|This is another text
"A field"|"Another long Field"|[A button]
<<folder
............
.XXXXX......
.X...X......
.XXXXXXXXXX.
.X........X.
.X........X.
.X........X.
.X........X.
.XXXXXXXXXX.
............
>>|<color:blue>other folder|<<folder>>
^Droplist^
}
@endsalt`,
  },
  {
    title: '26. OpenIconic',
    source: `@startsalt
{
Login<&person> | "MyName "
Password<&key> | "****  "
[Cancel <&circle-x>] | [OK <&account-login>]
}
@endsalt`,
  },
  {
    title: '27. OpenIconic',
    source: `@startuml
listopeniconic
@enduml`,
  },
  {
    title: '28. Add title, header, footer, caption or legend',
    source: `@startsalt
title My title
header some header
footer some footer
caption This is caption
legend
The legend
end legend
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '29. Zoom, DPI',
    source: `@startsalt
{
<&person> Login | "MyName "
<&key> Password | "****  "
[<&circle-x> Cancel ] | [ <&account-login> OK ]
}
@endsalt`,
  },
  {
    title: '30. Zoom, DPI',
    source: `@startsalt
scale 2
{
<&person> Login | "MyName "
<&key> Password | "****  "
[<&circle-x> Cancel ] | [ <&account-login> OK ]
}
@endsalt`,
  },
  {
    title: '31. Zoom, DPI',
    source: `@startsalt
skinparam dpi 200
{
<&person> Login | "MyName "
<&key> Password | "****  "
[<&circle-x> Cancel ] | [ <&account-login> OK ]
}
@endsalt`,
  },
  {
    title: '32. Include Salt "on activity diagram"',
    source: `@startuml
(*) --> " {{salt
{+
<b>an example
choose one option
()one
()two
[ok]
}
}} " as choose

choose -right-> " {{salt
{+
<b>please wait
operation in progress <&clock>
[cancel]
}
}} " as wait

wait -right-> " {{salt
{+
<b>success
congratulations!
[ok]
}
}} " as success

wait -down-> " {{salt
{+
<b>error
failed, sorry
[ok]
}
}} "
@enduml`,
  },
  {
    title: '33. Include Salt "on activity diagram"',
    source: `@startuml
(*) --> "choose"
note right
{{
salt
{+
<b>an example
choose one option
()one
()two
[ok]
}
}}
end note
"choose" -right-> "wait"
note right
{{
salt
{+
<b>please wait
operation in progress <&clock>
[cancel]
}
}}
end note
"wait" -right-> "success"
note right
{{
salt
{+
<b>success
congratulations!
[ok]
}
}}
end note
"wait" -down-> "error"
note right
{{
salt
{+
<b>error
failed, sorry
[ok]
}
}}
end note
"success" --> (*)
@enduml`,
  },
  {
    title: '34. Include salt "on while condition of activity diagram"',
    source: `@startuml
start
while (\\n{{salt\\n{+\\nPassword | "****  "\\n[Cancel] | [ OK ]}\\n}}\\n) is (Incorrect)
  :log attempt;
  :attempt_count++;
  if (attempt_count > 4) then (yes)
    :increase delay timer;
    :wait for timer to expire;
  else (no)
  endif
endwhile (correct)
:log request;
:disable service;
@enduml`,
  },
  {
    title: '35. Include salt "on repeat while condition of activity diagram"',
    source: `@startuml
start
repeat
  :read data;
  :generate diagrams;
repeat while (\\n{{salt\\n{^"Next step"\\n Do you want to continue? \\n[Yes]|[No]\\n}\\n}}\\n)
stop
@enduml`,
  },
  {
    title: '36. Skinparam',
    source: `@startsalt
skinparam Backgroundcolor palegreen
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '37. Skinparam',
    source: `@startsalt
!option handwritten true
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '38. Skinparam',
    source: `@startsalt
skinparam defaultFontName monospaced
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '39. Style',
    source: `@startsalt
<style>
saltDiagram {
  BackgroundColor palegreen
}
</style>
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
  {
    title: '40. Style',
    source: `@startsalt
<style>
saltDiagram {
  Fontname Monospaced
  FontSize 10
  FontStyle italic
  LineThickness 0.5
  LineColor red
}
</style>
{+
Login | "MyName "
Password | "****  "
[Cancel] | [ OK ]
}
@endsalt`,
  },
];
