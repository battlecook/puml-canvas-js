// PlantUML activity-diagram examples extracted from https://plantuml.com/en/activity-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface ActivitySample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_ACTIVITY_LIST: ReadonlyArray<ActivitySample> = [
  {
    title: '1. Simple action',
    source: `@startuml
:Hello world;
:This is defined on several **lines**;
@enduml`,
  },
  {
    title: '2. Simple action list separated by `-`',
    source: `@startuml
- Action 1
- Action 2
- Action 3
@enduml`,
  },
  {
    title: '3. Simple action list separated by `*`',
    source: `@startuml
* Action 1
* Action 2
* Action 3
@enduml`,
  },
  {
    title: '4. With several levels',
    source: `@startuml
<style>
element {MinimumWidth 150}
</style>
* Action 1
** Sub-Action 1.1
** Sub-Action 1.2
*** Sub-Action 1.2.1
*** Sub-Action 1.2.2
* Action 2
@enduml`,
  },
  {
    title: '5. Start/Stop #1',
    source: `@startuml
start
:Hello world;
:This is defined on several **lines**;
stop
@enduml`,
  },
  {
    title: '6. Start/End',
    source: `@startuml
start
:Hello world;
:This is defined on several **lines**;
end
@enduml`,
  },
  {
    title: '7. Conditional #1',
    source: `@startuml
start
if (Graphviz installed?) then (yes)
:process all\\ndiagrams;
else (no)
:process only __sequence__ and __activity__ diagrams;
endif
stop
@enduml`,
  },
  {
    title: '8. Conditional #2',
    source: `@startuml
if (color?) is (<color:red>red) then
:print red;
else
:print not red;
endif
@enduml`,
  },
  {
    title: '9. Conditional #3',
    source: `@startuml
if (counter?) equals (5) then
:print 5;
else
:print not 5;
endif
@enduml`,
  },
  {
    title: '10. Several tests (horizontal mode)',
    source: `@startuml
start
if (condition A) then (yes)
:Text 1;
elseif (condition B) then (yes)
:Text 2;
stop (no)
elseif (condition C) then (yes)
:Text 3;
(no)
elseif (condition D) then (yes)
:Text 4;
else (nothing)
:Text else;
endif
stop
@enduml`,
  },
  {
    title: '11. Several tests (vertical mode)',
    source: `@startuml
!pragma useVerticalIf on
start
if (condition A) then (yes)
:Text 1;
elseif (condition B) then (yes)
:Text 2;
stop
elseif (condition C) then (yes)
:Text 3;
elseif (condition D) then (yes)
:Text 4;
else (nothing)
:Text else;
endif
stop
@enduml`,
  },
  {
    title: '12. Switch and case',
    source: `@startuml
start
switch (test?)
case ( condition A )
:Text 1;
case ( condition B )
:Text 2;
case ( condition C )
:Text 3;
case ( condition D )
:Text 4;
case ( condition E )
:Text 5;
endswitch
stop
@enduml`,
  },
  {
    title: '13. Conditional with stop on action #1',
    source: `@startuml
if (condition?) then
:error;
stop
endif
:action;
<<#palegreen>>
@enduml`,
  },
  {
    title: '14. Conditional with stop on action #2',
    source: `@startuml
if (condition?) then
:error;
<<#pink>>
kill
endif
:action;
<<#palegreen>>
@enduml`,
  },
  {
    title: '15. Conditional with stop on action #3',
    source: `@startuml
if (condition?) then
:error;
<<#pink>>
detach
endif
:action;
<<#palegreen>>
@enduml`,
  },
  {
    title: '16. Simple repeat loop',
    source: `@startuml
start
repeat
:read data;
:generate diagrams;
repeat while (more data?) is (yes) not (no)
stop
@enduml`,
  },
  {
    title: '17. Repeat with backward action',
    source: `@startuml
start
repeat
:foo as starting label;
:read data;
:generate diagrams;
backward:This is backward;
repeat while (more data?) is (yes) ->no;
stop
@enduml`,
  },
  {
    title: '18. Break on a repeat loop',
    source: `@startuml
start
repeat
:Test something;
if (Something went wrong?) then (no)
:OK;
<<#palegreen>>
break
endif
->NOK;
:Alert "Error with long text";
repeat while (Something went wrong with long text?) is (yes) not (no)
->//merged step//;
:Alert "Success";
stop
@enduml`,
  },
  {
    title: '19. Goto and Label Processing',
    source: `@startuml
title Point two queries to same activity\\nwith \`goto\`
start
if (Test Question?) then (yes)
'space label only for alignment
label sp_lab0
label sp_lab1
'real label
label lab
:shared;
else (no)
if (Second Test Question?) then (yes)
label sp_lab2
goto sp_lab1
else
:nonShared;
endif
endif
:merge;
@enduml`,
  },
  {
    title: '20. Simple while loop #1',
    source: `@startuml
start
while (data available?)
:read data;
:generate diagrams;
endwhile
stop
@enduml`,
  },
  {
    title: '21. Simple while loop #2',
    source: `@startuml
while (check filesize ?) is (not empty)
:read file;
endwhile (empty)
:close file;
@enduml`,
  },
  {
    title: '22. While loop with backward action',
    source: `@startuml
while (check filesize ?) is (not empty)
:read file;
backward:log;
endwhile (empty)
:close file;
@enduml`,
  },
  {
    title: '23. Infinite while loop',
    source: `@startuml
:Step 1;
if (condition1) then
while (loop forever)
:Step 2;
endwhile
-[hidden]->
detach
else
:end normally;
stop
endif
@enduml`,
  },
  {
    title: '24. Simple fork',
    source: `@startuml
start
fork
:action 1;
fork again
:action 2;
end fork
stop
@enduml`,
  },
  {
    title: '25. fork with end merge #1',
    source: `@startuml
start
fork
:action 1;
fork again
:action 2;
end merge
stop
@enduml`,
  },
  {
    title: '26. fork with end merge #2',
    source: `@startuml
start
fork
:action 1;
fork again
:action 2;
fork again
:action 3;
fork again
:action 4;
end merge
stop
@enduml`,
  },
  {
    title: '27. fork with end merge #3',
    source: `@startuml
start
fork
:action 1;
fork again
:action 2;
end end merge
stop
@enduml`,
  },
  {
    title: '28. Label on end fork (or)',
    source: `@startuml
start
fork
:action A;
fork again
:action B;
end fork {or}
stop
@enduml`,
  },
  {
    title: '29. Label on end fork (and)',
    source: `@startuml
start
fork
:action A;
fork again
:action B;
end fork {and}
stop
@enduml`,
  },
  {
    title: '30. Other example',
    source: `@startuml
start
if (multiprocessor?) then (yes)
fork
:Treatment 1;
fork again
:Treatment 2;
end fork
else (monoproc)
:Treatment 1;
:Treatment 2;
endif
@enduml`,
  },
  {
    title: '31. Split',
    source: `@startuml
start
split
:A;
split again
:B;
split again
:C;
split again
:a;
:b;
end split
:D;
end
@enduml`,
  },
  {
    title: '32. Input split (multi-start) #1',
    source: `@startuml
split -[hidden]->
:A;
split again -[hidden]->
:B;
split again -[hidden]->
:C;
end split
:D;
@enduml`,
  },
  {
    title: '33. Input split (multi-start) #2',
    source: `@startuml
split -[hidden]->
:A;
split again -[hidden]->
:a;
:b;
split again -[hidden]->
(Z)
end split
:D;
@enduml`,
  },
  {
    title: '34. Output split (multi-end) #1',
    source: `@startuml
start
split
:A;
kill
split again
:B;
detach
split again
:C;
kill
end split
@enduml`,
  },
  {
    title: '35. Output split (multi-end) #2',
    source: `@startuml
start
split
:A;
kill
split again
:b;
:c;
detach
split again
(Z)
detach
split again
end split again
stop
end split
@enduml`,
  },
  {
    title: '36. Notes #1',
    source: `@startuml
start
:foo1;
floating note left: This is a note
:foo2;
note right
This note is on several //lines//
and can contain <b>HTML</b>
====
* Calling the method ""foo()"" is prohibited
end note
stop
@enduml`,
  },
  {
    title: '37. Notes #2',
    source: `@startuml
start
repeat
:Enter data;
:Submit;
backward
:Warning;
note right: Note
repeat while (Valid?) is (No) not (Yes)
stop
@enduml`,
  },
  {
    title: '38. Notes #3',
    source: `@startuml
start
partition "**process** HelloWorld" {
note
This is my note
----
//Creole test//
end note
:Ready;
:HelloWorld(i);
<<output>>
:Hello-Sent;
}
@enduml`,
  },
  {
    title: '39. Colors #1',
    source: `@startuml
start
:starting progress;
:reading configuration files
These files should be edited at this point!;
<<#HotPink>>
:ending of the process;
<<#AAAAAA>>
@enduml`,
  },
  {
    title: '40. Colors #2',
    source: `@startuml
start
partition #red/white testPartition {
:testActivity;
<<#blue\\green>>
}
@enduml`,
  },
  {
    title: '41. Lines without arrows #1',
    source: `@startuml
skinparam ArrowHeadColor none
start
:Hello world;
:This is on defined on several **lines**;
stop
@enduml`,
  },
  {
    title: '42. Lines without arrows #2',
    source: `@startuml
skinparam ArrowHeadColor none
start
repeat
:Enter data;
:Submit;
backward
:Warning;
repeat while (Valid?) is (No) not (Yes)
stop
@enduml`,
  },
  {
    title: '43. Arrows',
    source: `@startuml
:foo1;
-> You can put text on arrows;
if (test) then
-[#blue]->
:foo2;
-[#green,dashed]->
The text can also be on several lines and **very** long...;
:foo3;
else
-[#black,dotted]->
:foo4;
endif
-[#gray,bold]->
:foo5;
@enduml`,
  },
  {
    title: '44. Simple colored arrow [link]',
    source: `@startuml
:a;
link #blue
:b;
@enduml`,
  },
  {
    title: '45. Multiple colored arrow',
    source: `@startuml
skinparam colorArrowSeparationSpace 1
start
-[#red;#green;#orange;#blue]->
if(a?)then(yes)
-[#red]->
:activity;
-[#red]->
if(c?)then(yes)
-[#maroon,dashed]->
else(no)
-[#red]->
if(b?)then(yes)
-[#maroon,dashed]->
else(no)
-[#blue,dashed;dotted]->
:do a;
-[#red]->
:do b;
-[#red]->
endif
-[#red;#maroon,dashed]->
endif
-[#red;#maroon,dashed]->
elseif(e?)then(yes)
-[#green]->
if(c?)then(yes)
-[#maroon,dashed]->
else(no)
-[#green]->
if(d?)then(yes)
-[#maroon,dashed]->
else(no)
-[#green]->
:do something;
<<continuous>>
-[#green]->
endif
-[#green;#maroon,dashed]->
partition dummy {
:some function;
}
-[#green;#maroon,dashed]->
endif
-[#green;#maroon,dashed]->
elseif(f?)then(yes)
-[#orange]->
:activity;
<<continuous>>
-[#orange]->
else(no)
-[#blue,dashed;dotted]->
endif
stop
@enduml`,
  },
  {
    title: '46. Connector (or Circle)',
    source: `@startuml
start
:Some activity;
(A)
detach
(A)
:Other activity;
@enduml`,
  },
  {
    title: '47. Color on connector #1',
    source: `@startuml
start
:The connector below wishes he was blue;
#blue:(B)
:This next connector feels that she would be better off green;
#green:(G)
stop
@enduml`,
  },
  {
    title: '48. Color on connector #2',
    source: `@startuml
<style>
circle {
Backgroundcolor palegreen
LineColor green
LineThickness 2
}
</style>
(1)
:a;
(A)
@enduml`,
  },
  {
    title: '49. Group',
    source: `@startuml
start
group Initialization {
:read config file;
:init internal variable;
}
group Running group {
:wait for user interaction;
:print information;
}
stop
@enduml`,
  },
  {
    title: '50. Partition #1',
    source: `@startuml
start
partition Initialization {
:read config file;
:init internal variable;
}
partition Running {
:wait for user interaction;
:print information;
}
stop
@enduml`,
  },
  {
    title: '51. Partition #2',
    source: `@startuml
start
partition #lightGreen "Input Interface" {
:read config file;
:init internal variable;
}
partition Running {
:wait for user interaction;
:print information;
}
stop
@enduml`,
  },
  {
    title: '52. Partition #3',
    source: `@startuml
start
partition "[[http://plantuml.com partition_name]]" {
:read doc. on [[http://plantuml.com plantuml_website]];
:test diagram;
}
end
@enduml`,
  },
  {
    title: '53. Group, Partition, Package, Rectangle, Card',
    source: `@startuml
start
group Group {
:Activity;
}
floating note: Note on Group
partition Partition {
:Activity;
}
floating note: Note on Partition
package Package {
:Activity;
}
floating note: Note on Package
rectangle Rectangle {
:Activity;
}
floating note: Note on Rectangle
card Card {
:Activity;
}
floating note: Note on Card
end
@enduml`,
  },
  {
    title: '54. Swimlanes #1',
    source: `@startuml
|Swimlane1|
start
:foo1;
|#AntiqueWhite|Swimlane2|
:foo2;
:foo3;
|Swimlane1|
:foo4;
|Swimlane2|
:foo5;
stop
@enduml`,
  },
  {
    title: '55. Swimlanes #2',
    source: `@startuml
|#pink|Actor_For_red|
start
if (color?) is (red) then
:**action red**;
<<#pink>>
:foo1;
else (not red)
|#lightgray|Actor_For_no_red|
:**action not red**;
<<#lightgray>>
:foo2;
endif
|Next_Actor|
:foo3;
<<#lightblue>>
:foo4;
|Final_Actor|
:foo5;
<<#palegreen>>
stop
@enduml`,
  },
  {
    title: '56. Swimlanes #3',
    source: `@startuml
|#palegreen|f| fisherman
|c| cook
|#gold|e| eater
|f|
start
:go fish;
|c|
:fry fish;
|e|
:eat fish;
stop
@enduml`,
  },
  {
    title: '57. Detach or kill #1',
    source: `@startuml
:start;
fork
:foo1;
:foo2;
fork again
:foo3;
detach
endfork
if (foo4) then
:foo5;
detach
endif
:foo6;
detach
:foo7;
stop
@enduml`,
  },
  {
    title: '58. Detach or kill #2',
    source: `@startuml
:start;
fork
:foo1;
:foo2;
fork again
:foo3;
kill
endfork
if (foo4) then
:foo5;
kill
endif
:foo6;
kill
:foo7;
stop
@enduml`,
  },
  {
    title: '59. Emoji as action (with `icon` stereotype)',
    source: `@startuml
while (<:cloud_with_rain:>)
:<:umbrella:>;
<<icon>>
endwhile
-<<icon>><:closed_umbrella:>
@enduml`,
  },
  {
    title: '60. SDL using stereotype #1',
    source: `@startuml
start
:SDL Shape;
:input;
<<input>>
:output;
<<output>>
:procedure;
<<procedure>>
:load;
<<load>>
:save;
<<save>>
:continuous;
<<continuous>>
:task;
<<task>>
end
@enduml`,
  },
  {
    title: '61. SDL using stereotype #2',
    source: `@startuml
:Ready;
:next(o);
<<procedure>>
:Receiving;
split
:nak(i);
<<input>>
:ack(o);
<<output>>
split again
:ack(i);
<<input>>
:next(o) on several lines;
<<procedure>>
:i := i + 1;
<<task>>
:ack(o);
<<output>>
split again
:err(i);
<<input>>
:nak(o);
<<output>>
split again
:foo;
<<save>>
split again
:bar;
<<load>>
split again
:i > 5;
<<continuous>>
stop
end split
:finish;
@enduml`,
  },
  {
    title: '62. UML Shape Example using Stereotype',
    source: `@startuml
:action;
:object;
<<object>>
:ObjectNode typed by signal;
<<objectSignal>>
:AcceptEventAction without TimeEvent trigger;
<<acceptEvent>>
:SendSignalAction;
<<sendSignal>>
:SendObjectAction with signal type;
<<sendSignal>>
:Trigger;
<<trigger>>
:\\t\\t\\t\\t\\t\\tAcceptEventAction \\t\\t\\t\\t\\t\\twith TimeEvent trigger;
<<timeEvent>>
:an action;
@enduml`,
  },
  {
    title: '63. Complete example',
    source: `@startuml
start
:ClickServlet.handleRequest();
:new page;
if (Page.onSecurityCheck) then (true)
:Page.onInit();
if (isForward?) then (no)
:Process controls;
if (continue processing?) then (no)
stop
endif
if (isPost?) then (yes)
:Page.onPost();
else (no)
:Page.onGet();
endif
:Page.onRender();
endif
else (false)
endif
if (do redirect?) then (yes)
:redirect process;
else
if (do forward?) then (yes)
:Forward request;
else (no)
:Render page template;
endif
endif
stop
@enduml`,
  },
  {
    title: '64. Inside style (by default) #1',
    source: `@startuml
skinparam conditionStyle inside
start
repeat
:act1;
:act2;
repeatwhile (<b>end)
:act3;
@enduml`,
  },
  {
    title: '65. Inside style (by default) #2',
    source: `@startuml
start
repeat
:act1;
:act2;
repeatwhile (<b>end)
:act3;
@enduml`,
  },
  {
    title: '66. Diamond style',
    source: `@startuml
skinparam conditionStyle diamond
start
repeat
:act1;
:act2;
repeatwhile (<b>end)
:act3;
@enduml`,
  },
  {
    title: '67. InsideDiamond (Foo1) #1',
    source: `@startuml
skinparam conditionStyle InsideDiamond
start
repeat
:act1;
:act2;
repeatwhile (<b>end)
:act3;
@enduml`,
  },
  {
    title: '68. InsideDiamond (Foo1) #2',
    source: `@startuml
skinparam conditionStyle foo1
start
repeat
:act1;
:act2;
repeatwhile (<b>end)
:act3;
@enduml`,
  },
  {
    title: '69. ConditionEndStyle diamond #1',
    source: `@startuml
skinparam ConditionEndStyle diamond
:A;
if (decision) then (yes)
:B1;
else (no)
endif
:C;
@enduml`,
  },
  {
    title: '70. ConditionEndStyle diamond #2',
    source: `@startuml
skinparam ConditionEndStyle diamond
:A;
if (decision) then (yes)
:B1;
else (no)
:B2;
endif
:C;
@enduml`,
  },
  {
    title: '71. ConditionEndStyle hline #1',
    source: `@startuml
skinparam ConditionEndStyle hline
:A;
if (decision) then (yes)
:B1;
else (no)
endif
:C;
@enduml`,
  },
  {
    title: '72. ConditionEndStyle hline #2',
    source: `@startuml
skinparam ConditionEndStyle hline
:A;
if (decision) then (yes)
:B1;
else (no)
:B2;
endif
:C;
@enduml`,
  },
  {
    title: '73. Without style (by default)',
    source: `@startuml
start
:init;
-> test of color;
if (color?) is (<color:red>red) then
:print red;
else
:print not red;
note right: no color
endif
partition End {
:end;
}
-> this is the end;
end
@enduml`,
  },
  {
    title: '74. With style',
    source: `@startuml
<style>
activityDiagram {
BackgroundColor #33668E
BorderColor #33668E
FontColor #888
FontName arial
diamond {
BackgroundColor #ccf
LineColor #00FF00
FontColor green
FontName arial
FontSize 15
}
arrow {
FontColor gold
FontName arial
FontSize 15
}
partition {
LineColor red
FontColor green
RoundCorner 10
BackgroundColor PeachPuff
}
note {
FontColor Blue
LineColor Navy
BackgroundColor #ccf
}
}
document {
BackgroundColor transparent
}
</style>
start
:init;
-> test of color;
if (color?) is (<color:red>red) then
:print red;
else
:print not red;
note right: no color
endif
partition End {
:end;
}
-> this is the end;
end
@enduml`,
  },
  {
    title: '75. Creole on Activity',
    source: `@startuml
:Creole: wave: ~~wave~~ bold: **bold** italics: //italics// monospaced: ""monospaced"" stricken-out: --stricken-out-- underlined: __underlined__ not-underlined: ~__not underlined__ wave-underlined: ~~wave-underlined~~;
:HTML Creole: bold: <b>bold italics: <i>italics monospaced: <font:monospaced>monospaced stroked: <s>stroked underlined: <u>underlined waved: <w>waved green-stroked: <s:green>stroked red-underlined: <u:red>underlined blue-waved: <w:#0000FF>waved Blue: <color:blue>Blue Orange: <back:orange>Orange background big: <size:20>big;
:Graphic: OpenIconic: account-login <&account-login> Unicode: This is <U+221E> long Emoji: <:calendar:> Calendar Image: <img:https://plantuml.com/logo3.png>;
@enduml`,
  },
];
