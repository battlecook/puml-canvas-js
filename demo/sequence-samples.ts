// PlantUML sequence-diagram examples extracted from https://plantuml.com/en/sequence-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface SequenceSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_SEQUENCE_LIST: ReadonlyArray<SequenceSample> = [
  {
    title: '1. Basic Examples',
    source: `@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response
Alice -> Bob: Another authentication Request
Alice <-- Bob: Another authentication Response
@enduml`,
  },
  {
    title: '2. Declaring participant #1',
    source: `@startuml
participant Participant as Foo
actor Actor as Foo1
boundary Boundary as Foo2
control Control as Foo3
entity Entity as Foo4
database Database as Foo5
collections Collections as Foo6
queue Queue as Foo7
Foo -> Foo1 : To actor
Foo -> Foo2 : To boundary
Foo -> Foo3 : To control
Foo -> Foo4 : To entity
Foo -> Foo5 : To database
Foo -> Foo6 : To collections
Foo -> Foo7: To queue
@enduml`,
  },
  {
    title: '3. Declaring participant #2',
    source: `@startuml
actor Bob #red
' The only difference between actor 'and participant is the drawing
participant Alice
participant "I have a really\\nlong name" as L #99FF99
/' You can also declare: participant L as "I have a really\\nlong name" #99FF99 '/
Alice->Bob: Authentication Request
Bob->Alice: Authentication Response
Bob->L: Log transaction
@enduml`,
  },
  {
    title: '4. Declaring participant #3',
    source: `@startuml
participant Last order 30
participant Middle order 20
participant First order 10
@enduml`,
  },
  {
    title: '5. Declaring participant on multiline',
    source: `@startuml
participant Participant [
=Title
----
""SubTitle""
]
participant Bob
Participant -> Bob
@enduml`,
  },
  {
    title: '6. Use non-letters in participants',
    source: `@startuml
Alice -> "Bob()" : Hello
"Bob()" -> "This is very\\nlong" as Long
' You can also declare:
' "Bob()" -> Long as "This is very\\nlong"
Long --> "Bob()" : ok
@enduml`,
  },
  {
    title: '7. Message to Self #1',
    source: `@startuml
Alice -> Alice: This is a signal to self.\\nIt also demonstrates\\nmultiline \\ntext
@enduml`,
  },
  {
    title: '8. Message to Self #2',
    source: `@startuml
Alice <- Alice: This is a signal to self.\\nIt also demonstrates\\nmultiline \\ntext
@enduml`,
  },
  {
    title: '9. Text alignment',
    source: `@startuml
skinparam sequenceMessageAlign right
Bob -> Alice : Request
Alice -> Bob : Response
@enduml`,
  },
  {
    title: '10. Text of response message below the arrow',
    source: `@startuml
skinparam responseMessageBelowArrow true
Bob -> Alice : hello
Bob <- Alice : ok
@enduml`,
  },
  {
    title: '11. Stick man (by default)',
    source: `@startuml
actor Alice
actor Bob
Alice -> Bob : hello
hide footbox
@enduml`,
  },
  {
    title: '12. Awesome man',
    source: `@startuml
skinparam actorStyle awesome
actor Alice
actor Bob
Alice -> Bob : hello
hide footbox
@enduml`,
  },
  {
    title: '13. Hollow man',
    source: `@startuml
skinparam actorStyle Hollow
actor Alice
actor Bob
Alice -> Bob : hello
hide footbox
@enduml`,
  },
  {
    title: '14. Change arrow style',
    source: `@startuml
Bob ->x Alice
Bob -> Alice
Bob ->> Alice
Bob -\\ Alice
Bob \\\\- Alice
Bob //-- Alice
Bob ->o Alice
Bob o\\\\-- Alice
Bob <-> Alice
Bob <->o Alice
@enduml`,
  },
  {
    title: '15. Change arrow color',
    source: `@startuml
Bob -[#red]> Alice : hello
Alice -[#0000FF]->Bob : ok
@enduml`,
  },
  {
    title: '16. Message sequence numbering #1',
    source: `@startuml
autonumber
Bob -> Alice : Authentication Request
Bob <- Alice : Authentication Response
@enduml`,
  },
  {
    title: '17. Message sequence numbering #2',
    source: `@startuml
autonumber
Bob -> Alice : Authentication Request
Bob <- Alice : Authentication Response
autonumber 15
Bob -> Alice : Another authentication Request
Bob <- Alice : Another authentication Response
autonumber 40 10
Bob -> Alice : Yet another authentication Request
Bob <- Alice : Yet another authentication Response
@enduml`,
  },
  {
    title: '18. Message sequence numbering #3',
    source: `@startuml
autonumber "<b>[000]"
Bob -> Alice : Authentication Request
Bob <- Alice : Authentication Response
autonumber 15 "<b>(<u>##</u>)"
Bob -> Alice : Another authentication Request
Bob <- Alice : Another authentication Response
autonumber 40 10 "<font color=red><b>Message 0 "
Bob -> Alice : Yet another authentication Request
Bob <- Alice : Yet another authentication Response
@enduml`,
  },
  {
    title: '19. Message sequence numbering #4',
    source: `@startuml
autonumber 10 10 "<b>[000]"
Bob -> Alice : Authentication Request
Bob <- Alice : Authentication Response
autonumber stop
Bob -> Alice : dummy
autonumber resume "<font color=red><b>Message 0 "
Bob -> Alice : Yet another authentication Request
Bob <- Alice : Yet another authentication Response
autonumber stop
Bob -> Alice : dummy
autonumber resume 1 "<font color=blue><b>Message 0 "
Bob -> Alice : Yet another authentication Request
Bob <- Alice : Yet another authentication Response
@enduml`,
  },
  {
    title: '20. Message sequence numbering #5',
    source: `@startuml
autonumber 1.1.1
Alice -> Bob: Authentication request
Bob --> Alice: Response
autonumber inc A
'Now we have 2.1.1
Alice -> Bob: Another authentication request
Bob --> Alice: Response
autonumber inc B
'Now we have 2.2.1
Alice -> Bob: Another authentication request
Bob --> Alice: Response
autonumber inc A
'Now we have 3.1.1
Alice -> Bob: Another authentication request
autonumber inc B
'Now we have 3.2.1
Bob --> Alice: Response
@enduml`,
  },
  {
    title: '21. Message sequence numbering #6',
    source: `@startuml
autonumber 10
Alice -> Bob
note right
the %autonumber% works everywhere.
Here, its value is ** %autonumber% **
end note
Bob --> Alice: //This is the response %autonumber%//
@enduml`,
  },
  {
    title: '22. Page Title, Header and Footer',
    source: `@startuml
header Page Header
footer Page %page% of %lastpage%
title Example Title
Alice -> Bob : message 1
Alice -> Bob : message 2
@enduml`,
  },
  {
    title: '23. With newpage',
    source: `@startuml
Alice -> Bob : message 1
Alice -> Bob : message 2
newpage
Alice -> Bob : message 3
Alice -> Bob : message 4
newpage A title for the\\nlast page
Alice -> Bob : message 5
Alice -> Bob : message 6
@enduml`,
  },
  {
    title: '24. %page% and %lastpage% variables',
    source: `@startuml
footer This is %page% of %lastpage%
Alice --> Bob : A1
newpage
Alice --> Bob : A2
newpage
Alice --> Bob : A3
newpage
Alice --> Bob : A4
@enduml`,
  },
  {
    title: '25. Ignore newpage',
    source: `@startuml
ignore newpage
Alice -> Bob : message 1
Alice -> Bob : message 2
newpage
Alice -> Bob : message 3
Alice -> Bob : message 4
newpage A title for the\\nlast page
Alice -> Bob : message 5
Alice -> Bob : message 6
@enduml`,
  },
  {
    title: '26. Grouping message',
    source: `@startuml
Alice -> Bob: Authentication Request
alt successful case
Bob -> Alice: Authentication Accepted
else some kind of failure
Bob -> Alice: Authentication Failure
group My own label
Alice -> Log : Log attack start
loop 1000 times
Alice -> Bob: DNS Attack
end
Alice -> Log : Log attack end
end
else Another type of failure
Bob -> Alice: Please repeat
end
@enduml`,
  },
  {
    title: '27. Secondary group label',
    source: `@startuml
Alice -> Bob: Authentication Request
Bob -> Alice: Authentication Failure
group My own label [My own label 2]
Alice -> Log : Log attack start
loop 1000 times
Alice -> Bob: DNS Attack
end
Alice -> Log : Log attack end
end
@enduml`,
  },
  {
    title: '28. Messages not grouped horizontally (default)',
    source: `@startuml
participant a
partition p1
b -> c: msg
c --> b: OK
note right: Some right note
end
partition p2
a -> b: msg
note left: Some left note
end
@enduml`,
  },
  {
    title: '29. Grouping horizontally (teoz mode)',
    source: `@startuml
!pragma teoz true
participant a
partition p1
b -> c: msg
c --> b: OK
note right: Some right note
end
partition p2
a -> b: msg
note left: Some left note
end
@enduml`,
  },
  {
    title: '30. Notes on messages',
    source: `@startuml
Alice->Bob : hello
note left: this is a first note
Bob->Alice : ok
note right: this is another note
Bob->Bob : I am thinking
note left
a note can also be defined on several lines
end note
@enduml`,
  },
  {
    title: '31. Some other notes',
    source: `@startuml
participant Alice
participant Bob
note left of Alice #aqua
This is displayed left of Alice.
end note
note right of Alice: This is displayed right of Alice.
note over Alice: This is displayed over Alice.
note over Alice, Bob #FFAAAA: This is displayed\\n over Bob and Alice.
note over Bob, Alice
This is yet another example of a long note.
end note
@enduml`,
  },
  {
    title: '32. Changing notes shape [hnote, rnote]',
    source: `@startuml
caller -> server : conReq
hnote over caller : idle
caller <- server : conConf
rnote over server "r" as rectangle
"h" as hexagon
endrnote
rnote over server
this is on several lines
endrnote
hnote over caller
this is on several lines
endhnote
@enduml`,
  },
  {
    title: '33. Note over all participants [across]',
    source: `@startuml
Alice->Bob:m1
Bob->Charlie:m2
note over Alice, Charlie: Old method for note over all part. with:\\n ""note over //FirstPart, LastPart//"".
note across: New method with:\\n""note across""
Bob->Alice
hnote across:Note across all part.
@enduml`,
  },
  {
    title: "34. Without `/` (notes not aligned)",
    source: `@startuml
note over Alice : initial state of Alice
note over Bob : initial state of Bob
Bob -> Alice : hello
@enduml`,
  },
  {
    title: "35. With `/` (notes aligned)",
    source: `@startuml
note over Alice : initial state of Alice
/
note over Bob : initial state of Bob
Bob -> Alice : hello
@enduml`,
  },
  {
    title: '36. Creole and HTML',
    source: `@startuml
participant Alice
participant "The **Famous** Bob" as Bob
Alice -> Bob : hello --there--
...
Some ~~long delay~~
...
Bob -> Alice : ok
note left
This is **bold**
This is //italics//
This is ""monospaced""
This is --stroked--
This is __underlined__
This is ~~waved~~
end note
Alice -> Bob : A //well formatted// message
note right of Alice
This is <back:cadetblue><size:18>displayed</size></back>
__left of__ Alice.
end note
note left of Bob
<u:red>This</u> is <color #118888>displayed</color>
**<color purple>left of</color> <s:red>Alice</strike> Bob**.
end note
note over Alice, Bob
<w:#FF33FF>This is hosted</w>
by <img:https://plantuml.com/sourceforge.jpg>
end note
@enduml`,
  },
  {
    title: '37. Divider or separator',
    source: `@startuml
== Initialization ==
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response
== Repetition ==
Alice -> Bob: Another authentication Request
Alice <-- Bob: another authentication Response
@enduml`,
  },
  {
    title: '38. Reference',
    source: `@startuml
participant Alice
actor Bob
ref over Alice, Bob : init
Alice -> Bob : hello
ref over Bob
This can be on several lines
end ref
@enduml`,
  },
  {
    title: '39. Delay',
    source: `@startuml
Alice -> Bob: Authentication Request
...
Bob --> Alice: Authentication Response
...5 minutes later...
Bob --> Alice: Good Bye !
@enduml`,
  },
  {
    title: '40. Text wrapping',
    source: `@startuml
skinparam maxMessageSize 50
participant a
participant b
a -> b :this\\nis\\nmanually\\ndone
a -> b :this is a very long message on several words
@enduml`,
  },
  {
    title: '41. Without sequenceMessageSpan (default)',
    source: `@startuml
ParticipantNumber1 -> ParticipantNumber2 : this is a very long message that is very long
ParticipantNumber1 -> ParticipantNumber1 : this is a very long message that is very long
ParticipantNumber2 -> ParticipantNumber3 : foo2
@enduml`,
  },
  {
    title: '42. With sequenceMessageSpan (teoz mode)',
    source: `@startuml
!pragma teoz true
!pragma sequenceMessageSpan true
ParticipantNumber1 -> ParticipantNumber2 : this is a very long message that is very long
ParticipantNumber1 -> ParticipantNumber1 : this is a very long message that is very long
ParticipantNumber2 -> ParticipantNumber3 : foo2
@enduml`,
  },
  {
    title: '43. Space',
    source: `@startuml
Alice -> Bob: message 1
Bob --> Alice: ok
|||
Alice -> Bob: message 2
Bob --> Alice: ok
||45||
Alice -> Bob: message 3
Bob --> Alice: ok
@enduml`,
  },
  {
    title: '44. Lifeline Activation and Destruction #1',
    source: `@startuml
participant User
User -> A: DoWork
activate A
A -> B: << createRequest >>
activate B
B -> C: DoWork
activate C
C --> B: WorkDone
destroy C
B --> A: RequestCreated
deactivate B
A -> User: Done
deactivate A
@enduml`,
  },
  {
    title: '45. Lifeline Activation and Destruction #2',
    source: `@startuml
participant User
User -> A: DoWork
activate A #FFBBBB
A -> A: Internal call
activate A #DarkSalmon
A -> B: << createRequest >>
activate B
B --> A: RequestCreated
deactivate B
deactivate A
A -> User: Done
deactivate A
@enduml`,
  },
  {
    title: '46. Lifeline Activation and Destruction #3',
    source: `@startuml
autoactivate on
alice -> bob : hello
bob -> bob : self call
bill -> bob #005500 : hello from thread 2
bob -> george ** : create
return done in thread 2
return rc
bob -> george !! : delete
return success
@enduml`,
  },
  {
    title: '47. Return',
    source: `@startuml
Bob -> Alice : hello
activate Alice
Alice -> Alice : some action
return bye
@enduml`,
  },
  {
    title: '48. Participant creation',
    source: `@startuml
Bob -> Alice : hello
create Other
Alice -> Other : new
create control String
Alice -> String
note right : You can also put notes!
Alice --> Bob : ok
@enduml`,
  },
  {
    title: '49. Shortcut syntax for activation, deactivation, creation #1',
    source: `@startuml
alice -> bob ++ : hello
bob -> bob ++ : self call
bob -> bib ++ #005500 : hello
bob -> george ** : create
return done
return rc
bob -> george !! : delete
return success
@enduml`,
  },
  {
    title: '50. Shortcut syntax for activation, deactivation, creation #2',
    source: `@startuml
alice -> bob ++ : hello1
bob -> charlie --++ : hello2
charlie --> alice -- : ok
@enduml`,
  },
  {
    title: '51. Shortcut syntax for activation, deactivation, creation #3',
    source: `@startuml
alice -> bob --++ #gold: hello
bob -> alice --++ #gold: you too
alice -> bob --: step1
alice -> bob : step2
@enduml`,
  },
  {
    title: '52. Incoming and outgoing messages #1',
    source: `@startuml
[-> A: DoWork
activate A
A -> A: Internal call
activate A
A ->] : << createRequest >>
A<--] : RequestCreated
deactivate A
[<- A: Done
deactivate A
@enduml`,
  },
  {
    title: '53. Incoming and outgoing messages #2',
    source: `@startuml
participant Alice
participant Bob #lightblue
Alice -> Bob
Bob -> Carol
...
[-> Bob
[o-> Bob
[o->o Bob
[x-> Bob
...
[<- Bob
[x<- Bob
...
Bob ->]
Bob ->o]
Bob o->o]
Bob ->x]
...
Bob <-]
Bob x<-]
@enduml`,
  },
  {
    title: '54. Short arrows for incoming and outgoing messages',
    source: `@startuml
?-> Alice : ""?->""\\n**short** to actor1
[-> Alice : ""[->""\\n**from start** to actor1
[-> Bob : ""[->""\\n**from start** to actor2
?-> Bob : ""?->""\\n**short** to actor2
Alice ->] : ""->]""\\nfrom actor1 **to end**
Alice ->? : ""->?""\\n**short** from actor1
Alice -> Bob : ""->"" \\nfrom actor1 to actor2
@enduml`,
  },
  {
    title: '55. Anchors and Duration',
    source: `@startuml
!pragma teoz true
{start}
Alice -> Bob : start doing things during duration
Bob -> Max : something
Max -> Bob : something else
{end}
Bob -> Alice : finish
{start} <-> {end} : some time
@enduml`,
  },
  {
    title: '56. Stereotypes and Spots #1',
    source: `@startuml
participant "Famous Bob" as Bob << Generated >>
participant Alice << (C,#ADD1B2) Testable >>
Bob->Alice: First message
@enduml`,
  },
  {
    title: '57. Stereotypes and Spots #2',
    source: `@startuml
skinparam guillemet false
participant "Famous Bob" as Bob << Generated >>
participant Alice << (C,#ADD1B2) Testable >>
Bob->Alice: First message
@enduml`,
  },
  {
    title: '58. Stereotypes and Spots #3',
    source: `@startuml
participant Bob << (C,#ADD1B2) >>
participant Alice << (C,#ADD1B2) >>
Bob->Alice: First message
@enduml`,
  },
  {
    title: '59. Top position (default)',
    source: `@startuml
skinparam stereotypePosition top
participant A<<st1>>
participant B<<st2>>
A --> B : stereo test
@enduml`,
  },
  {
    title: '60. Bottom position',
    source: `@startuml
skinparam stereotypePosition bottom
participant A<<st1>>
participant B<<st2>>
A --> B : stereo test
@enduml`,
  },
  {
    title: '61. More information on titles #1',
    source: `@startuml
title __Simple__ **communication** example
Alice -> Bob: Authentication Request
Bob -> Alice: Authentication Response
@enduml`,
  },
  {
    title: '62. More information on titles #2',
    source: `@startuml
title __Simple__ communication example\\non several lines
Alice -> Bob: Authentication Request
Bob -> Alice: Authentication Response
@enduml`,
  },
  {
    title: '63. More information on titles #3',
    source: `@startuml
title <u>Simple</u> communication example on <i>several</i> lines and using <font color=red>html</font>
This is hosted by <img:sourceforge.jpg>
end title
Alice -> Bob: Authentication Request
Bob -> Alice: Authentication Response
@enduml`,
  },
  {
    title: '64. Participants encompass #1',
    source: `@startuml
box "Internal Service" #LightBlue
participant Bob
participant Alice
end box
participant Other
Bob -> Alice : hello
Alice -> Other : hello
@enduml`,
  },
  {
    title: '65. Participants encompass #2',
    source: `@startuml
!pragma teoz true
box "Internal Service" #LightBlue
participant Bob
box "Subteam"
participant Alice
participant John
end box
end box
participant Other
Bob -> Alice : hello
Alice -> John : hello
John -> Other: Hello
@enduml`,
  },
  {
    title: '66. Removing Foot Boxes',
    source: `@startuml
hide footbox
title Foot Box removed
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response
@enduml`,
  },
  {
    title: '67. Skinparam #1',
    source: `@startuml
skinparam sequenceArrowThickness 2
skinparam roundcorner 20
skinparam maxmessagesize 60
skinparam sequenceParticipant underline
actor User
participant "First Class" as A
participant "Second Class" as B
participant "Last Class" as C
User -> A: DoWork
activate A
A -> B: Create Request
activate B
B -> C: DoWork
activate C
C --> B: WorkDone
destroy C
B --> A: Request Created
deactivate B
A --> User: Done
deactivate A
@enduml`,
  },
  {
    title: '68. Skinparam #2',
    source: `@startuml
skinparam backgroundColor #EEEBDC
!option handwritten true
skinparam sequence {
  ArrowColor DeepSkyBlue
  ActorBorderColor DeepSkyBlue
  LifeLineBorderColor blue
  LifeLineBackgroundColor #A9DCDF
  ParticipantBorderColor DeepSkyBlue
  ParticipantBackgroundColor DodgerBlue
  ParticipantFontName Impact
  ParticipantFontSize 17
  ParticipantFontColor #A9DCDF
  ActorBackgroundColor aqua
  ActorFontColor DeepSkyBlue
  ActorFontSize 17
  ActorFontName Aapex
}
actor User
participant "First Class" as A
participant "Second Class" as B
participant "Last Class" as C
User -> A: DoWork
activate A
A -> B: Create Request
activate B
B -> C: DoWork
activate C
C --> B: WorkDone
destroy C
B --> A: Request Created
deactivate B
A --> User: Done
deactivate A
@enduml`,
  },
  {
    title: '69. Changing padding',
    source: `@startuml
skinparam ParticipantPadding 20
skinparam BoxPadding 10
box "Foo1"
participant Alice1
participant Alice2
end box
box "Foo2"
participant Bob1
participant Bob2
end box
Alice1 -> Bob1 : hello
Alice1 -> Out : out
@enduml`,
  },
  {
    title: '70. Normal arrow',
    source: `@startuml
participant Alice as a
participant Bob as b
a -> b : ""-> ""
a ->> b : ""->> ""
a -\\ b : ""-\\ ""
a -\\\\ b : ""-\\\\""
a -/ b : ""-/ ""
a -// b : ""-// ""
a ->x b : ""->x ""
a x-> b : ""x-> ""
a o-> b : ""o-> ""
a ->o b : ""->o ""
a o->o b : ""o->o ""
a <-> b : ""<-> ""
a o<->o b : ""o<->o""
a x<->x b : ""x<->x""
a ->>o b : ""->>o ""
a -\\o b : ""-\\o ""
a -\\\\o b : ""-\\\\o""
a -/o b : ""-/o ""
a -//o b : ""-//o ""
a x->o b : ""x->o ""
@enduml`,
  },
  {
    title: '71. Itself arrow',
    source: `@startuml
participant Alice as a
participant Bob as b
a -> a : ""-> ""
a ->> a : ""->> ""
a -\\ a : ""-\\ ""
a -\\\\ a : ""-\\\\""
a -/ a : ""-/ ""
a -// a : ""-// ""
a ->x a : ""->x ""
a x-> a : ""x-> ""
a o-> a : ""o-> ""
a ->o a : ""->o ""
a o->o a : ""o->o ""
a <-> a : ""<-> ""
a o<->o a : ""o<->o""
a x<->x a : ""x<->x""
a ->>o a : ""->>o ""
a -\\o a : ""-\\o ""
a -\\\\o a : ""-\\\\o""
a -/o a : ""-/o ""
a -//o a : ""-//o ""
a x->o a : ""x->o ""
@enduml`,
  },
  {
    title: "72. Incoming messages (with '[')",
    source: `@startuml
participant Alice as a
participant Bob as b
[-> b : ""[-> ""
[->> b : ""[->> ""
[-\\ b : ""[-\\ ""
[-\\\\ b : ""[-\\\\""
[-/ b : ""[-/ ""
[-// b : ""[-// ""
[->x b : ""[->x ""
[x-> b : ""[x-> ""
[o-> b : ""[o-> ""
[->o b : ""[->o ""
[o->o b : ""[o->o ""
[<-> b : ""[<-> ""
[o<->o b : ""[o<->o""
[x<->x b : ""[x<->x""
[->>o b : ""[->>o ""
[-\\o b : ""[-\\o ""
[-\\\\o b : ""[-\\\\o""
[-/o b : ""[-/o ""
[-//o b : ""[-//o ""
[x->o b : ""[x->o ""
@enduml`,
  },
  {
    title: "73. Outgoing messages (with ']')",
    source: `@startuml
participant Alice as a
participant Bob as b
a ->] : ""->] ""
a ->>] : ""->>] ""
a -\\] : ""-\\] ""
a -\\\\] : ""-\\\\]""
a -/] : ""-/] ""
a -//] : ""-//] ""
a ->x] : ""->x] ""
a x->] : ""x->] ""
a o->] : ""o->] ""
a ->o] : ""->o] ""
a o->o] : ""o->o] ""
a <->] : ""<->] ""
a o<->o] : ""o<->o]""
a x<->x] : ""x<->x]""
a ->>o] : ""->>o] ""
a -\\o] : ""-\\o] ""
a -\\\\o] : ""-\\\\o]""
a -/o] : ""-/o] ""
a -//o] : ""-//o] ""
a x->o] : ""x->o] ""
@enduml`,
  },
  {
    title: "74. Short incoming (with '?')",
    source: `@startuml
participant Alice as a
participant Bob as b
a -> b : //Long long label//
?-> b : ""?-> ""
?->> b : ""?->> ""
?-\\ b : ""?-\\ ""
?-\\\\ b : ""?-\\\\""
?-/ b : ""?-/ ""
?-// b : ""?-// ""
?->x b : ""?->x ""
?x-> b : ""?x-> ""
?o-> b : ""?o-> ""
?->o b : ""?->o ""
?o->o b : ""?o->o ""
?<-> b : ""?<-> ""
?o<->o b : ""?o<->o""
?x<->x b : ""?x<->x""
?->>o b : ""?->>o ""
?-\\o b : ""?-\\o ""
?-\\\\o b : ""?-\\\\o ""
?-/o b : ""?-/o ""
?-//o b : ""?-//o ""
?x->o b : ""?x->o ""
@enduml`,
  },
  {
    title: "75. Short outgoing (with '?')",
    source: `@startuml
participant Alice as a
participant Bob as b
a -> b : //Long long label//
a ->? : ""->? ""
a ->>? : ""->>? ""
a -\\? : ""-\\? ""
a -\\\\? : ""-\\\\?""
a -/? : ""-/? ""
a -//? : ""-//? ""
a ->x? : ""->x? ""
a x->? : ""x->? ""
a o->? : ""o->? ""
a ->o? : ""->o? ""
a o->o? : ""o->o? ""
a <->? : ""<->? ""
a o<->o? : ""o<->o?""
a x<->x? : ""x<->x?""
a ->>o? : ""->>o? ""
a -\\o? : ""-\\o? ""
a -\\\\o? : ""-\\\\o?""
a -/o? : ""-/o? ""
a -//o? : ""-//o? ""
a x->o? : ""x->o? ""
@enduml`,
  },
  {
    title: '76. By default',
    source: `@startuml
Bob -> Alice : hello
...
Alice -> Bob : ok
@enduml`,
  },
  {
    title: '77. Style strictuml',
    source: `@startuml
skinparam style strictuml
Bob -> Alice : hello
...
Alice -> Bob : ok
@enduml`,
  },
  {
    title: '78. LifelineStrategy',
    source: `@startuml
<style>
lifeLine { LineStyle 0 }
delay { LineStyle 1-4 }
</style>
Bob -> Alice : hello
...
Alice -> Bob : ok
@enduml`,
  },
  {
    title: '79. Hide unlinked participant #1',
    source: `@startuml
participant Alice
participant Bob
participant Carol
Alice -> Bob : hello
@enduml`,
  },
  {
    title: '80. Hide unlinked participant #2',
    source: `@startuml
hide unlinked
participant Alice
participant Bob
participant Carol
Alice -> Bob : hello
@enduml`,
  },
  {
    title: '81. Color a group message',
    source: `@startuml
Alice -> Bob: Authentication Request
alt#Gold #LightBlue
Successful case
Bob -> Alice: Authentication Accepted
else #Pink
Failure
Bob -> Alice: Authentication Rejected
end
@enduml`,
  },
  {
    title: '82. Mainframe',
    source: `@startuml
mainframe This is a **mainframe**
Alice->Bob : Hello
@enduml`,
  },
  {
    title: '83. Slanted or odd arrows #1',
    source: `@startuml
A ->(10) B: text 10
B ->(10) A: text 10
A ->(10) B: text 10
A (10)<- B: text 10
@enduml`,
  },
  {
    title: '84. Slanted or odd arrows #2',
    source: `@startuml
A ->(40) B++: Rq
B -->(20) A--: Rs
@enduml`,
  },
  {
    title: '85. Slanted or odd arrows #3',
    source: `@startuml
!pragma teoz true
A ->(50) C: Starts\\nwhen 'B' sends &
B ->(25) C: \\nBut B's message\\n arrives before A's
@enduml`,
  },
  {
    title: '86. Slanted or odd arrows #4',
    source: `@startuml
!pragma teoz true
S1 ->(30) S2: msg 1\\n &
S2 ->(30) S1: msg 2
note left S1: msg\\nS2 to S1 &
note right S2: msg\\nS1 to S2
@enduml`,
  },
  {
    title: '87. Parallel messages (with teoz)',
    source: `@startuml
!pragma teoz true
Alice -> Bob : hello &
Bob -> Charlie : hi
@enduml`,
  },
  {
    title: '88. By default (style)',
    source: `@startuml
Alice -> Bob : hello
...
Alice <- Bob : hello
@enduml`,
  },
  {
    title: '89. Solid Lifeline using style',
    source: `@startuml
<style>
lifeLine { LineStyle 0 }
delay { LineStyle 1-4 }
</style>
Alice -> Bob : hello
...
Alice <- Bob : hello
@enduml`,
  },
];
