// PlantUML component-diagram examples extracted from https://plantuml.com/en/component-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface ComponentSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_COMPONENT_LIST: ReadonlyArray<ComponentSample> = [
  {
    title: '1. Components',
    source: `@startuml
[First component]
[Another component] as Comp2
component Comp3
component [Last\\ncomponent] as Comp4
@enduml`,
  },
  {
    title: '2. Naming exceptions',
    source: `@startuml
component [$C1]
component [$C2] $C2
component [$C2] as dollarC2
remove $C1
remove $C2
remove dollarC2
@enduml`,
  },
  {
    title: '3. Interfaces',
    source: `@startuml
() "First Interface"
() "Another interface" as Interf2
interface Interf3
interface "Last\\ninterface" as Interf4
[component]
footer //Adding "component" to force diagram to be a **component diagram**//
@enduml`,
  },
  {
    title: '4. Basic example',
    source: `@startuml
DataAccess - [First Component]
[First Component] ..> HTTP : use
@enduml`,
  },
  {
    title: '5. Using notes',
    source: `@startuml
[Component] as C
note top of C: A top note
note bottom of C
A bottom note can also be on several lines
end note
note left of C
A left note can also be on several lines
end note
note right of C: A right note
@enduml`,
  },
  {
    title: '6. Using notes',
    source: `@startuml
[Component] as C
note as N
A floating note can also be on several lines
end note
C .. N
@enduml`,
  },
  {
    title: '7. Using notes',
    source: `@startuml
interface "Data Access" as DA
DA - [First Component]
[First Component] ..> HTTP : use
note left of HTTP : Web Service only
note right of [First Component]
A note can also be on several lines
end note
@enduml`,
  },
  {
    title: '8. Grouping Components',
    source: `@startuml
package "Some Group" {
HTTP - [First Component]
[Another Component]
}
node "Other Groups" {
FTP - [Second Component]
[First Component] --> FTP
}
cloud {
[Example 1]
}
database "MySql" {
folder "This is my folder" {
[Folder 3]
}
frame "Foo" {
[Frame 4]
}
}
[Another Component] --> [Example 1]
[Example 1] --> [Folder 3]
[Folder 3] --> [Frame 4]
@enduml`,
  },
  {
    title: '9. Changing arrows direction',
    source: `@startuml
[Component] --> Interface1
[Component] -> Interface2
@enduml`,
  },
  {
    title: '10. Changing arrows direction',
    source: `@startuml
Interface1 <-- [Component]
Interface2 <- [Component]
@enduml`,
  },
  {
    title: '11. Changing arrows direction',
    source: `@startuml
[Component] -left-> left
[Component] -right-> right
[Component] -up-> up
[Component] -down-> down
@enduml`,
  },
  {
    title: '12. Changing arrows direction',
    source: `@startuml
left to right direction
[Component] -left-> left
[Component] -right-> right
[Component] -up-> up
[Component] -down-> down
@enduml`,
  },
  {
    title: '13. Use UML2 notation',
    source: `@startuml
interface "Data Access" as DA
DA - [First Component]
[First Component] ..> HTTP : use
@enduml`,
  },
  {
    title: '14. Use UML1 notation',
    source: `@startuml
skinparam componentStyle uml1
interface "Data Access" as DA
DA - [First Component]
[First Component] ..> HTTP : use
@enduml`,
  },
  {
    title: '15. Use rectangle notation (remove UML notation)',
    source: `@startuml
skinparam componentStyle rectangle
interface "Data Access" as DA
DA - [First Component]
[First Component] ..> HTTP : use
@enduml`,
  },
  {
    title: '16. Long description',
    source: `@startuml
component comp1
[
This component has a long comment on several lines
]
@enduml`,
  },
  {
    title: '17. Individual colors',
    source: `@startuml
component [Web Server] #Yellow
@enduml`,
  },
  {
    title: '18. Using Sprite in Stereotype',
    source: `@startuml
sprite $businessProcess [16x16/16] {
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFF0FFFFF
FFFFFFFFFF00FFFF
FF00000000000FFF
FF000000000000FF
FF00000000000FFF
FFFFFFFFFF00FFFF
FFFFFFFFFF0FFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
}
rectangle " End to End\\nbusiness process" <<$businessProcess>> {
rectangle "inner process 1" <<$businessProcess>> as src
rectangle "inner process 2" <<$businessProcess>> as tgt
src -> tgt
}
@enduml`,
  },
  {
    title: '19. Skinparam',
    source: `@startuml
skinparam interface {
backgroundColor RosyBrown
borderColor orange
}
skinparam component {
FontSize 13
BackgroundColor<<Apache>> Pink
BorderColor<<Apache>> #FF6655
FontName Courier
BorderColor black
BackgroundColor gold
ArrowFontName Impact
ArrowColor #FF6655
ArrowFontColor #777777
}
() "Data Access" as DA
Component "Web Server" as WS << Apache >>
DA - [First Component]
[First Component] ..> () HTTP : use
HTTP - WS
@enduml`,
  },
  {
    title: '20. Skinparam',
    source: `@startuml
skinparam component {
backgroundColor<<static lib>> DarkKhaki
backgroundColor<<shared lib>> Green
}
skinparam node {
borderColor Green
backgroundColor Yellow
backgroundColor<<shared_node>> Magenta
}
skinparam databaseBackgroundColor Aqua
[AA] <<static lib>>
[BB] <<shared lib>>
[CC] <<static lib>>
node node1
node node2 <<shared_node>>
database Production
@enduml`,
  },
  {
    title: '21. Specific SkinParameter',
    source: `@startuml
skinparam BackgroundColor transparent
skinparam componentStyle uml2
component A {
component "A.1" {
}
component A.44 {
[A4.1]
}
component "A.2"
[A.3]
component A.5
[ A.5]
component A.6
[ ]
}
[a]->[b]
@enduml`,
  },
  {
    title: '22. Specific SkinParameter',
    source: `@startuml
skinparam BackgroundColor transparent
skinparam componentStyle rectangle
component A {
component "A.1" {
}
component A.44 {
[A4.1]
}
component "A.2"
[A.3]
component A.5
[ A.5]
component A.6
[ ]
}
[a]->[b]
@enduml`,
  },
  {
    title: '23. Hide or Remove unlinked component',
    source: `@startuml
component C1
component C2
component C3
C1 -- C2
@enduml`,
  },
  {
    title: '24. Hide or Remove unlinked component',
    source: `@startuml
component C1
component C2
component C3
C1 -- C2
hide @unlinked
@enduml`,
  },
  {
    title: '25. Hide or Remove unlinked component',
    source: `@startuml
component C1
component C2
component C3
C1 -- C2
remove @unlinked
@enduml`,
  },
  {
    title: '26. Hide, Remove or Restore tagged component or wildcard',
    source: `@startuml
component C1 $tag13
component C2
component C3 $tag13
C1 -- C2
@enduml`,
  },
  {
    title: '27. Hide, Remove or Restore tagged component or wildcard',
    source: `@startuml
component C1 $tag13
component C2
component C3 $tag13
C1 -- C2
hide $tag13
@enduml`,
  },
  {
    title: '28. Hide, Remove or Restore tagged component or wildcard',
    source: `@startuml
component C1 $tag13
component C2
component C3 $tag13
C1 -- C2
remove $tag13
@enduml`,
  },
  {
    title: '29. Hide, Remove or Restore tagged component or wildcard',
    source: `@startuml
component C1 $tag13 $tag1
component C2
component C3 $tag13
C1 -- C2
remove $tag13
restore $tag1
@enduml`,
  },
  {
    title: '30. Hide, Remove or Restore tagged component or wildcard',
    source: `@startuml
component C1 $tag13 $tag1
component C2
component C3 $tag13
C1 -- C2
remove *
restore $tag1
@enduml`,
  },
  {
    title: '31. Display JSON Data on Component diagram',
    source: `@startuml
allowmixing
component Component
() Interface
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
@enduml`,
  },
  {
    title: '32. Port [port, portIn, portOut]',
    source: `@startuml
[c]
component C {
port p1
port p2
port p3
component c1
}
c --> p1
c --> p2
c --> p3
p1 --> c1
p2 --> c1
@enduml`,
  },
  {
    title: '33. Port [port, portIn, portOut]',
    source: `@startuml
[c]
component C {
portin p1
portin p2
portin p3
component c1
}
c --> p1
c --> p2
c --> p3
p1 --> c1
p2 --> c1
@enduml`,
  },
  {
    title: '34. Port [port, portIn, portOut]',
    source: `@startuml
component C {
portout p1
portout p2
portout p3
component c1
}
[o]
p1 --> o
p2 --> o
p3 --> o
c1 --> p1
@enduml`,
  },
  {
    title: '35. Port [port, portIn, portOut]',
    source: `@startuml
[i]
component C {
portin p1
portin p2
portin p3
portout po1
portout po2
portout po3
component c1
}
[o]
i --> p1
i --> p2
i --> p3
p1 --> c1
p2 --> c1
po1 --> o
po2 --> o
po3 --> o
c1 --> po1
@enduml`,
  },
];
