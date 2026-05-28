// PlantUML use-case-diagram examples extracted from https://plantuml.com/en/use-case-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface UsecaseSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_USECASE_LIST: ReadonlyArray<UsecaseSample> = [
  {
    title: '1. Usecases',
    source: `@startuml
(First usecase)
(Another usecase) as (UC2)
usecase UC3
usecase (Last\\nusecase) as UC4
@enduml`,
  },
  {
    title: '2. Actors',
    source: `@startuml
:First Actor:
:Another\\nactor: as Man2
actor Woman3
actor :Last actor: as Person1
@enduml`,
  },
  {
    title: '3. Change Actor style — Stick man (by default)',
    source: `@startuml
:User: --> (Use)
"Main Admin" as Admin
"Use the application" as (Use)
Admin --> (Admin the application)
@enduml`,
  },
  {
    title: '4. Change Actor style — Awesome man',
    source: `@startuml
skinparam actorStyle awesome
:User: --> (Use)
"Main Admin" as Admin
"Use the application" as (Use)
Admin --> (Admin the application)
@enduml`,
  },
  {
    title: '5. Change Actor style — Hollow man',
    source: `@startuml
skinparam actorStyle Hollow
:User: --> (Use)
"Main Admin" as Admin
"Use the application" as (Use)
Admin --> (Admin the application)
@enduml`,
  },
  {
    title: '6. Usecases description #1',
    source: `@startuml
usecase UC1 as "You can use several lines to define your usecase.
You can also use separators.
-- Several separators are possible.
== And you can add titles:
..Conclusion..
This allows large description."
@enduml`,
  },
  {
    title: '7. Usecases description #2',
    source: `@startuml
usecase description1 as alias1
usecase alias2 as "description2"
@enduml`,
  },
  {
    title: '8. Use package #1',
    source: `@startuml
left to right direction
actor Guest as g
package Professional {
  actor Chef as c
  actor "Food Critic" as fc
}
package Restaurant {
  usecase "Eat Food" as UC1
  usecase "Pay for Food" as UC2
  usecase "Drink" as UC3
  usecase "Review" as UC4
}
fc --> UC4
g --> UC1
g --> UC2
g --> UC3
@enduml`,
  },
  {
    title: '9. Use package #2',
    source: `@startuml
left to right direction
actor "Food Critic" as fc
rectangle Restaurant {
  usecase "Eat Food" as UC1
  usecase "Pay for Food" as UC2
  usecase "Drink" as UC3
}
fc --> UC1
fc --> UC2
fc --> UC3
@enduml`,
  },
  {
    title: '10. Basic example',
    source: `@startuml
User -> (Start)
User --> (Use the application) : A small label
:Main Admin: ---> (Use the application) : This is\\nyet another\\nlabel
@enduml`,
  },
  {
    title: '11. Extension',
    source: `@startuml
:Main Admin: as Admin
(Use the application) as (Use)
User <|-- Admin
(Start) <|-- (Use)
@enduml`,
  },
  {
    title: '12. Using notes',
    source: `@startuml
:Main Admin: as Admin
(Use the application) as (Use)
User -> (Start)
User --> (Use)
Admin ---> (Use)
note right of Admin : This is an example.
note right of (Use)
  A note can also be on several lines
end note
note "This note is connected\\nto several objects." as N2
(Start) .. N2
N2 .. (Use)
@enduml`,
  },
  {
    title: '13. Stereotypes',
    source: `@startuml
User << Human >>
:Main Database: as MySql << Application >>
(Start) << One Shot >>
(Use the application) as (Use) << Main >>
User -> (Start)
User --> (Use)
MySql --> (Use)
@enduml`,
  },
  {
    title: '14. Changing arrows direction #1',
    source: `@startuml
:user: --> (Use case 1)
:user: -> (Use case 2)
@enduml`,
  },
  {
    title: '15. Changing arrows direction #2',
    source: `@startuml
(Use case 1) <.. :user:
(Use case 2) <- :user:
@enduml`,
  },
  {
    title: '16. Changing arrows direction #3',
    source: `@startuml
:user: -left-> (dummyLeft)
:user: -right-> (dummyRight)
:user: -up-> (dummyUp)
:user: -down-> (dummyDown)
@enduml`,
  },
  {
    title: '17. Changing arrows direction #4',
    source: `@startuml
left to right direction
:user: -left-> (dummyLeft)
:user: -right-> (dummyRight)
:user: -up-> (dummyUp)
:user: -down-> (dummyDown)
@enduml`,
  },
  {
    title: '18. Splitting diagrams',
    source: `@startuml
:actor1: --> (Usecase1)
newpage
:actor2: --> (Usecase2)
@enduml`,
  },
  {
    title: '19. Left to right direction #1',
    source: `@startuml
'default top to bottom direction
user1 --> (Usecase 1)
user2 --> (Usecase 2)
@enduml`,
  },
  {
    title: '20. Left to right direction #2',
    source: `@startuml
left to right direction
user1 --> (Usecase 1)
user2 --> (Usecase 2)
@enduml`,
  },
  {
    title: '21. Skinparam',
    source: `@startuml
!option handwritten true
skinparam usecase {
  BackgroundColor DarkSeaGreen
  BorderColor DarkSlateGray
  BackgroundColor<< Main >> YellowGreen
  BorderColor<< Main >> YellowGreen
  ArrowColor Olive
  ActorBorderColor black
  ActorFontName Courier
  ActorBackgroundColor<< Human >> Gold
}
User << Human >>
:Main Database: as MySql << Application >>
(Start) << One Shot >>
(Use the application) as (Use) << Main >>
User -> (Start)
User --> (Use)
MySql --> (Use)
@enduml`,
  },
  {
    title: '22. Complete example',
    source: `@startuml
left to right direction
skinparam packageStyle rectangle
actor customer
actor clerk
rectangle checkout {
  customer -- (checkout)
  (checkout) .> (payment) : include
  (help) .> (checkout) : extends
  (checkout) -- clerk
}
@enduml`,
  },
  {
    title: '23. Business Use Case — Business Usecase',
    source: `@startuml
(First usecase)/
(Another usecase)/ as (UC2)
usecase/ UC3
usecase/ (Last\\nusecase) as UC4
@enduml`,
  },
  {
    title: '24. Business Use Case — Business Actor',
    source: `@startuml
:First Actor:/
:Another\\nactor:/ as Man2
actor/ Woman3
actor/ :Last actor: as Person1
@enduml`,
  },
  {
    title: '25. Change arrow color and style (inline style)',
    source: `@startuml
actor foo
foo --> (bar) : normal
foo --> (bar1) #line:red;line.bold;text:red : red bold
foo --> (bar2) #green;line.dashed;text:green : green dashed
foo --> (bar3) #blue;line.dotted;text:blue : blue dotted
@enduml`,
  },
  {
    title: '26. Change element color and style (inline style)',
    source: `@startuml
actor a
actor b #pink;line:red;line.bold;text:red
usecase c #palegreen;line:green;line.dashed;text:green
usecase d #aliceblue;line:blue;line.dotted;text:blue
@enduml`,
  },
  {
    title: '27. Display JSON Data on Usecase diagram — Simple example',
    source: `@startuml
allowmixing
actor Actor
usecase Usecase
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
@enduml`,
  },
];
