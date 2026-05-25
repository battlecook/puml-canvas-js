import { render } from '../src/index.js';

const SAMPLES: Record<string, string> = {
  ebnf: `@startebnf
title Mini PlantUML grammar

diagram = start_directive , { statement } , end_directive ;
start_directive = "@startuml" | "@startjson" | "@startyaml" ;
end_directive = "@enduml" | "@endjson" | "@endyaml" ;
statement = participant | message | block | note ;
participant = ( "participant" | "actor" | "database" ) , quoted_name , [ "as" , identifier ] ;
message = identifier , arrow , identifier , ":" , text ;
arrow = "->" | "-->" | "<-" | "<--" | "->>" ;
block = ( "alt" | "loop" | "par" | "group" ) , text , { statement } , "end" ;
note = "note" , ( "left" | "right" | "over" ) , text , "end note" ;
identifier = letter , { letter | digit | "_" } ;
quoted_name = '"' , { ? any character except quote ? } , '"' ;
@endebnf`,

  regex: `@startregex
title PlantUML file detector

^\\s*@start(?:uml|json|yaml|gantt|mindmap|wbs|ebnf|regex|salt|dot)\\b
@endregex`,

  json: `@startjson
#highlight "services" / "1" / "routes" / "0"
{
  "version": "2026.05",
  "services": [
    {
      "name": "viewer-api",
      "ports": [443, 8443],
      "features": {
        "plantuml": true,
        "mermaid": true,
        "maxUploadMb": 128
      }
    },
    {
      "name": "router",
      "routes": [
        {
          "match": {
            "extension": [".puml", ".plantuml"],
            "mime": "text/x-plantuml"
          },
          "target": "plantuml-viewer",
          "priority": 20
        }
      ]
    }
  ],
  "limits": null,
  "metadata": {
    "unicode": "한글 PlantUML 샘플"
  }
}
@endjson`,

  gantt: `@startgantt
title Release train

Project starts 2026-05-25
saturday are closed
sunday are closed

[Spec freeze] lasts 2 days
[Parser implementation] lasts 5 days and starts at [Spec freeze]'s end
[Golden samples] lasts 3 days and starts at [Spec freeze]'s end
[Renderer fallback] lasts 4 days and starts at [Parser implementation]'s end
[QA sweep] lasts 3 days and starts at [Golden samples]'s end
[QA sweep] starts at [Renderer fallback]'s end
[Store release] happens at [QA sweep]'s end

[Parser implementation] is colored in LightBlue
[Renderer fallback] is colored in LightGreen
[QA sweep] is colored in Salmon

[Parser implementation] requires 2 people
[Golden samples] requires 1 people
[QA sweep] requires 2 people

then [Patch window] lasts 2 days
[Patch window] is colored in Gold
@endgantt`,

  mindmap: `@startmindmap
title Project roadmap
* Product
** Discovery
*** Interviews
*** Surveys
** Build
*** Backend
*** Frontend
*** Mobile
** Launch
*** Marketing
*** Support
@endmindmap`,

  wbs: `@startwbs
* Release v2.0
** Engineering
*** Backend
*** Frontend
*** Infra
** QA
*** Manual
*** Automation
** Docs
*** API ref
*** Guides
@endwbs`,

  activity: `@startuml
title Order processing

start
:Validate cart;
if (cart valid?) then (yes)
  :Reserve inventory;
  fork
    :Charge payment;
  fork again
    :Send confirmation email;
  end merge
  repeat
    :Try shipping;
  repeat while (shipping failed?) is (yes) not (no)
  :Mark shipped;
else (no)
  :Return error;
endif
stop
@enduml`,

  component: `@startuml
title Layered Architecture

component Frontend
component "API Gateway" as API
component AuthService
component OrderService
component PaymentService
database OrdersDB
database SessionsDB

Frontend --> API
API --> AuthService
API --> OrderService
API --> PaymentService
AuthService --> SessionsDB
OrderService --> OrdersDB
@enduml`,

  deployment: `@startuml
title Production Topology

cloud Internet
node "Load Balancer" as LB
node "App Server 1" as APP1
node "App Server 2" as APP2
database PrimaryDB
database ReplicaDB
folder Logs

Internet --> LB
LB --> APP1
LB --> APP2
APP1 --> PrimaryDB
APP2 --> PrimaryDB
PrimaryDB --> ReplicaDB : replicate
APP1 --> Logs
APP2 --> Logs
@enduml`,

  object: `@startuml
title Object snapshot

object alice
alice : name = "Alice"
alice : age = 30
alice : email = "alice@example.com"

object bob
bob : name = "Bob"
bob : age = 28

object order1
order1 : id = 1001
order1 : total = 99.99

alice --> order1 : placed
bob --> alice : friend
@enduml`,

  usecase: `@startuml
title Authentication

actor User
actor Admin

usecase Login as UC1
usecase "Reset Password" as UC2
usecase "Manage Users" as UC3
usecase Authenticate as UC4

User --> UC1
User --> UC2
Admin --> UC3
UC1 ..> UC4 : <<include>>
UC2 ..> UC4 : <<include>>
@enduml`,

  state: `@startuml
title Order lifecycle

[*] --> Pending
state C <<choice>>
Pending --> C : pay
C --> Paid : success
C --> Failed : error
Paid --> Shipped : ship
Shipped --> Delivered : deliver
Delivered --> [*]
Failed --> [*]
@enduml`,

  sequence: `@startuml
title Login flow

actor User
participant Web
control Auth
database Users

autonumber
User -> Web: POST /login
activate Web
Web -> Auth: verify
activate Auth
Auth -> Users: SELECT user
activate Users
Users --> Auth: row
deactivate Users

== authorization ==

alt password ok
  Auth --> Web: 200 OK
else password wrong
  Auth --> Web: 401 Unauthorized
end
deactivate Auth

Web --> User: response
deactivate Web

note over User, Users : end of flow
@enduml`,

  class: `@startuml
title Order System

interface Payable {
  +charge(amount: double): bool
}

abstract class PaymentMethod {
  {abstract} +process(): bool
}

class CreditCard {
  -number: String
  +process(): bool
}

class PayPal {
  -account: String
  +process(): bool
}

class Customer {
  +name: String
}

class Order <<Aggregate>> {
  +id: int
  +total: double
  +place()
}

class LineItem {
  +qty: int
}

class Comment {
  +text: String
}

enum Status {
  PENDING
  PAID
  SHIPPED
}

Comment --> Comment : replyTo

Payable <|.. PaymentMethod
PaymentMethod <|-- CreditCard
PaymentMethod <|-- PayPal

Customer "1" o-- "*" Order : places
Order "1" *-- "*" LineItem : contains
Order ..> PaymentMethod : uses
Order --> Status
@enduml`,
};

const srcEl = document.getElementById('src') as HTMLTextAreaElement;
const outEl = document.getElementById('output') as HTMLDivElement;

function update(): void {
  outEl.replaceChildren();
  try {
    const svg = render(srcEl.value);
    outEl.appendChild(svg);
  } catch (err) {
    const pre = document.createElement('pre');
    pre.style.color = 'crimson';
    pre.textContent = err instanceof Error ? err.message : String(err);
    outEl.appendChild(pre);
  }
}

document.querySelectorAll<HTMLButtonElement>('button[data-sample]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset['sample']!;
    srcEl.value = SAMPLES[key] ?? '';
    update();
  });
});

const fileEl = document.getElementById('file') as HTMLInputElement | null;
fileEl?.addEventListener('change', async () => {
  const file = fileEl.files?.[0];
  if (!file) return;
  try {
    srcEl.value = await file.text();
    update();
  } finally {
    fileEl.value = '';
  }
});

srcEl.value = SAMPLES['sequence']!;
srcEl.addEventListener('input', update);
update();
