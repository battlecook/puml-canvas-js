// PlantUML mindmap-diagram examples extracted from https://plantuml.com/en/mindmap-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface MindmapSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_MINDMAP_LIST: ReadonlyArray<MindmapSample> = [
  {
    title: '1. OrgMode syntax',
    source: `@startmindmap
* Debian
** Ubuntu
*** Linux Mint
*** Kubuntu
*** Lubuntu
*** KDE Neon
** LMDE
** SolydXK
** SteamOS
** Raspbian with a very long name
*** <s>Raspmbc</s> => OSMC
*** <s>Raspyfi</s> => Volumio
@endmindmap`,
  },
  {
    title: '2. Markdown Header',
    source: `@startmindmap
# root node
## some first level node
### second level node
### another second level node
## another first level node
@endmindmap`,
  },
  {
    title: '3. Markdown indented list',
    source: `@startmindmap
* root node
* some first level node
* second level node
* another second level node
* another first level node
@endmindmap`,
  },
  {
    title: '4. Arithmetic notation',
    source: `@startmindmap
+ OS
++ Ubuntu
+++ Linux Mint
+++ Kubuntu
+++ Lubuntu
+++ KDE Neon
++ LMDE
++ SolydXK
++ SteamOS
++ Raspbian
-- Windows 95
-- Windows 98
-- Windows NT
--- Windows 8
--- Windows 10
@endmindmap`,
  },
  {
    title: '5. Multilines',
    source: `@startmindmap
* Class Templates
**:Example 1
<code>
template <typename T>
class cname{
void f1()<U+003B>
...
}
</code>
;
**:Example 2
<code>
other template <typename T>
class cname{
...
</code>
;
@endmindmap`,
  },
  {
    title: '6. Multilines',
    source: `@startmindmap
+ root
**:right_1.1
right_1.2;
++ right_2
left side
-- left_1
-- left_2
**:left_3.1
left_3.2;
@endmindmap`,
  },
  {
    title: '7. Multiroot Mindmap',
    source: `@startmindmap
* Root 1
** Foo
** Bar
* Root 2
** Lorem
** Ipsum
@endmindmap`,
  },
  {
    title: '8. With inline color',
    source: `@startmindmap
*[#Orange] Colors
**[#lightgreen] Green
**[#FFBBCC] Rose
**[#lightblue] Blue
@endmindmap`,
  },
  {
    title: '9. With inline color',
    source: `@startmindmap
+[#Orange] Colors
++[#lightgreen] Green
++[#FFBBCC] Rose
--[#lightblue] Blue
@endmindmap`,
  },
  {
    title: '10. With inline color',
    source: `@startmindmap
*[#Orange] root node
*[#lightgreen] some first level node
*[#FFBBCC] second level node
*[#lightblue] another second level node
*[#lightgreen] another first level node
@endmindmap`,
  },
  {
    title: '11. With style color',
    source: `@startmindmap
<style>
mindmapDiagram {
.green {
BackgroundColor lightgreen
}
.rose {
BackgroundColor #FFBBCC
}
.your_style_name {
BackgroundColor lightblue
}
}
</style>
* Colors
** Green <<green>>
** Rose <<rose>>
** Blue <<your_style_name>>
@endmindmap`,
  },
  {
    title: '12. With style color',
    source: `@startmindmap
<style>
mindmapDiagram {
.green {
BackgroundColor lightgreen
}
.rose {
BackgroundColor #FFBBCC
}
.your_style_name {
BackgroundColor lightblue
}
}
</style>
+ Colors
++ Green <<green>>
++ Rose <<rose>>
-- Blue <<your_style_name>>
@endmindmap`,
  },
  {
    title: '13. With style color',
    source: `@startmindmap
<style>
mindmapDiagram {
.green {
BackgroundColor lightgreen
}
.rose {
BackgroundColor #FFBBCC
}
.your_style_name {
BackgroundColor lightblue
}
}
</style>
* root node
* some first level node <<green>>
* second level node <<rose>>
* another second level node <<your_style_name>>
* another first level node <<green>>
@endmindmap`,
  },
  {
    title: '14. With style color',
    source: `@startmindmap
<style>
mindmapDiagram {
.myStyle * {
BackgroundColor lightgreen
}
}
</style>
+ root
++ b1 <<myStyle>>
+++ b11
+++ b12
++ b2
@endmindmap`,
  },
  {
    title: '15. Removing box',
    source: `@startmindmap
* root node
** some first level node
***_ second level node
***_ another second level node
***_ foo
***_ bar
***_ foobar
** another first level node
@endmindmap`,
  },
  {
    title: '16. Removing box',
    source: `@startmindmap
*_ root node
**_ some first level node
***_ second level node
***_ another second level node
***_ foo
***_ bar
***_ foobar
**_ another first level node
@endmindmap`,
  },
  {
    title: '17. Removing box',
    source: `@startmindmap
+ root node
++ some first level node
+++_ second level node
+++_ another second level node
+++_ foo
+++_ bar
+++_ foobar
++_ another first level node
-- some first right level node
--_ another first right level node
@endmindmap`,
  },
  {
    title: '18. Changing diagram direction',
    source: `@startmindmap
* count
** 100
*** 101
*** 102
** 200 left side
** A
*** AA
*** AB
** B
@endmindmap`,
  },
  {
    title: '19. Left to right direction (by default)',
    source: `@startmindmap
* 1
** 2
*** 4
*** 5
** 3
*** 6
*** 7
@endmindmap`,
  },
  {
    title: '20. Top to bottom direction',
    source: `@startmindmap
top to bottom direction
* 1
** 2
*** 4
*** 5
** 3
*** 6
*** 7
@endmindmap`,
  },
  {
    title: '21. Right to left direction',
    source: `@startmindmap
right to left direction
* 1
** 2
*** 4
*** 5
** 3
*** 6
*** 7
@endmindmap`,
  },
  {
    title: '22. Bottom to top direction',
    source: `@startmindmap
top to bottom direction left side
* 1
** 2
*** 4
*** 5
** 3
*** 6
*** 7
@endmindmap`,
  },
  {
    title: '23. Complete example',
    source: `@startmindmap
caption figure 1
title My super title
* <&flag>Debian
** <&globe>Ubuntu
*** Linux Mint
*** Kubuntu
*** Lubuntu
*** KDE Neon
** <&graph>LMDE
** <&pulse>SolydXK
** <&people>SteamOS
** <&star>Raspbian with a very long name
*** <s>Raspmbc</s> => OSMC
*** <s>Raspyfi</s> => Volumio
header
My super header
endheader
center footer My super footer
legend right
Short legend
endlegend
@endmindmap`,
  },
  {
    title: '24. node, depth',
    source: `@startmindmap
<style>
mindmapDiagram {
node {
BackgroundColor lightGreen
}
:depth(1) {
BackGroundColor white
}
}
</style>
* Linux
** NixOS
** Debian
*** Ubuntu
**** Linux Mint
**** Kubuntu
**** Lubuntu
**** KDE Neon
@endmindmap`,
  },
  {
    title: '25. boxless',
    source: `@startmindmap
<style>
mindmapDiagram {
node {
BackgroundColor lightGreen
}
boxless {
FontColor darkgreen
}
}
</style>
* Linux
** NixOS
** Debian
***_ Ubuntu
**** Linux Mint
**** Kubuntu
**** Lubuntu
**** KDE Neon
@endmindmap`,
  },
  {
    title: '26. Word Wrap',
    source: `@startmindmap
<style>
node {
Padding 12
Margin 3
HorizontalAlignment center
LineColor blue
LineThickness 3.0
BackgroundColor gold
RoundCorner 40
MaximumWidth 100
}
rootNode {
LineStyle 8.0;3.0
LineColor red
BackgroundColor white
LineThickness 1.0
RoundCorner 0
Shadowing 0.0
}
leafNode {
LineColor gold
RoundCorner 0
Padding 3
}
arrow {
LineStyle 4
LineThickness 0.5
LineColor green
}
</style>
* Hi =)
** sometimes i have node in wich i want to write a long text
*** this results in really huge diagram
**** of course, i can explicit split with a\\nnew line
**** but it could be cool if PlantUML was able to split long lines, maybe with an option
@endmindmap`,
  },
  {
    title: '27. Creole on Mindmap diagram',
    source: `@startmindmap
* Creole on Mindmap left side
**:==Creole
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
;
**:
<b>HTML Creole
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
;
right side
**:==Creole line
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
Enjoy!;
**:==Creole list item
**test list 1**
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
;
@endmindmap`,
  },
];
