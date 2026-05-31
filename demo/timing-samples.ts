// PlantUML timing-diagram examples extracted from https://plantuml.com/en/timing-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface TimingSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_TIMING_LIST: ReadonlyArray<TimingSample> = [
  {
    title: '1. Declaring element or participant',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
rectangle "Rect. Web User" as RWU
@0
WU is Idle
RWU is Idle
WB is Idle
@100
WU is Waiting
RWU is Waiting
WB is Processing
@300
WB is Waiting
@enduml`,
  },
  {
    title: '2. Declaring element or participant',
    source: `@startuml
clock "Clock_0" as C0 with period 50
clock "Clock_1" as C1 with period 50 pulse 15 offset 10
binary "Binary" as B
concise "Concise" as C
rectangle "Rectangle" as Re
robust "Robust" as R
analog "Analog" as A
@0
C is Idle
R is Idle
Re is Idle
A is 0
@100
B is high
C is Waiting
Re is Waiting
R is Processing
A is 3
@300
R is Waiting
A is 1
@enduml`,
  },
  {
    title: '3. Binary and Clock',
    source: `@startuml
clock clk with period 1
binary "Enable" as EN
@0
EN is low
@5
EN is high
@10
EN is low
@enduml`,
  },
  {
    title: '4. Adding message',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
rectangle "Rect. Web User" as RWU
@0
WU is Idle
RWU is Idle
WB is Idle
@100
WU -> WB : URL
WU is Waiting
RWU is Waiting
WB is Processing
@300
WB is Waiting
@enduml`,
  },
  {
    title: '5. Relative time',
    source: `@startuml
robust "DNS Resolver" as DNS
robust "Web Browser" as WB
concise "Web User" as WU
@0
WU is Idle
WB is Idle
DNS is Idle
@+100
WU -> WB : URL
WU is Waiting
WB is Processing
@+200
WB is Waiting
WB -> DNS@+50 : Resolve URL
@+100
DNS is Processing
@+300
DNS is Idle
@enduml`,
  },
  {
    title: '6. Anchor Points',
    source: `@startuml
clock clk with period 1
binary "enable" as EN
concise "dataBus" as db
@0 as :start
@5 as :en_high
@10 as :en_low
@:en_high-2 as :en_highMinus2
@:start
EN is low
db is "0x0000"
@:en_high
EN is high
@:en_low
EN is low
@:en_highMinus2
db is "0xf23a"
@:en_high+6
db is "0x0000"
@enduml`,
  },
  {
    title: '7. Anchor Points with decimal offset',
    source: `@startuml
binary "enable" as EN
@3 as :start
@5.5 as :en_high
@10 as :en_low
@:en_high-2 as :en_highMinus2
@:start
EN is low
@:en_high+1.2
EN is high
@10.5
EN is low
@enduml`,
  },
  {
    title: '8. Participant oriented',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
@WB
0 is idle
+200 is Proc.
+100 is Waiting
@WU
0 is Waiting
+500 is ok
@enduml`,
  },
  {
    title: '9. Setting scale',
    source: `@startuml
concise "Web User" as WU
scale 100 as 50 pixels
@WU
0 is Waiting
+500 is ok
@enduml`,
  },
  {
    title: '10. Setting scale',
    source: `@startuml
concise "Season" as S
'30 days is scaled to 50 pixels
scale 2592000 as 50 pixels
@2000/11/01
S is "Winter"
@2001/02/01
S is "Spring"
@2001/05/01
S is "Summer"
@2001/08/01
S is "Fall"
@enduml`,
  },
  {
    title: '11. Initial state',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
WB is Initializing
WU is Absent
@WB
0 is idle
+200 is Processing
+100 is Waiting
@WU
0 is Waiting
+500 is ok
@enduml`,
  },
  {
    title: '12. Intricated state',
    source: `@startuml
robust "Signal1" as S1
robust "Signal2" as S2
S1 has 0,1,2,hello
S2 has 0,1,2
@0
S1 is 0
S2 is 0
@100
S1 is {0,1} #SlateGrey
S2 is {0,1}
@200
S1 is 1
S2 is 0
@300
S1 is hello
S2 is {0,2}
@enduml`,
  },
  {
    title: '13. Intricated state',
    source: `@startuml
clock "Clock" as C with period 2
binary "Enable" as EN
@0
EN is low
@1
EN is high
@3
EN is low
@5
EN is {low,high}
@10
EN is low
@enduml`,
  },
  {
    title: '14. Hidden state',
    source: `@startuml
concise "Web User" as WU
@0
WU is {-}
@100
WU is A1
@200
WU is {-}
@300
WU is {hidden}
@400
WU is A3
@500
WU is {-}
@enduml`,
  },
  {
    title: '15. Hidden state',
    source: `@startuml
scale 1 as 50 pixels
concise state0
concise substate1
robust bit2
bit2 has HIGH,LOW
@state0
0 is 18_start
6 is s_dPause
8 is 10_data
14 is {hidden}
@substate1
0 is sSeq
4 is sPause
6 is {hidden}
8 is dSeq
12 is dPause
14 is {hidden}
@bit2
0 is HIGH
2 is LOW
4 is {hidden}
8 is HIGH
10 is LOW
12 is {hidden}
@enduml`,
  },
  {
    title: '16. Negative time value',
    source: `@startuml
robust "R-Deci" as RD
concise "R-Algo-0" as RA0
robust "R-Algo-1" as RA1
@200
RD is 0
RA0 is 0
@-200
RD is 1
RA0 is 3
@100
RD is 0
@enduml`,
  },
  {
    title: '17. Hide time axis',
    source: `@startuml
hide time-axis
concise "Web User" as WU
WU is Absent
@WU
0 is Waiting
+500 is ok
@enduml`,
  },
  {
    title: '18. Using Time and Date',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
@2019/07/02
WU is Idle
WB is Idle
@2019/07/04
WU is Waiting : some note
WB is Processing : some other note
@2019/07/05
WB is Waiting
@enduml`,
  },
  {
    title: '19. Using Time and Date',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
@1:15:00
WU is Idle
WB is Idle
@1:16:30
WU is Waiting : some note
WB is Processing : some other note
@1:17:30
WB is Waiting
@enduml`,
  },
  {
    title: '20. Change Date Format',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
use date format "YY-MM-dd"
@2019/07/02
WU is Idle
WB is Idle
@2019/07/04
WU is Waiting : some note
WB is Processing : some other note
@2019/07/05
WB is Waiting
@enduml`,
  },
  {
    title: '21. Manage time axis labels',
    source: `@startuml
scale 31536000 as 40 pixels
use date format "yy-MM"
concise "OpenGL Desktop" as OD
@1992/01/01
OD is {hidden}
@1992/06/30
OD is 1.0
@1997/03/04
OD is 1.1
@1998/03/16
OD is 1.2
@2001/08/14
OD is 1.3
@2004/09/07
OD is 3.0
@2008/08/01
OD is 3.0
@2017/07/31
OD is 4.6
@enduml`,
  },
  {
    title: '22. Manage time axis labels',
    source: `@startuml
scale 31536000 as 40 pixels
manual time-axis
use date format "yy-MM"
concise "OpenGL Desktop" as OD
@1992/01/01
OD is {hidden}
@1992/06/30
OD is 1.0
@1997/03/04
OD is 1.1
@1998/03/16
OD is 1.2
@2001/08/14
OD is 1.3
@2004/09/07
OD is 3.0
@2008/08/01
OD is 3.0
@2017/07/31
OD is 4.6
@enduml`,
  },
  {
    title: '23. Adding constraint',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
WB is Initializing
WU is Absent
@WB
0 is idle
+200 is Processing
+100 is Waiting
WB@0 <-> @50 : {50 ms lag}
@WU
0 is Waiting
+500 is ok
@200 <-> @+150 : {150 ms}
@enduml`,
  },
  {
    title: '24. Highlighted period',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
@0
WU is Idle
WB is Idle
@100
WU -> WB : URL
WU is Waiting #LightCyan;line:Aqua
@200
WB is Proc.
@300
WU -> WB@350 : URL2
WB is Waiting
@+200
WU is ok
@+200
WB is Idle
highlight 200 to 450 #Gold;line:DimGrey : This is my caption
highlight 600 to 700 : This is another\\nhighlight
@enduml`,
  },
  {
    title: '25. Using notes',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
@0
WU is Idle
WB is Idle
@100
WU is Waiting
WB is Processing
note top of WU : first note\\non several\\nlines
note bottom of WU : second note\\non several\\nlines
@300
WB is Waiting
@enduml`,
  },
  {
    title: '26. Adding texts',
    source: `@startuml
Title This is my title
header: some header
footer: some footer
legend
Some legend
end legend
caption some caption
robust "Web Browser" as WB
concise "Web User" as WU
@0
WU is Idle
WB is Idle
@100
WU is Waiting
WB is Processing
@300
WB is Waiting
@enduml`,
  },
  {
    title: '27. Complete example',
    source: `@startuml
concise "Client" as Client
concise "Server" as Server
concise "Response freshness" as Cache
Server is idle
Client is idle
@Client
0 is send
Client -> Server@+25 : GET
+25 is await
+75 is recv
+25 is idle
+25 is send
Client -> Server@+25 : GET\\nIf-Modified-Since: 150
+25 is await
+50 is recv
+25 is idle
@100 <-> @275 : no need to re-request from server
@Server
25 is recv
+25 is work
+25 is send
Server -> Client@+25 : 200 OK\\nExpires: 275
+25 is idle
+75 is recv
+25 is send
Server -> Client@+25 : 304 Not Modified
+25 is idle
@Cache
75 is fresh
+200 is stale
@enduml`,
  },
  {
    title: '28. Digital Example',
    source: `@startuml
scale 5 as 150 pixels
clock clk with period 1
binary "enable" as en
binary "R/W" as rw
binary "data Valid" as dv
concise "dataBus" as db
concise "address bus" as addr
@6 as :write_beg
@10 as :write_end
@15 as :read_beg
@19 as :read_end
@0
en is low
db is "0x0"
addr is "0x03f"
rw is low
dv is 0
@:write_beg-3
en is high
@:write_beg-2
db is "0xDEADBEEF"
@:write_beg-1
dv is 1
@:write_beg
rw is high
@:write_end
rw is low
dv is low
@:write_end+1
rw is low
db is "0x0"
addr is "0x23"
@12
dv is high
@13
db is "0xFFFF"
@20
en is low
dv is low
@21
db is "0x0"
highlight :write_beg to :write_end #Gold:Write
highlight :read_beg to :read_end #lightBlue:Read
db@:write_beg-1 <-> @:write_end : setup time
db@:write_beg-1 -> addr@:write_end+1 : hold
@enduml`,
  },
  {
    title: '29. Adding color',
    source: `@startuml
concise "LR" as LR
concise "ST" as ST
LR is AtPlace #palegreen
ST is AtLoad #gray
@LR
0 is Lowering
100 is Lowered #pink
350 is Releasing
@ST
200 is Moving
@enduml`,
  },
  {
    title: '30. Using (global) style',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
WB is Initializing
WU is Absent
@WB
0 is idle
+200 is Processing
+100 is Waiting
WB@0 <-> @50 : {50 ms lag}
@WU
0 is Waiting
+500 is ok
@200 <-> @+150 : {150 ms}
@enduml`,
  },
  {
    title: '31. Using (global) style',
    source: `@startuml
<style>
timingDiagram {
  document {
    BackGroundColor SandyBrown
  }
  constraintArrow {
    LineStyle 2-1
    LineThickness 3
    LineColor Blue
  }
}
</style>
robust "Web Browser" as WB
concise "Web User" as WU
WB is Initializing
WU is Absent
@WB
0 is idle
+200 is Processing
+100 is Waiting
WB@0 <-> @50 : {50 ms lag}
@WU
0 is Waiting
+500 is ok
@200 <-> @+150 : {150 ms}
@enduml`,
  },
  {
    title: '32. Applying Colors to specific lines',
    source: `@startuml
<style>
timingDiagram {
  .red {
    LineColor red
  }
  .blue {
    LineColor blue
    LineThickness 5
  }
}
</style>
clock clk with period 1
binary "Input Signal 1" as IS1
binary "Input Signal 2" as IS2 <<blue>>
binary "Output Signal 1" as OS1 <<red>>
@0
IS1 is low
IS2 is high
OS1 is low
@2
OS1 is high
@4
OS1 is low
@5
IS1 is high
OS1 is high
@6
IS2 is low
@10
IS1 is low
OS1 is low
@enduml`,
  },
  {
    title: '33. Compact mode',
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
robust "Web Browser2" as WB2
@0
WU is Waiting
WB is Idle
WB2 is Idle
@200
WB is Proc.
@300
WB is Waiting
WB2 is Waiting
@500
WU is ok
@700
WB is Idle
@enduml`,
  },
  {
    title: '34. Compact mode',
    source: `@startuml
mode compact
robust "Web Browser" as WB
concise "Web User" as WU
robust "Web Browser2" as WB2
@0
WU is Waiting
WB is Idle
WB2 is Idle
@200
WB is Proc.
@300
WB is Waiting
WB2 is Waiting
@500
WU is ok
@700
WB is Idle
@enduml`,
  },
  {
    title: '35. Compact mode',
    source: `@startuml
compact robust "Web Browser" as WB
compact concise "Web User" as WU
robust "Web Browser2" as WB2
@0
WU is Waiting
WB is Idle
WB2 is Idle
@200
WB is Proc.
@300
WB is Waiting
WB2 is Waiting
@500
WU is ok
@700
WB is Idle
@enduml`,
  },
  {
    title: '36. Scaling analog signal',
    source: `@startuml
title Between 0-max (by default)
analog "Analog" as A
@0
A is 350
@100
A is 450
@300
A is 350
@enduml`,
  },
  {
    title: '37. Scaling analog signal',
    source: `@startuml
title Between min-max
analog "Analog" between 350 and 450 as A
@0
A is 350
@100
A is 450
@300
A is 350
@enduml`,
  },
  {
    title: '38. Customise analog signal',
    source: `@startuml
analog "Vcore" as VDD
analog "VCC" as VCC
@0
VDD is 0
VCC is 3
@2
VDD is 0
@3
VDD is 6
VCC is 6
VDD@1 -> VCC@2 : "test"
@enduml`,
  },
  {
    title: '39. Customise analog signal',
    source: `@startuml
analog "Vcore" as VDD
analog "VCC" between -4.5 and 6.5 as VCC
VCC ticks num on multiple 3
VCC is 200 pixels height
@0
VDD is 0
VCC is 3
@2
VDD is 0
@3
VDD is 6
VCC is 6
VDD@1 -> VCC@2 : "test"
@enduml`,
  },
  {
    title: '40. Order state of robust signal',
    source: `@startuml
robust "Flow rate" as rate
@0
rate is high
@5
rate is none
@6
rate is low
@enduml`,
  },
  {
    title: '41. Order state of robust signal',
    source: `@startuml
robust "Flow rate" as rate
rate has high,low,none
@0
rate is high
@5
rate is none
@6
rate is low
@enduml`,
  },
  {
    title: '42. Order state of robust signal',
    source: `@startuml
robust "Flow rate" as rate
rate has "35 gpm" as high
rate has "15 gpm" as low
rate has "0 gpm" as none
@0
rate is high
@5
rate is none
@6
rate is low
@enduml`,
  },
  {
    title: '43. Defining a timing diagram',
    source: `@startuml
clock "clk" as clk with period 50
concise "Signal1" as S1
robust "Signal2" as S2
binary "Signal3" as S3
@clk*0
S1 is 0
S2 is 0
@clk*1
S1 is 1
S3 is high
@clk*2
S3 is down
@clk*3
S1 is 1
S2 is 1
S3 is 1
@clk*4
S3 is down
@enduml`,
  },
  {
    title: '44. Defining a timing diagram',
    source: `@startuml
clock "clk" as clk with period 50
concise "Signal1" as S1
robust "Signal2" as S2
binary "Signal3" as S3
@S1
0 is 0
50 is 1
150 is 1
@S2
0 is 0
150 is 1
@S3
50 is 1
100 is low
150 is high
200 is 0
@enduml`,
  },
  {
    title: '45. Defining a timing diagram',
    source: `@startuml
clock "clk" as clk with period 50
concise "Signal1" as S1
robust "Signal2" as S2
binary "Signal3" as S3
@0
S1 is 0
S2 is 0
@50
S1 is 1
S3 is 1
@100
S3 is low
@150
S1 is 1
S2 is 1
S3 is high
@200
S3 is 0
@enduml`,
  },
  {
    title: '46. Annotate signal with comment',
    source: `@startuml
binary "Binary Serial Data" as D
robust "Robust" as R
concise "Concise" as C
@-3
D is low: idle
R is lo: idle
C is 1: idle
@-1
D is high: start
R is hi: start
C is 0: start
@0
D is low: 1 lsb
R is lo: 1 lsb
C is 1: lsb
@1
D is high: 0
R is hi: 0
C is 0
@6
D is low: 1
R is lo: 1
C is 1
@7
D is high: 0 msb
R is hi: 0 msb
C is 0: msb
@8
D is low: stop
R is lo: stop
C is 1: stop
@0 <-> @8 : Serial data bits for ASCII "A" (Little Endian)
@enduml`,
  },
];
