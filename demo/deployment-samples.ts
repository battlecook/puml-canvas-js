// PlantUML deployment-diagram examples extracted from https://plantuml.com/en/deployment-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface DeploymentSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_DEPLOYMENT_LIST: ReadonlyArray<DeploymentSample> = [
  {
    title: '1. Declaring element',
    source: `@startuml
action action
actor actor
actor/ "actor/"
agent agent
artifact artifact
boundary boundary
card card
circle circle
cloud cloud
collections collections
component component
control control
database database
entity entity
file file
folder folder
frame frame
hexagon hexagon
interface interface
label label
node node
package package
person person
process process
queue queue
rectangle rectangle
stack stack
storage storage
usecase usecase
usecase/ "usecase/"
@enduml`,
  },
  {
    title: '2. Declaring element',
    source: `@startuml
folder folder [ This is a <b>folder
---- You can use separator
==== of different kind
.... and style
]
node node [ This is a <b>node
---- You can use separator
==== of different kind
.... and style
]
database database [ This is a <b>database
---- You can use separator
==== of different kind
.... and style
]
usecase usecase [ This is a <b>usecase
---- You can use separator
==== of different kind
.... and style
]
card card [ This is a <b>card
---- You can use separator
==== of different kind
.... and style
<i><color:blue>(add from V1.2020.7)</color></i>
]
@enduml`,
  },
  {
    title: '3. Declaring element (using short form)',
    source: `@startuml
actor actor1
:actor2:
@enduml`,
  },
  {
    title: '4. Declaring element (using short form)',
    source: `@startuml
component component1
[component2]
@enduml`,
  },
  {
    title: '5. Declaring element (using short form)',
    source: `@startuml
interface interface1
() "interface2"
label "//interface example//"
@enduml`,
  },
  {
    title: '6. Declaring element (using short form)',
    source: `@startuml
usecase usecase1
(usecase2)
@enduml`,
  },
  {
    title: '7. Linking or arrow',
    source: `@startuml
node node1
node node2
node node3
node node4
node node5
node1 -- node2 : label1
node1 .. node3 : label2
node1 ~~ node4 : label3
node1 == node5
@enduml`,
  },
  {
    title: '8. Linking or arrow',
    source: `@startuml
artifact artifact1
artifact artifact2
artifact artifact3
artifact artifact4
artifact artifact5
artifact artifact6
artifact artifact7
artifact artifact8
artifact artifact9
artifact artifact10
artifact1 --> artifact2
artifact1 --* artifact3
artifact1 --o artifact4
artifact1 --+ artifact5
artifact1 --# artifact6
artifact1 -->> artifact7
artifact1 --0 artifact8
artifact1 --^ artifact9
artifact1 --(0 artifact10
@enduml`,
  },
  {
    title: '9. Linking or arrow',
    source: `@startuml
cloud cloud1
cloud cloud2
cloud cloud3
cloud cloud4
cloud cloud5
cloud1 -0- cloud2
cloud1 -0)- cloud3
cloud1 -(0- cloud4
cloud1 -(0)- cloud5
@enduml`,
  },
  {
    title: '10. Linking or arrow',
    source: `@startuml
actor foo1
actor foo2
foo1 <-0-> foo2
foo1 <-(0)-> foo2
(ac1) -le(0)-> left1
ac1 -ri(0)-> right1
ac1 .up(0).> up1
ac1 ~up(0)~> up2
ac1 -do(0)-> down1
ac1 -do(0)-> down2
actor1 -0)- actor2
component comp1
component comp2
comp1 *-0)-+ comp2
[comp3] <-->> [comp4]
boundary b1
control c1
b1 -(0)- c1
component comp1
interface interf1
comp1 #~~( interf1
:mode1actor: -0)- fooa1
:mode1actorl: -ri0)- foo1l
[component1] 0)-(0-(0 [componentC]
() component3 )-0-(0 "foo"
[componentC]
[aze1] #-->> [aze2]
@enduml`,
  },
  {
    title: '11. Bracketed arrow style',
    source: `@startuml
node foo
title Bracketed line style without label
foo --> bar
foo -[bold]-> bar1
foo -[dashed]-> bar2
foo -[dotted]-> bar3
foo -[hidden]-> bar4
foo -[plain]-> bar5
@enduml`,
  },
  {
    title: '12. Bracketed arrow style',
    source: `@startuml
title Bracketed line style with label
node foo
foo --> bar : ∅
foo -[bold]-> bar1 : [bold]
foo -[dashed]-> bar2 : [dashed]
foo -[dotted]-> bar3 : [dotted]
foo -[hidden]-> bar4 : [hidden]
foo -[plain]-> bar5 : [plain]
@enduml`,
  },
  {
    title: '13. Bracketed arrow style',
    source: `@startuml
title Bracketed line color
node foo
foo --> bar
foo -[#red]-> bar1 : [#red]
foo -[#green]-> bar2 : [#green]
foo -[#blue]-> bar3 : [#blue]
foo -[#blue;#yellow;#green]-> bar4
@enduml`,
  },
  {
    title: '14. Bracketed arrow style',
    source: `@startuml
title Bracketed line thickness
node foo
foo --> bar : ∅
foo -[thickness=1]-> bar1 : [1]
foo -[thickness=2]-> bar2 : [2]
foo -[thickness=4]-> bar3 : [4]
foo -[thickness=8]-> bar4 : [8]
foo -[thickness=16]-> bar5 : [16]
@enduml`,
  },
  {
    title: '15. Bracketed arrow style',
    source: `@startuml
title Bracketed line style mix
node foo
foo --> bar : ∅
foo -[#red,thickness=1]-> bar1 : [#red,1]
foo -[#red,dashed,thickness=2]-> bar2 : [#red,dashed,2]
foo -[#green,dashed,thickness=4]-> bar3 : [#green,dashed,4]
foo -[#blue,dotted,thickness=8]-> bar4 : [blue,dotted,8]
foo -[#blue,plain,thickness=16]-> bar5 : [blue,plain,16]
foo -[#blue;#green,dashed,thickness=4]-> bar6 : [blue;green,dashed,4]
@enduml`,
  },
  {
    title: '16. Change arrow color and style (inline style)',
    source: `@startuml
node foo
foo --> bar : normal
foo --> bar1 #line:red;line.bold;text:red : red bold
foo --> bar2 #green;line.dashed;text:green : green dashed
foo --> bar3 #blue;line.dotted;text:blue : blue dotted
@enduml`,
  },
  {
    title: '17. Change element color and style (inline style)',
    source: `@startuml
agent a
cloud c #pink;line:red;line.bold;text:red
file f #palegreen;line:green;line.dashed;text:green
node n #aliceblue;line:blue;line.dotted;text:blue
@enduml`,
  },
  {
    title: '18. Change element color and style (inline style)',
    source: `@startuml
agent a
cloud c #pink;line:red;line.bold;text:red [ c cloud description ]
file f #palegreen;line:green;line.dashed;text:green { [c1] [c2] }
frame frame { node n #aliceblue;line:blue;line.dotted;text:blue }
@enduml`,
  },
  {
    title: '19. Nestable elements',
    source: `@startuml
action action { }
artifact artifact { }
card card { }
cloud cloud { }
component component { }
database database { }
file file { }
folder folder { }
frame frame { }
hexagon hexagon { }
node node { }
package package { }
process process { }
queue queue { }
rectangle rectangle { }
stack stack { }
storage storage { }
@enduml`,
  },
  {
    title: '20. Packages and nested elements',
    source: `@startuml
artifact artifactVeryLOOOOOOOOOOOOOOOOOOOg as "artifact" { file f1 }
card cardVeryLOOOOOOOOOOOOOOOOOOOg as "card" { file f2 }
cloud cloudVeryLOOOOOOOOOOOOOOOOOOOg as "cloud" { file f3 }
component componentVeryLOOOOOOOOOOOOOOOOOOOg as "component" { file f4 }
database databaseVeryLOOOOOOOOOOOOOOOOOOOg as "database" { file f5 }
file fileVeryLOOOOOOOOOOOOOOOOOOOg as "file" { file f6 }
folder folderVeryLOOOOOOOOOOOOOOOOOOOg as "folder" { file f7 }
frame frameVeryLOOOOOOOOOOOOOOOOOOOg as "frame" { file f8 }
hexagon hexagonVeryLOOOOOOOOOOOOOOOOOOOg as "hexagon" { file f9 }
node nodeVeryLOOOOOOOOOOOOOOOOOOOg as "node" { file f10 }
package packageVeryLOOOOOOOOOOOOOOOOOOOg as "package" { file f11 }
queue queueVeryLOOOOOOOOOOOOOOOOOOOg as "queue" { file f12 }
rectangle rectangleVeryLOOOOOOOOOOOOOOOOOOOg as "rectangle" { file f13 }
stack stackVeryLOOOOOOOOOOOOOOOOOOOg as "stack" { file f14 }
storage storageVeryLOOOOOOOOOOOOOOOOOOOg as "storage" { file f15 }
@enduml`,
  },
  {
    title: '21. Packages and nested elements',
    source: `@startuml
artifact Foo1 { folder Foo2 }
folder Foo3 { artifact Foo4 }
frame Foo5 { database Foo6 }
cloud vpc { node ec2 { stack stack } }
@enduml`,
  },
  {
    title: '22. Packages and nested elements',
    source: `@startuml
node Foo1 { cloud Foo2 }
cloud Foo3 { frame Foo4 }
database Foo5 { storage Foo6 }
storage Foo7 { storage Foo8 }
@enduml`,
  },
  {
    title: '23. Packages and nested elements',
    source: `@startuml
action action { artifact artifact { card card { cloud cloud { component component { database database { file file { folder folder { frame frame { hexagon hexagon { node node { package package { process process { queue queue { rectangle rectangle { stack stack { storage storage { } } } } } } } } } } } } } } } } }
@enduml`,
  },
  {
    title: '24. Packages and nested elements',
    source: `@startuml
storage storage { stack stack { rectangle rectangle { queue queue { process process { package package { node node { hexagon hexagon { frame frame { folder folder { file file { database database { component component { cloud cloud { card card { artifact artifact { action action { } } } } } } } } } } } } } } } } }
@enduml`,
  },
  {
    title: '25. Alias',
    source: `@startuml
node Node1 as n1
node "Node 2" as n2
file f1 as "File 1"
cloud c1 as "this is a cloud"
cloud c2 [this is another cloud]
n1 -> n2
n1 --> f1
f1 -> c1
c1 -> c2
@enduml`,
  },
  {
    title: '26. Alias',
    source: `@startuml
actor "actor" as actorVeryLOOOOOOOOOOOOOOOOOOOg
agent "agent" as agentVeryLOOOOOOOOOOOOOOOOOOOg
artifact "artifact" as artifactVeryLOOOOOOOOOOOOOOOOOOOg
boundary "boundary" as boundaryVeryLOOOOOOOOOOOOOOOOOOOg
card "card" as cardVeryLOOOOOOOOOOOOOOOOOOOg
cloud "cloud" as cloudVeryLOOOOOOOOOOOOOOOOOOOg
collections "collections" as collectionsVeryLOOOOOOOOOOOOOOOOOOOg
component "component" as componentVeryLOOOOOOOOOOOOOOOOOOOg
control "control" as controlVeryLOOOOOOOOOOOOOOOOOOOg
database "database" as databaseVeryLOOOOOOOOOOOOOOOOOOOg
entity "entity" as entityVeryLOOOOOOOOOOOOOOOOOOOg
file "file" as fileVeryLOOOOOOOOOOOOOOOOOOOg
folder "folder" as folderVeryLOOOOOOOOOOOOOOOOOOOg
frame "frame" as frameVeryLOOOOOOOOOOOOOOOOOOOg
hexagon "hexagon" as hexagonVeryLOOOOOOOOOOOOOOOOOOOg
interface "interface" as interfaceVeryLOOOOOOOOOOOOOOOOOOOg
label "label" as labelVeryLOOOOOOOOOOOOOOOOOOOg
node "node" as nodeVeryLOOOOOOOOOOOOOOOOOOOg
package "package" as packageVeryLOOOOOOOOOOOOOOOOOOOg
person "person" as personVeryLOOOOOOOOOOOOOOOOOOOg
queue "queue" as queueVeryLOOOOOOOOOOOOOOOOOOOg
stack "stack" as stackVeryLOOOOOOOOOOOOOOOOOOOg
rectangle "rectangle" as rectangleVeryLOOOOOOOOOOOOOOOOOOOg
storage "storage" as storageVeryLOOOOOOOOOOOOOOOOOOOg
usecase "usecase" as usecaseVeryLOOOOOOOOOOOOOOOOOOOg
@enduml`,
  },
  {
    title: '27. Alias',
    source: `@startuml
actor actorVeryLOOOOOOOOOOOOOOOOOOOg as "actor"
agent agentVeryLOOOOOOOOOOOOOOOOOOOg as "agent"
artifact artifactVeryLOOOOOOOOOOOOOOOOOOOg as "artifact"
boundary boundaryVeryLOOOOOOOOOOOOOOOOOOOg as "boundary"
card cardVeryLOOOOOOOOOOOOOOOOOOOg as "card"
cloud cloudVeryLOOOOOOOOOOOOOOOOOOOg as "cloud"
collections collectionsVeryLOOOOOOOOOOOOOOOOOOOg as "collections"
component componentVeryLOOOOOOOOOOOOOOOOOOOg as "component"
control controlVeryLOOOOOOOOOOOOOOOOOOOg as "control"
database databaseVeryLOOOOOOOOOOOOOOOOOOOg as "database"
entity entityVeryLOOOOOOOOOOOOOOOOOOOg as "entity"
file fileVeryLOOOOOOOOOOOOOOOOOOOg as "file"
folder folderVeryLOOOOOOOOOOOOOOOOOOOg as "folder"
frame frameVeryLOOOOOOOOOOOOOOOOOOOg as "frame"
hexagon hexagonVeryLOOOOOOOOOOOOOOOOOOOg as "hexagon"
interface interfaceVeryLOOOOOOOOOOOOOOOOOOOg as "interface"
label labelVeryLOOOOOOOOOOOOOOOOOOOg as "label"
node nodeVeryLOOOOOOOOOOOOOOOOOOOg as "node"
package packageVeryLOOOOOOOOOOOOOOOOOOOg as "package"
person personVeryLOOOOOOOOOOOOOOOOOOOg as "person"
queue queueVeryLOOOOOOOOOOOOOOOOOOOg as "queue"
stack stackVeryLOOOOOOOOOOOOOOOOOOOg as "stack"
rectangle rectangleVeryLOOOOOOOOOOOOOOOOOOOg as "rectangle"
storage storageVeryLOOOOOOOOOOOOOOOOOOOg as "storage"
usecase usecaseVeryLOOOOOOOOOOOOOOOOOOOg as "usecase"
@enduml`,
  },
  {
    title: '28. Round corner',
    source: `@startuml
skinparam rectangle { roundCorner<<Concept>> 25 }
rectangle "Concept Model" <<Concept>> { rectangle "Example 1" <<Concept>> as ex1 rectangle "Another rectangle" }
@enduml`,
  },
  {
    title: '29. Specific SkinParameter',
    source: `@startuml
skinparam roundCorner 15
actor actor
agent agent
artifact artifact
boundary boundary
card card
circle circle
cloud cloud
collections collections
component component
control control
database database
entity entity
file file
folder folder
frame frame
hexagon hexagon
interface interface
label label
node node
package package
person person
queue queue
rectangle rectangle
stack stack
storage storage
usecase usecase
@enduml`,
  },
  {
    title: '30. Appendix: All type of arrow line',
    source: `@startuml
left to right direction
skinparam nodesep 5
f3 ~~ b3 : ""~~""\\n//dotted//
f2 .. b2 : ""..""\\n//dashed//
f1 == b1 : ""==""\\n//bold//
f0 -- b0 : ""--""\\n//plain//
@enduml`,
  },
  {
    title: '31. Appendix: All type of arrow head or \'0\' arrow',
    source: `@startuml
left to right direction
skinparam nodesep 5
label " "
f13 --0 b13 : ""--0""
f12 --@ b12 : ""--@""
f11 --:|> b11 : ""--:|>""
f10 --||> b10 : ""--||>""
f9 --|> b9 : ""--|>""
f8 --^ b8 : ""--^ ""
f7 --\\\\ b7 : ""--\\\\\\\\"
f6 --# b6 : ""--# ""
f5 --+ b5 : ""--+ ""
f4 --o b4 : ""--o ""
f3 --* b3 : ""--* ""
f2 -->> b2 : ""-->>""
f1 --> b1 : ""--> ""
f0 -- b0 : ""-- ""
@enduml`,
  },
  {
    title: '32. Appendix: All type of arrow head or \'0\' arrow',
    source: `@startuml
left to right direction
skinparam nodesep 5
label " "
f10 0--0 b10 : "" 0--0 ""
f9 )--( b9 : "" )--( ""
f8 0)--(0 b8 : "" 0)--(0""
f7 0)-- b7 : "" 0)-- ""
f6 -0)- b6 : "" -0)- ""
f5 -(0)- b5 : "" -(0)-""
f4 -(0- b4 : "" -(0- ""
f3 --(0 b3 : "" --(0 ""
f2 --( b2 : "" --( ""
f1 --0 b1 : "" --0 ""
@enduml`,
  },
  {
    title: '33. Appendix: Test of inline style on all element',
    source: `@startuml
action action #aliceblue;line:blue;line.dotted;text:blue
actor actor #aliceblue;line:blue;line.dotted;text:blue
actor/ "actor/" #aliceblue;line:blue;line.dotted;text:blue
agent agent #aliceblue;line:blue;line.dotted;text:blue
artifact artifact #aliceblue;line:blue;line.dotted;text:blue
boundary boundary #aliceblue;line:blue;line.dotted;text:blue
card card #aliceblue;line:blue;line.dotted;text:blue
circle circle #aliceblue;line:blue;line.dotted;text:blue
cloud cloud #aliceblue;line:blue;line.dotted;text:blue
collections collections #aliceblue;line:blue;line.dotted;text:blue
component component #aliceblue;line:blue;line.dotted;text:blue
control control #aliceblue;line:blue;line.dotted;text:blue
database database #aliceblue;line:blue;line.dotted;text:blue
entity entity #aliceblue;line:blue;line.dotted;text:blue
file file #aliceblue;line:blue;line.dotted;text:blue
folder folder #aliceblue;line:blue;line.dotted;text:blue
frame frame #aliceblue;line:blue;line.dotted;text:blue
hexagon hexagon #aliceblue;line:blue;line.dotted;text:blue
interface interface #aliceblue;line:blue;line.dotted;text:blue
label label #aliceblue;line:blue;line.dotted;text:blue
node node #aliceblue;line:blue;line.dotted;text:blue
package package #aliceblue;line:blue;line.dotted;text:blue
person person #aliceblue;line:blue;line.dotted;text:blue
process process #aliceblue;line:blue;line.dotted;text:blue
queue queue #aliceblue;line:blue;line.dotted;text:blue
rectangle rectangle #aliceblue;line:blue;line.dotted;text:blue
stack stack #aliceblue;line:blue;line.dotted;text:blue
storage storage #aliceblue;line:blue;line.dotted;text:blue
usecase usecase #aliceblue;line:blue;line.dotted;text:blue
usecase/ "usecase/" #aliceblue;line:blue;line.dotted;text:blue
@enduml`,
  },
  {
    title: '34. Appendix: Test of inline style on all element',
    source: `@startuml
action action #aliceblue;line:blue;line.dotted;text:blue { }
artifact artifact #aliceblue;line:blue;line.dotted;text:blue { }
card card #aliceblue;line:blue;line.dotted;text:blue { }
cloud cloud #aliceblue;line:blue;line.dotted;text:blue { }
component component #aliceblue;line:blue;line.dotted;text:blue { }
database database #aliceblue;line:blue;line.dotted;text:blue { }
file file #aliceblue;line:blue;line.dotted;text:blue { }
folder folder #aliceblue;line:blue;line.dotted;text:blue { }
frame frame #aliceblue;line:blue;line.dotted;text:blue { }
hexagon hexagon #aliceblue;line:blue;line.dotted;text:blue { }
node node #aliceblue;line:blue;line.dotted;text:blue { }
package package #aliceblue;line:blue;line.dotted;text:blue { }
process process #aliceblue;line:blue;line.dotted;text:blue { }
queue queue #aliceblue;line:blue;line.dotted;text:blue { }
rectangle rectangle #aliceblue;line:blue;line.dotted;text:blue { }
stack stack #aliceblue;line:blue;line.dotted;text:blue { }
storage storage #aliceblue;line:blue;line.dotted;text:blue { }
@enduml`,
  },
  {
    title: '35. Appendix: Test of inline style on all element',
    source: `@startuml
action actionVeryLOOOOOOOOOOOOOOOOOOOg as "action" #aliceblue;line:blue;line.dotted;text:blue { file f1 }
artifact artifactVeryLOOOOOOOOOOOOOOOOOOOg as "artifact" #aliceblue;line:blue;line.dotted;text:blue { file f1 }
card cardVeryLOOOOOOOOOOOOOOOOOOOg as "card" #aliceblue;line:blue;line.dotted;text:blue { file f2 }
cloud cloudVeryLOOOOOOOOOOOOOOOOOOOg as "cloud" #aliceblue;line:blue;line.dotted;text:blue { file f3 }
component componentVeryLOOOOOOOOOOOOOOOOOOOg as "component" #aliceblue;line:blue;line.dotted;text:blue { file f4 }
database databaseVeryLOOOOOOOOOOOOOOOOOOOg as "database" #aliceblue;line:blue;line.dotted;text:blue { file f5 }
file fileVeryLOOOOOOOOOOOOOOOOOOOg as "file" #aliceblue;line:blue;line.dotted;text:blue { file f6 }
folder folderVeryLOOOOOOOOOOOOOOOOOOOg as "folder" #aliceblue;line:blue;line.dotted;text:blue { file f7 }
frame frameVeryLOOOOOOOOOOOOOOOOOOOg as "frame" #aliceblue;line:blue;line.dotted;text:blue { file f8 }
hexagon hexagonVeryLOOOOOOOOOOOOOOOOOOOg as "hexagon" #aliceblue;line:blue;line.dotted;text:blue { file f9 }
node nodeVeryLOOOOOOOOOOOOOOOOOOOg as "node" #aliceblue;line:blue;line.dotted;text:blue { file f10 }
package packageVeryLOOOOOOOOOOOOOOOOOOOg as "package" #aliceblue;line:blue;line.dotted;text:blue { file f11 }
process processVeryLOOOOOOOOOOOOOOOOOOOg as "process" #aliceblue;line:blue;line.dotted;text:blue { file f11 }
queue queueVeryLOOOOOOOOOOOOOOOOOOOg as "queue" #aliceblue;line:blue;line.dotted;text:blue { file f12 }
rectangle rectangleVeryLOOOOOOOOOOOOOOOOOOOg as "rectangle" #aliceblue;line:blue;line.dotted;text:blue { file f13 }
stack stackVeryLOOOOOOOOOOOOOOOOOOOg as "stack" #aliceblue;line:blue;line.dotted;text:blue { file f14 }
storage storageVeryLOOOOOOOOOOOOOOOOOOOg as "storage" #aliceblue;line:blue;line.dotted;text:blue { file f15 }
@enduml`,
  },
  {
    title: '36. Appendix: Test of style on all element',
    source: `@startuml
<style>
componentDiagram {
  BackGroundColor palegreen
  LineThickness 1
  LineColor red
}
document {
  BackGroundColor white
}
</style>
actor actor
actor/ "actor/"
agent agent
artifact artifact
boundary boundary
card card
circle circle
cloud cloud
collections collections
component component
control control
database database
entity entity
file file
folder folder
frame frame
hexagon hexagon
interface interface
label label
node node
package package
person person
queue queue
rectangle rectangle
stack stack
storage storage
usecase usecase
usecase/ "usecase/"
@enduml`,
  },
  {
    title: '37. Appendix: Test of style on all element',
    source: `@startuml
<style>
actor {
  BackGroundColor #f80c12
  LineThickness 1
  LineColor black
}
agent {
  BackGroundColor #f80c12
  LineThickness 1
  LineColor black
}
artifact {
  BackGroundColor #ee1100
  LineThickness 1
  LineColor black
}
boundary {
  BackGroundColor #ee1100
  LineThickness 1
  LineColor black
}
card {
  BackGroundColor #ff3311
  LineThickness 1
  LineColor black
}
circle {
  BackGroundColor #ff3311
  LineThickness 1
  LineColor black
}
cloud {
  BackGroundColor #ff4422
  LineThickness 1
  LineColor black
}
collections {
  BackGroundColor #ff4422
  LineThickness 1
  LineColor black
}
component {
  BackGroundColor #ff6644
  LineThickness 1
  LineColor black
}
control {
  BackGroundColor #ff6644
  LineThickness 1
  LineColor black
}
database {
  BackGroundColor #ff9933
  LineThickness 1
  LineColor black
}
entity {
  BackGroundColor #feae2d
  LineThickness 1
  LineColor black
}
file {
  BackGroundColor #feae2d
  LineThickness 1
  LineColor black
}
folder {
  BackGroundColor #ccbb33
  LineThickness 1
  LineColor black
}
frame {
  BackGroundColor #d0c310
  LineThickness 1
  LineColor black
}
hexagon {
  BackGroundColor #aacc22
  LineThickness 1
  LineColor black
}
interface {
  BackGroundColor #69d025
  LineThickness 1
  LineColor black
}
label {
  BackGroundColor black
  LineThickness 1
  LineColor black
}
node {
  BackGroundColor #22ccaa
  LineThickness 1
  LineColor black
}
package {
  BackGroundColor #12bdb9
  LineThickness 1
  LineColor black
}
person {
  BackGroundColor #11aabb
  LineThickness 1
  LineColor black
}
queue {
  BackGroundColor #11aabb
  LineThickness 1
  LineColor black
}
rectangle {
  BackGroundColor #4444dd
  LineThickness 1
  LineColor black
}
stack {
  BackGroundColor #3311bb
  LineThickness 1
  LineColor black
}
storage {
  BackGroundColor #3b0cbd
  LineThickness 1
  LineColor black
}
usecase {
  BackGroundColor #442299
  LineThickness 1
  LineColor black
}
</style>
actor actor
actor/ "actor/"
agent agent
artifact artifact
boundary boundary
card card
circle circle
cloud cloud
collections collections
component component
control control
database database
entity entity
file file
folder folder
frame frame
hexagon hexagon
interface interface
label label
node node
package package
person person
queue queue
rectangle rectangle
stack stack
storage storage
usecase usecase
usecase/ "usecase/"
@enduml`,
  },
  {
    title: '38. Appendix: Test of style on all element',
    source: `@startuml
<style>
componentDiagram {
  BackGroundColor palegreen
  LineThickness 2
  LineColor red
}
</style>
artifact artifact { }
card card { }
cloud cloud { }
component component { }
database database { }
file file { }
folder folder { }
frame frame { }
hexagon hexagon { }
node node { }
package package { }
queue queue { }
rectangle rectangle { }
stack stack { }
storage storage { }
@enduml`,
  },
  {
    title: '39. Appendix: Test of style on all element',
    source: `@startuml
<style>
artifact {
  BackGroundColor #ee1100
  LineThickness 1
  LineColor black
}
card {
  BackGroundColor #ff3311
  LineThickness 1
  LineColor black
}
cloud {
  BackGroundColor #ff4422
  LineThickness 1
  LineColor black
}
component {
  BackGroundColor #ff6644
  LineThickness 1
  LineColor black
}
database {
  BackGroundColor #ff9933
  LineThickness 1
  LineColor black
}
file {
  BackGroundColor #feae2d
  LineThickness 1
  LineColor black
}
folder {
  BackGroundColor #ccbb33
  LineThickness 1
  LineColor black
}
frame {
  BackGroundColor #d0c310
  LineThickness 1
  LineColor black
}
hexagon {
  BackGroundColor #aacc22
  LineThickness 1
  LineColor black
}
node {
  BackGroundColor #22ccaa
  LineThickness 1
  LineColor black
}
package {
  BackGroundColor #12bdb9
  LineThickness 1
  LineColor black
}
queue {
  BackGroundColor #11aabb
  LineThickness 1
  LineColor black
}
rectangle {
  BackGroundColor #4444dd
  LineThickness 1
  LineColor black
}
stack {
  BackGroundColor #3311bb
  LineThickness 1
  LineColor black
}
storage {
  BackGroundColor #3b0cbd
  LineThickness 1
  LineColor black
}
</style>
artifact artifact { }
card card { }
cloud cloud { }
component component { }
database database { }
file file { }
folder folder { }
frame frame { }
hexagon hexagon { }
node node { }
package package { }
queue queue { }
rectangle rectangle { }
stack stack { }
storage storage { }
@enduml`,
  },
  {
    title: '40. Appendix: Test of style on all element',
    source: `@startuml
<style>
componentDiagram {
  BackGroundColor palegreen
  LineThickness 1
  LineColor red
}
document {
  BackGroundColor white
}
</style>
artifact e1 as "artifact" { file f1 }
card e2 as "card" { file f2 }
cloud e3 as "cloud" { file f3 }
component e4 as "component" { file f4 }
database e5 as "database" { file f5 }
file e6 as "file" { file f6 }
folder e7 as "folder" { file f7 }
frame e8 as "frame" { file f8 }
hexagon e9 as "hexagon" { file f9 }
node e10 as "node" { file f10 }
package e11 as "package" { file f11 }
queue e12 as "queue" { file f12 }
rectangle e13 as "rectangle" { file f13 }
stack e14 as "stack" { file f14 }
storage e15 as "storage" { file f15 }
@enduml`,
  },
  {
    title: '41. Appendix: Test of style on all element',
    source: `@startuml
<style>
artifact {
  BackGroundColor #ee1100
  LineThickness 1
  LineColor black
}
card {
  BackGroundColor #ff3311
  LineThickness 1
  LineColor black
}
cloud {
  BackGroundColor #ff4422
  LineThickness 1
  LineColor black
}
component {
  BackGroundColor #ff6644
  LineThickness 1
  LineColor black
}
database {
  BackGroundColor #ff9933
  LineThickness 1
  LineColor black
}
file {
  BackGroundColor #feae2d
  LineThickness 1
  LineColor black
}
folder {
  BackGroundColor #ccbb33
  LineThickness 1
  LineColor black
}
frame {
  BackGroundColor #d0c310
  LineThickness 1
  LineColor black
}
hexagon {
  BackGroundColor #aacc22
  LineThickness 1
  LineColor black
}
node {
  BackGroundColor #22ccaa
  LineThickness 1
  LineColor black
}
package {
  BackGroundColor #12bdb9
  LineThickness 1
  LineColor black
}
queue {
  BackGroundColor #11aabb
  LineThickness 1
  LineColor black
}
rectangle {
  BackGroundColor #4444dd
  LineThickness 1
  LineColor black
}
stack {
  BackGroundColor #3311bb
  LineThickness 1
  LineColor black
}
storage {
  BackGroundColor #3b0cbd
  LineThickness 1
  LineColor black
}
</style>
artifact e1 as "artifact" { file f1 }
card e2 as "card" { file f2 }
cloud e3 as "cloud" { file f3 }
component e4 as "component" { file f4 }
database e5 as "database" { file f5 }
file e6 as "file" { file f6 }
folder e7 as "folder" { file f7 }
frame e8 as "frame" { file f8 }
hexagon e9 as "hexagon" { file f9 }
node e10 as "node" { file f10 }
package e11 as "package" { file f11 }
queue e12 as "queue" { file f12 }
rectangle e13 as "rectangle" { file f13 }
stack e14 as "stack" { file f14 }
storage e15 as "storage" { file f15 }
@enduml`,
  },
  {
    title: '42. Appendix: Test of stereotype with style on all element',
    source: `@startuml
<style>
.stereo {
  BackgroundColor palegreen
}
</style>
actor actor << stereo >>
actor/ "actor/" << stereo >>
agent agent << stereo >>
artifact artifact << stereo >>
boundary boundary << stereo >>
card card << stereo >>
circle circle << stereo >>
cloud cloud << stereo >>
collections collections << stereo >>
component component << stereo >>
control control << stereo >>
database database << stereo >>
entity entity << stereo >>
file file << stereo >>
folder folder << stereo >>
frame frame << stereo >>
hexagon hexagon << stereo >>
interface interface << stereo >>
label label << stereo >>
node node << stereo >>
package package << stereo >>
person person << stereo >>
queue queue << stereo >>
rectangle rectangle << stereo >>
stack stack << stereo >>
storage storage << stereo >>
usecase usecase << stereo >>
usecase/ "usecase/" << stereo >>
@enduml`,
  },
  {
    title: '43. Display JSON Data on Deployment diagram',
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
    title: '44. Mixing Deployment (Usecase, Component, Deployment) element within a Class or Object diagram',
    source: `@startuml
allowmixing
skinparam nodesep 10
hide empty members
abstract abstract
abstract class "abstract class"
annotation annotation
circle circle
() circle_short_form
class class
class class_stereo <<stereotype>>
dataclass dataclass
diamond diamond
<> diamond_short_form
entity entity
enum enum
exception exception
interface interface
metaclass metaclass
protocol protocol
record record
stereotype stereotype
struct struct
object object
map map {
  key => value
}
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
action action
actor actor
actor/ "actor/"
agent agent
artifact artifact
boundary boundary
card card
circle circle
cloud cloud
collections collections
component component
control control
database database
entity entity
file file
folder folder
frame frame
hexagon hexagon
interface interface
label label
node node
package package
person person
process process
queue queue
rectangle rectangle
stack stack
storage storage
usecase usecase
usecase/ "usecase/"
state state
@enduml`,
  },
  {
    title: '45. Port [port, portIn, portOut]',
    source: `@startuml
[c]
node node {
  port p1
  port p2
  port p3
  file f1
}
c --> p1
c --> p2
c --> p3
p1 --> f1
p2 --> f1
@enduml`,
  },
  {
    title: '46. Port [port, portIn, portOut]',
    source: `@startuml
[c]
node node {
  portin p1
  portin p2
  portin p3
  file f1
}
c --> p1
c --> p2
c --> p3
p1 --> f1
p2 --> f1
@enduml`,
  },
  {
    title: '47. Port [port, portIn, portOut]',
    source: `@startuml
node node {
  portout p1
  portout p2
  portout p3
  file f1
}
[o]
p1 --> o
p2 --> o
p3 --> o
f1 --> p1
@enduml`,
  },
  {
    title: '48. Port [port, portIn, portOut]',
    source: `@startuml
[i]
node node {
  portin p1
  portin p2
  portin p3
  portout po1
  portout po2
  portout po3
  file f1
}
[o]
i --> p1
i --> p2
i --> p3
p1 --> f1
p2 --> f1
po1 --> o
po2 --> o
po3 --> o
f1 --> po1
@enduml`,
  },
  {
    title: '49. Change diagram orientation',
    source: `@startuml
card a
card b
package A {
  card a1
  card a2
  card a3
  card a4
  card a5
  package sub_a {
    card sa1
    card sa2
    card sa3
  }
}
package B {
  card b1
  card b2
  card b3
  card b4
  card b5
  package sub_b {
    card sb1
    card sb2
    card sb3
  }
}
@enduml`,
  },
  {
    title: '50. Change diagram orientation',
    source: `@startuml
!pragma layout smetana
card a
card b
package A {
  card a1
  card a2
  card a3
  card a4
  card a5
  package sub_a {
    card sa1
    card sa2
    card sa3
  }
}
package B {
  card b1
  card b2
  card b3
  card b4
  card b5
  package sub_b {
    card sb1
    card sb2
    card sb3
  }
}
@enduml`,
  },
  {
    title: '51. Change diagram orientation',
    source: `@startuml
left to right direction
card a
card b
package A {
  card a1
  card a2
  card a3
  card a4
  card a5
  package sub_a {
    card sa1
    card sa2
    card sa3
  }
}
package B {
  card b1
  card b2
  card b3
  card b4
  card b5
  package sub_b {
    card sb1
    card sb2
    card sb3
  }
}
@enduml`,
  },
  {
    title: '52. Change diagram orientation',
    source: `@startuml
!pragma layout smetana
left to right direction
card a
card b
package A {
  card a1
  card a2
  card a3
  card a4
  card a5
  package sub_a {
    card sa1
    card sa2
    card sa3
  }
}
package B {
  card b1
  card b2
  card b3
  card b4
  card b5
  package sub_b {
    card sb1
    card sb2
    card sb3
  }
}
@enduml`,
  },
];
