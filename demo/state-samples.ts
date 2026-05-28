// PlantUML state-diagram examples extracted from https://plantuml.com/en/state-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface StateSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_STATE_LIST: ReadonlyArray<StateSample> = [
  {
    title: '1. Simple State',
    source: `@startuml
[*] --> State1
State1 --> [*]
State1 : this is a string
State1 : this is another string
State1 -> State2
State2 --> [*]
@enduml`,
  },
  {
    title: '2. Change state rendering',
    source: `@startuml
hide empty description
[*] --> State1
State1 --> [*]
State1 : this is a string
State1 : this is another string
State1 -> State2
State2 --> [*]
@enduml`,
  },
  {
    title: '3. Composite state',
    source: `@startuml
scale 350 width
[*] --> NotShooting
state NotShooting {
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
state Configuring {
  [*] --> NewValueSelection
  NewValueSelection --> NewValuePreview : EvNewValue
  NewValuePreview --> NewValueSelection : EvNewValueRejected
  NewValuePreview --> NewValueSelection : EvNewValueSaved
  state NewValuePreview {
    State1 -> State2
  }
}
@enduml`,
  },
  {
    title: '4. Composite state',
    source: `@startuml
state A {
  state X {
  }
  state Y {
  }
}
state B {
  state Z {
  }
}
X --> Z
Z --> Y
@enduml`,
  },
  {
    title: '5. Composite state',
    source: `@startuml
state A.X
state A.Y
state B.Z
X --> Z
Z --> Y
@enduml`,
  },
  {
    title: '6. Long name',
    source: `@startuml
scale 600 width
[*] -> State1
State1 --> State2 : Succeeded
State1 --> [*] : Aborted
State2 --> State3 : Succeeded
State2 --> [*] : Aborted
state State3 {
  state "Accumulate Enough Data\\nLong State Name" as long1
  long1 : Just a test
  [*] --> long1
  long1 --> long1 : New Data
  long1 --> ProcessData : Enough Data
}
State3 --> State3 : Failed
State3 --> [*] : Succeeded / Save Result
State3 --> [*] : Aborted
@enduml`,
  },
  {
    title: '7. History [[H], [H*]]',
    source: `@startuml
[*] -> State1
State1 --> State2 : Succeeded
State1 --> [*] : Aborted
State2 --> State3 : Succeeded
State2 --> [*] : Aborted
state State3 {
  state "Accumulate Enough Data" as long1
  long1 : Just a test
  [*] --> long1
  long1 --> long1 : New Data
  long1 --> ProcessData : Enough Data
  State2 --> [H]: Resume
}
State3 --> State2 : Pause
State2 --> State3[H*]: DeepResume
State3 --> State3 : Failed
State3 --> [*] : Succeeded / Save Result
State3 --> [*] : Aborted
@enduml`,
  },
  {
    title: '8. Fork [fork, join]',
    source: `@startuml
state fork_state <<fork>>
[*] --> fork_state
fork_state --> State2
fork_state --> State3
state join_state <<join>>
State2 --> join_state
State3 --> join_state
join_state --> State4
State4 --> [*]
@enduml`,
  },
  {
    title: '9. Concurrent state [--, ||]',
    source: `@startuml
[*] --> Active
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn : EvNumLockPressed
  NumLockOn --> NumLockOff : EvNumLockPressed
  --
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn : EvCapsLockPressed
  CapsLockOn --> CapsLockOff : EvCapsLockPressed
  --
  [*] -> ScrollLockOff
  ScrollLockOff --> ScrollLockOn : EvScrollLockPressed
  ScrollLockOn --> ScrollLockOff : EvScrollLockPressed
}
@enduml`,
  },
  {
    title: '10. Concurrent state [--, ||]',
    source: `@startuml
[*] --> Active
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn : EvNumLockPressed
  NumLockOn --> NumLockOff : EvNumLockPressed
  ||
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn : EvCapsLockPressed
  CapsLockOn --> CapsLockOff : EvCapsLockPressed
  ||
  [*] -> ScrollLockOff
  ScrollLockOff --> ScrollLockOn : EvScrollLockPressed
  ScrollLockOn --> ScrollLockOff : EvScrollLockPressed
}
@enduml`,
  },
  {
    title: '11. Conditional [choice]',
    source: `@startuml
state "Req(Id)" as ReqId <<sdlreceive>>
state "Minor(Id)" as MinorId
state "Major(Id)" as MajorId
state c <<choice>>
Idle --> ReqId
ReqId --> c
c --> MinorId : [Id <= 10]
c --> MajorId : [Id > 10]
@enduml`,
  },
  {
    title: '12. Stereotypes full example [start, choice, fork, join, end, history, history*]',
    source: `@startuml
state start1 <<start>>
state choice1 <<choice>>
state fork1 <<fork>>
state join2 <<join>>
state end3 <<end>>
[*] --> choice1 : from start\\nto choice
start1 --> choice1 : from start stereo\\nto choice
choice1 --> fork1 : from choice\\nto fork
choice1 --> join2 : from choice\\nto join
choice1 --> end3 : from choice\\nto end stereo
fork1 ---> State1 : from fork\\nto state
fork1 --> State2 : from fork\\nto state
State2 --> join2 : from state\\nto join
State1 --> [*] : from state\\nto end
join2 --> [*] : from join\\nto end
@enduml`,
  },
  {
    title: '13. Stereotypes full example [start, choice, fork, join, end, history, history*]',
    source: `@startuml
state A {
  state s1 as "Start 1" <<start>>
  state s2 as "H 2" <<history>>
  state s3 as "H 3" <<history*>>
}
@enduml`,
  },
  {
    title: '14. Stereotypes full example [start, choice, fork, join, end, history, history*]',
    source: `@startuml
state start1 <<start>>
state choice1 <<choice>>
state fork1 <<fork>>
state join2 <<join>>
state end3 <<end>>
state sdlreceive <<sdlreceive>>
state history <<history>>
state history2 <<history*>>
@enduml`,
  },
  {
    title: '15. Point [entryPoint, exitPoint]',
    source: `@startuml
state Somp {
  state entry1 <<entryPoint>>
  state entry2 <<entryPoint>>
  state sin
  state exitA <<exitPoint>>
  entry1 --> sin
  entry2 -> sin
  sin -> sin2
  sin2 --> exitA
}
[*] --> entry1
exitA --> Foo
Foo1 -> entry2
@enduml`,
  },
  {
    title: '16. Pin [inputPin, outputPin]',
    source: `@startuml
state Somp {
  state entry1 <<inputPin>>
  state entry2 <<inputPin>>
  state sin
  state exitA <<outputPin>>
  entry1 --> sin
  entry2 -> sin
  sin -> sin2
  sin2 --> exitA
}
[*] --> entry1
exitA --> Foo
Foo1 -> entry2
@enduml`,
  },
  {
    title: '17. Expansion [expansionInput, expansionOutput]',
    source: `@startuml
state Somp {
  state entry1 <<expansionInput>>
  state entry2 <<expansionInput>>
  state sin
  state exitA <<expansionOutput>>
  entry1 --> sin
  entry2 -> sin
  sin -> sin2
  sin2 --> exitA
}
[*] --> entry1
exitA --> Foo
Foo1 -> entry2
@enduml`,
  },
  {
    title: '18. Arrow direction',
    source: `@startuml
[*] -up-> First
First -right-> Second
Second --> Third
Third -left-> Last
@enduml`,
  },
  {
    title: '19. Change line color and style',
    source: `@startuml
State S1
State S2
S1 -[#DD00AA]-> S2
S1 -left[#yellow]-> S3
S1 -up[#red,dashed]-> S4
S1 -right[dotted,#blue]-> S5
X1 -[dashed]-> X2
Z1 -[dotted]-> Z2
Y1 -[#blue,bold]-> Y2
@enduml`,
  },
  {
    title: '20. Change head or tail of arrow line',
    source: `@startuml
state a
a -> b : -> c
x-> d : x-> e
->o f : ->o
g x->o h : x->o
@enduml`,
  },
  {
    title: '21. Note',
    source: `@startuml
[*] --> Active
Active --> Inactive
note left of Active : this is a short\\nnote
note right of Inactive
  A note can also
  be defined on several lines
end note
@enduml`,
  },
  {
    title: '22. Note',
    source: `@startuml
state start <<start>>
start -> A
note left of start : this is a short note on start state
end <<end>>
A -> end
note right of end
  note on end
end note
@enduml`,
  },
  {
    title: '23. Note',
    source: `@startuml
state foo
note "This is a floating note" as N1
@enduml`,
  },
  {
    title: '24. Note on link',
    source: `@startuml
[*] -> State1
State1 --> State2
note on link
  this is a state-transition note
end note
@enduml`,
  },
  {
    title: '25. More in notes',
    source: `@startuml
[*] --> NotShooting
state "Not Shooting State" as NotShooting {
  state "Idle mode" as Idle
  state "Configuring mode" as Configuring
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
note right of NotShooting : This is a note on a composite state
@enduml`,
  },
  {
    title: '26. Inline color',
    source: `@startuml
state CurrentSite #pink {
  state HardwareSetup #lightblue {
    state Site #brown
    Site -[hidden]-> Controller
    Controller -[hidden]-> Devices
  }
  state PresentationSetup{
    Groups -[hidden]-> PlansAndGraphics
  }
  state Trends #FFFF77
  state Schedule #magenta
  state AlarmSupression
}
@enduml`,
  },
  {
    title: '27. Skinparam',
    source: `@startuml
skinparam backgroundColor LightYellow
skinparam state {
  StartColor MediumBlue
  EndColor Red
  BackgroundColor Peru
  BackgroundColor<<Warning>> Olive
  BorderColor Gray
  FontName Impact
}
[*] --> NotShooting
state "Not Shooting State" as NotShooting {
  state "Idle mode" as Idle <<Warning>>
  state "Configuring mode" as Configuring
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
NotShooting --> [*]
@enduml`,
  },
  {
    title: '28. Skinparam',
    source: `@startuml
skinparam State {
  AttributeFontColor blue
  AttributeFontName serif
  AttributeFontSize 9
  AttributeFontStyle italic
  BackgroundColor palegreen
  BorderColor violet
  EndColor gold
  FontColor red
  FontName Sansserif
  FontSize 15
  FontStyle bold
  StartColor silver
}
state A : a a a\\na
state B : b b b\\nb
[*] -> A : start
A -> B : a2b
B -> [*] : end
@enduml`,
  },
  {
    title: '29. Changing style',
    source: `@startuml
<style>
stateDiagram {
  BackgroundColor Peru
  'LineColor Gray
  FontName Impact
  FontColor Red
  arrow {
    FontSize 13
    LineColor Blue
  }
}
</style>
[*] --> NotShooting
state "Not Shooting State" as NotShooting {
  state "Idle mode" as Idle <<Warning>>
  state "Configuring mode" as Configuring
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
NotShooting --> [*]
@enduml`,
  },
  {
    title: '30. Changing style',
    source: `@startuml
<style>
diamond {
  BackgroundColor #palegreen
  LineColor #green
  LineThickness 2.5
}
</style>
state state1
state state2
state choice1 <<choice>>
state end3 <<end>>
state1 --> choice1 : 1
choice1 --> state2 : 2
choice1 --> end3 : 3
@enduml`,
  },
  {
    title: '31. Change state color and style (inline style)',
    source: `@startuml
state FooGradient #red-green ##00FFFF
state FooDashed #red|green ##[dashed]blue {
}
state FooDotted ##[dotted]blue {
}
state FooBold ##[bold] {
}
state Foo1 ##[dotted]green {
  state inner1 ##[dotted]yellow
}
state out ##[dotted]gold
state Foo2 ##[bold]green {
  state inner2 ##[dotted]yellow
}
inner1 -> inner2
out -> inner2
@enduml`,
  },
  {
    title: '32. Change state color and style (inline style)',
    source: `@startuml
@startuml
state FooGradient #red-green;line:00FFFF
state FooDashed #red|green;line.dashed;line:blue {
}
state FooDotted #line.dotted;line:blue {
}
state FooBold #line.bold {
}
state Foo1 #line.dotted;line:green {
  state inner1 #line.dotted;line:yellow
}
state out #line.dotted;line:gold
state Foo2 #line.bold;line:green {
  state inner2 #line.dotted;line:yellow
}
inner1 -> inner2
out -> inner2
@enduml
@enduml`,
  },
  {
    title: '33. Change state color and style (inline style)',
    source: `@startuml
state s1 : s1 description
state s2 #pink;line:red;line.bold;text:red : s2 description
state s3 #palegreen;line:green;line.dashed;text:green : s3 description
state s4 #aliceblue;line:blue;line.dotted;text:blue : s4 description
@enduml`,
  },
  {
    title: '34. Alias',
    source: `@startuml
state alias1
state "alias2"
state "long name" as alias3
state alias4 as "long name"
alias1 : ""state alias1""
alias2 : ""state "alias2"""
alias3 : ""state "long name" as alias3""
alias4 : ""state alias4 as "long name"""
alias1 -> alias2
alias2 -> alias3
alias3 -> alias4
@enduml`,
  },
  {
    title: '35. Alias',
    source: `@startuml
state alias1 : ""state alias1""
state "alias2" : ""state "alias2"""
state "long name" as alias3 : ""state "long name" as alias3""
state alias4 as "long name" : ""state alias4 as "long name"""
alias1 -> alias2
alias2 -> alias3
alias3 -> alias4
@enduml`,
  },
  {
    title: '36. Display JSON Data on State diagram',
    source: `@startuml
state "A" as stateA
state "C" as stateC {
  state B
}
json jsonJ {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
@enduml`,
  },
  {
    title: '37. State description',
    source: `@startuml
hide empty description
state s0
state "This is the State 1" as s1 {
  s1: State description
  state s2
  state s3: long descr.
  state s4
  s4: long descr.
}
[*] -> s0
s0 --> s2
s2 -> s3
s3 -> s4
@enduml`,
  },
  {
    title: '38. Style for Nested State Body',
    source: `@startuml
<style>
.foo {
  state,stateBody {
    BackGroundColor lightblue;
  }
}
</style>
state MainState <<foo>> {
  state SubA
}
@enduml`,
  },
  {
    title: '39. Mainframe and frame',
    source: `@startuml
mainframe mainframe
state a
state b
a --> b
b--> [*]
@enduml`,
  },
  {
    title: '40. Mainframe and frame',
    source: `@startuml
frame frame {
  state a
}
state b
a --> b
b--> [*]
@enduml`,
  },
  {
    title: '41. Specific SkinParameter',
    source: `@startuml
[*] --> State1
State1 --> State2 : next step
State2 --> State3 : next step
State3 --> [*]
@enduml`,
  },
  {
    title: '42. Specific SkinParameter',
    source: `@startuml
[*] --> Opened
Opened --> Closed : close
Opened <-- Closed : open
Closed --> Locked : lock
Closed <-- Locked : unlock
@enduml`,
  },
  {
    title: '43. Specific SkinParameter',
    source: `@startuml
skinparam stateDiagramEdgeLabelStyle node
skinparam ranksep 20
[*] --> State1
State1 --> State2 : next step
State2 --> State3 : next step
State3 --> [*]
@enduml`,
  },
  {
    title: '44. Specific SkinParameter',
    source: `@startuml
skinparam stateDiagramEdgeLabelStyle node
skinparam ranksep 20
[*] --> Opened
Opened --> Closed : close
Opened <-- Closed : open
Closed --> Locked : lock
Closed <-- Locked : unlock
@enduml`,
  },
  {
    title: '45. Specific SkinParameter',
    source: `@startuml
skinparam ranksep 30
[*] --> State1
State1 --> State2 : next step
State2 -[node]-> State3 : next step\\n(on the middle of the arrow)
State3 --> [*]
@enduml`,
  },
];
