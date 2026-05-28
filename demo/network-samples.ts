// PlantUML nwdiag-diagram examples extracted from https://plantuml.com/en/nwdiag-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface NetworkSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_NETWORK_LIST: ReadonlyArray<NetworkSample> = [
  {
    title: '1. Simple diagram',
    source: `@startnwdiag
nwdiag {
network dmz {
address = "210.x.x.x/24"
}
}
@endnwdiag`,
  },
  {
    title: '2. Simple diagram',
    source: `@startnwdiag
network dmz {
address = "210.x.x.x/24"
}
@endnwdiag`,
  },
  {
    title: '3. Simple diagram',
    source: `@startnwdiag
network dmz {
address = "210.x.x.x/24"
web01 [address = "210.x.x.1"];
web02 [address = "210.x.x.2"];
}
@endnwdiag`,
  },
  {
    title: '4. Simple diagram',
    source: `@startnwdiag
network dmz {
address = "210.x.x.x/24"
web01 [address = "210.x.x.1"];
web02 [address = "210.x.x.2"];
}
network internal {
address = "172.x.x.x/24";
web01 [address = "172.x.x.1"];
web02 [address = "172.x.x.2"];
db01;
db02;
}
@endnwdiag`,
  },
  {
    title: '5. Define multiple addresses',
    source: `@startnwdiag
network dmz {
address = "210.x.x.x/24"
// set multiple addresses (using comma)
web01 [address = "210.x.x.1, 210.x.x.20"];
web02 [address = "210.x.x.2"];
}
network internal {
address = "172.x.x.x/24";
web01 [address = "172.x.x.1"];
web02 [address = "172.x.x.2"];
db01;
db02;
}
@endnwdiag`,
  },
  {
    title: '6. Grouping nodes',
    source: `@startnwdiag
network Sample_front {
address = "192.168.10.0/24";
// define group
group web {
web01 [address = ".1"];
web02 [address = ".2"];
}
}
network Sample_back {
address = "192.168.20.0/24";
web01 [address = ".1"];
web02 [address = ".2"];
db01 [address = ".101"];
db02 [address = ".102"];
// define network using defined nodes
group db {
db01;
db02;
}
}
@endnwdiag`,
  },
  {
    title: '7. Grouping nodes',
    source: `@startnwdiag
// define group outside of network definitions
group {
color = "#FFAAAA";
web01;
web02;
db01;
}
network dmz {
web01;
web02;
}
network internal {
web01;
web02;
db01;
db02;
}
@endnwdiag`,
  },
  {
    title: '8. Grouping nodes',
    source: `@startnwdiag
group {
color = "#FFaaaa";
web01;
db01;
}
group {
color = "#aaaaFF";
web02;
db02;
}
network dmz {
address = "210.x.x.x/24"
web01 [address = "210.x.x.1"];
web02 [address = "210.x.x.2"];
}
network internal {
address = "172.x.x.x/24";
web01 [address = "172.x.x.1"];
web02 [address = "172.x.x.2"];
db01 ;
db02 ;
}
@endnwdiag`,
  },
  {
    title: '9. Grouping nodes',
    source: `@startnwdiag
group {
color = "#FFaaaa";
web01;
db01;
}
group {
color = "#aaFFaa";
web02;
db02;
}
group {
color = "#aaaaFF";
web03;
db03;
}
network dmz {
web01;
web02;
web03;
}
network internal {
web01;
db01 ;
web02;
db02 ;
web03;
db03;
}
@endnwdiag`,
  },
  {
    title: '10. Extended Syntax (for network or group)',
    source: `@startnwdiag
nwdiag {
network Sample_front {
address = "192.168.10.0/24"
color = "red"
// define group
group web {
web01 [address = ".1, .2", shape = "node"]
web02 [address = ".2, .3"]
}
}
network Sample_back {
address = "192.168.20.0/24"
color = "palegreen"
web01 [address = ".1"]
web02 [address = ".2"]
db01 [address = ".101", shape = database ]
db02 [address = ".102"]
// define network using defined nodes
group db {
db01;
db02;
}
}
}
@endnwdiag`,
  },
  {
    title: '11. Extended Syntax (for network or group)',
    source: `@startnwdiag
nwdiag {
group {
color = "#CCFFCC";
description = "Long group description";
web01;
web02;
db01;
}
network dmz {
web01;
web02;
}
network internal {
web01;
web02;
db01 [address = ".101", shape = database];
}
}
@endnwdiag`,
  },
  {
    title: '12. Using Sprites',
    source: `@startnwdiag
!include <office/Servers/application_server>
!include <office/Servers/database_server>
nwdiag {
network dmz {
address = "210.x.x.x/24"
// set multiple addresses (using comma)
web01 [address = "210.x.x.1, 210.x.x.20", description = "<$application_server>\\n web01"]
web02 [address = "210.x.x.2", description = "<$application_server>\\n web02"];
}
network internal {
address = "172.x.x.x/24";
web01 [address = "172.x.x.1"];
web02 [address = "172.x.x.2"];
db01 [address = "172.x.x.100", description = "<$database_server>\\n db01"];
db02 [address = "172.x.x.101", description = "<$database_server>\\n db02"];
}
}
@endnwdiag`,
  },
  {
    title: '13. Using OpenIconic',
    source: `@startnwdiag
nwdiag {
group nightly {
color = "#FFAAAA";
description = "<&clock> Restarted nightly <&clock>";
web02;
db01;
}
network dmz {
address = "210.x.x.x/24"
user [description = "<&person*4.5>\\n user1"];
// set multiple addresses (using comma)
web01 [address = "210.x.x.1, 210.x.x.20", description = "<&cog*4>\\nweb01"]
web02 [address = "210.x.x.2", description = "<&cog*4>\\nweb02"];
}
network internal {
address = "172.x.x.x/24";
web01 [address = "172.x.x.1"];
web02 [address = "172.x.x.2"];
db01 [address = "172.x.x.100", description = "<&spreadsheet*4>\\n db01"];
db02 [address = "172.x.x.101", description = "<&spreadsheet*4>\\n db02"];
ptr [address = "172.x.x.110", description = "<&print*4>\\n ptr01"];
}
}
@endnwdiag`,
  },
  {
    title: '14. Same nodes on more than two networks',
    source: `@startnwdiag
nwdiag {
// define group at outside network definitions
group {
color = "#7777FF";
web01;
web02;
db01;
}
network dmz {
color = "pink"
web01;
web02;
}
network internal {
web01;
web02;
db01 [shape = database ];
}
network internal2 {
color = "LightBlue";
web01;
web02;
db01;
}
}
@endnwdiag`,
  },
  {
    title: '15. Peer networks',
    source: `@startnwdiag
nwdiag {
inet [shape = cloud];
inet -- router;
network {
router;
web01;
web02;
}
}
@endnwdiag`,
  },
  {
    title: '16. Peer networks and group',
    source: `@startnwdiag
nwdiag {
internet [ shape = cloud];
internet -- router;
network proxy {
router;
app;
}
network default {
app;
db;
}
}
@endnwdiag`,
  },
  {
    title: '17. Peer networks and group',
    source: `@startnwdiag
nwdiag {
internet [ shape = cloud];
internet -- router;
group {
color = "pink";
app;
db;
}
network proxy {
router;
app;
}
network default {
app;
db;
}
}
@endnwdiag`,
  },
  {
    title: '18. Peer networks and group',
    source: `@startnwdiag
nwdiag {
internet [ shape = cloud];
internet -- router;
network proxy {
router;
app;
}
group {
color = "pink";
app;
db;
}
network default {
app;
db;
}
}
@endnwdiag`,
  },
  {
    title: '19. Peer networks and group',
    source: `@startnwdiag
nwdiag {
internet [ shape = cloud];
internet -- router;
network proxy {
router;
app;
}
network default {
app;
db;
}
group {
color = "pink";
app;
db;
}
}
@endnwdiag`,
  },
  {
    title: '20. Add title, caption, header, footer or legend on network diagram',
    source: `@startnwdiag
header some header
footer some footer
title My title
nwdiag {
network inet {
web01 [shape = cloud]
}
}
legend
The legend
end legend
caption This is caption
@endnwdiag`,
  },
  {
    title: '21. With or without shadow',
    source: `@startnwdiag
nwdiag {
network nw {
server;
internet;
}
internet [shape = cloud];
}
@endnwdiag`,
  },
  {
    title: '22. With or without shadow',
    source: `@startnwdiag
<style>
root {
shadowing 0
}
</style>
nwdiag {
network nw {
server;
internet;
}
internet [shape = cloud];
}
@endnwdiag`,
  },
  {
    title: '23. Change width of the networks',
    source: `@startnwdiag
nwdiag {
network NETWORK_BASE {
dev_A [address = "dev_A" ]
dev_B [address = "dev_B" ]
}
network IntNET1 {
dev_B [address = "dev_B1" ]
dev_M [address = "dev_M1" ]
}
network IntNET2 {
dev_B [address = "dev_B2" ]
dev_M [address = "dev_M2" ]
}
}
@endnwdiag`,
  },
  {
    title: '24. Change width of the networks',
    source: `@startnwdiag
nwdiag {
network NETWORK_BASE {
width = full
dev_A [address = "dev_A" ]
dev_B [address = "dev_B" ]
}
network IntNET1 {
dev_B [address = "dev_B1" ]
dev_M [address = "dev_M1" ]
}
network IntNET2 {
dev_B [address = "dev_B2" ]
dev_M [address = "dev_M2" ]
}
}
@endnwdiag`,
  },
  {
    title: '25. Change width of the networks',
    source: `@startnwdiag
nwdiag {
network NETWORK_BASE {
width = full
dev_A [address = "dev_A" ]
dev_B [address = "dev_B" ]
}
network IntNET1 {
width = full
dev_B [address = "dev_B1" ]
dev_M [address = "dev_M1" ]
}
network IntNET2 {
dev_B [address = "dev_B2" ]
dev_M [address = "dev_M2" ]
}
}
@endnwdiag`,
  },
  {
    title: '26. Change width of the networks',
    source: `@startnwdiag
nwdiag {
network NETWORK_BASE {
width = full
dev_A [address = "dev_A" ]
dev_B [address = "dev_B" ]
}
network IntNET1 {
width = full
dev_B [address = "dev_B1" ]
dev_M [address = "dev_M1" ]
}
network IntNET2 {
width = full
dev_B [address = "dev_B2" ]
dev_M [address = "dev_M2" ]
}
}
@endnwdiag`,
  },
  {
    title: '27. Change width of the networks',
    source: `@startnwdiag
nwdiag {
e1
network n1 {
e1
e2
e3
}
network n2 {
e3
e4
e5
}
network n3 {
e2
e6
}
}
@endnwdiag`,
  },
  {
    title: '28. Change width of the networks',
    source: `@startnwdiag
nwdiag {
e1
network n1 {
width = full
e1
e2
e3
}
network n2 {
e3
e4
e5
}
network n3 {
e2
e6
}
}
@endnwdiag`,
  },
  {
    title: '29. Change width of the networks',
    source: `@startnwdiag
nwdiag {
e1
network n1 {
width = full
e1
e2
e3
}
network n2 {
width = full
e3
e4
e5
}
network n3 {
e2
e6
}
}
@endnwdiag`,
  },
  {
    title: '30. Change width of the networks',
    source: `@startnwdiag
nwdiag {
e1
network n1 {
width = full
e1
e2
e3
}
network n2 {
width = full
e3
e4
e5
}
network n3 {
width = full
e2
e6
}
}
@endnwdiag`,
  },
  {
    title: '31. Other internal networks',
    source: `@startnwdiag
nwdiag {
network LAN1 {
a [address = "a1"];
}
network LAN2 {
a [address = "a2"];
switch;
}
switch -- equip;
equip -- printer;
}
@endnwdiag`,
  },
  {
    title: '32. Other internal networks',
    source: `@startnwdiag
nwdiag {
network LAN1 {
a [address = "a1"];
}
network LAN2 {
a [address = "a2"];
switch [address = "s2"];
}
switch -- equip;
equip [address = "e3"];
equip -- printer;
printer [address = "USB"];
}
@endnwdiag`,
  },
  {
    title: '33. Using (global) style',
    source: `@startnwdiag
nwdiag {
network DMZ {
address = "y.x.x.x/24"
web01 [address = "y.x.x.1"];
web02 [address = "y.x.x.2"];
}
network Internal {
web01;
web02;
db01 [address = "w.w.w.z", shape = database];
}
group {
description = "long group label";
web01;
web02;
db01;
}
}
@endnwdiag`,
  },
  {
    title: '34. Using (global) style',
    source: `@startnwdiag
<style>
nwdiagDiagram {
network {
BackGroundColor green
LineColor red
LineThickness 1.0
FontSize 18
FontColor navy
}
server {
BackGroundColor pink
LineColor yellow
LineThickness 1.0
' FontXXX only for description or label
FontSize 18
FontColor #blue
}
arrow {
' FontXXX only for address
FontSize 17
FontColor #red
FontName Monospaced
LineColor black
}
group {
BackGroundColor cadetblue
LineColor black
LineThickness 2.0
FontSize 11
FontStyle bold
Margin 5
Padding 5
}
}
</style>
nwdiag {
network DMZ {
address = "y.x.x.x/24"
web01 [address = "y.x.x.1"];
web02 [address = "y.x.x.2"];
}
network Internal {
web01;
web02;
db01 [address = "w.w.w.z", shape = database];
}
group {
description = "long group label";
web01;
web02;
db01;
}
}
@endnwdiag`,
  },
  {
    title: '35. Appendix: Test of all shapes on Network diagram (nwdiag)',
    source: `@startnwdiag
nwdiag {
network Network {
Actor [shape = actor]
Agent [shape = agent]
Artifact [shape = artifact]
Boundary [shape = boundary]
Card [shape = card]
Cloud [shape = cloud]
Collections [shape = collections]
Component [shape = component]
}
}
@endnwdiag`,
  },
  {
    title: '36. Appendix: Test of all shapes on Network diagram (nwdiag)',
    source: `@startnwdiag
nwdiag {
network Network {
Control [shape = control]
Database [shape = database]
Entity [shape = entity]
File [shape = file]
Folder [shape = folder]
Frame [shape = frame]
Hexagon [shape = hexagon]
Interface [shape = interface]
}
}
@endnwdiag`,
  },
  {
    title: '37. Appendix: Test of all shapes on Network diagram (nwdiag)',
    source: `@startnwdiag
nwdiag {
network Network {
Label [shape = label]
Node [shape = node]
Package [shape = package]
Person [shape = person]
Queue [shape = queue]
Stack [shape = stack]
Rectangle [shape = rectangle]
Storage [shape = storage]
Usecase [shape = usecase]
}
}
@endnwdiag`,
  },
  {
    title: '38. Appendix: Test of all shapes on Network diagram (nwdiag)',
    source: `@startnwdiag
nwdiag {
network Network {
Folder [shape = folder]
Hexagon [shape = hexagon]
}
}
@endnwdiag`,
  },
  {
    title: '39. Appendix: Test of all shapes on Network diagram (nwdiag)',
    source: `@startnwdiag
nwdiag {
network Network {
Folder [shape = folder, description = "Test, long long label\\nTest, long long label"]
Hexagon [shape = hexagon, description = "Test, long long label\\nTest, long long label"]
}
}
@endnwdiag`,
  },
];
