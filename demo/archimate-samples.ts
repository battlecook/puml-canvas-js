// PlantUML archimate-diagram examples extracted from https://plantuml.com/en/archimate-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface ArchimateSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_ARCHIMATE_LIST: ReadonlyArray<ArchimateSample> = [
  {
    title: '1. Archimate keyword',
    source: `@startuml archimate #Technology "VPN Server" as vpnServerA <<technology-device>> rectangle GO #lightgreen rectangle STOP #red rectangle WAIT #orange @enduml`,
  },
  {
    title: '2. Defining Junctions',
    source: `@startuml !define Junction_Or circle #black !define Junction_And circle #whitesmoke Junction_And JunctionAnd Junction_Or JunctionOr archimate #Technology "VPN Server" as vpnServerA <<technology-device>> rectangle GO #lightgreen rectangle STOP #red rectangle WAIT #orange GO -up-> JunctionOr STOP -up-> JunctionOr STOP -down-> JunctionAnd WAIT -down-> JunctionAnd @enduml`,
  },
  {
    title: '3. Example 1',
    source: `@startuml skinparam rectangle<<behavior>> { roundCorner 25 } sprite $bProcess jar:archimate/business-process sprite $aService jar:archimate/application-service sprite $aComponent jar:archimate/application-component rectangle "Handle claim" as HC <<$bProcess>><<behavior>> #Business rectangle "Capture Information" as CI <<$bProcess>><<behavior>> #Business rectangle "Notify\\nAdditional Stakeholders" as NAS <<$bProcess>><<behavior>> #Business rectangle "Validate" as V <<$bProcess>><<behavior>> #Business rectangle "Investigate" as I <<$bProcess>><<behavior>> #Business rectangle "Pay" as P <<$bProcess>><<behavior>> #Business HC *-down- CI HC *-down- NAS HC *-down- V HC *-down- I HC *-down- P CI -right->> NAS NAS -right->> V V -right->> I I -right->> P rectangle "Scanning" as scanning <<$aService>><<behavior>> #Application rectangle "Customer administration" as customerAdministration <<$aService>><<behavior>> #Application rectangle "Claims administration" as claimsAdministration <<$aService>><<behavior>> #Application rectangle Printing <<$aService>><<behavior>> #Application rectangle Payment <<$aService>><<behavior>> #Application scanning -up-> CI customerAdministration -up-> CI claimsAdministration -up-> NAS claimsAdministration -up-> V claimsAdministration -up-> I Payment -up-> P Printing -up-> V Printing -up-> P rectangle "Document\\nManagement\\nSystem" as DMS <<$aComponent>> #Application rectangle "General\\nCRM\\nSystem" as CRM <<$aComponent>> #Application rectangle "Home & Away\\nPolicy\\nAdministration" as HAPA <<$aComponent>> #Application rectangle "Home & Away\\nFinancial\\nAdministration" as HFPA <<$aComponent>> #Application DMS .up.|> scanning DMS .up.|> Printing CRM .up.|> customerAdministration HAPA .up.|> claimsAdministration HFPA .up.|> Payment legend left Example from the "Archisurance case study" (OpenGroup). See ==== <$bProcess> :business process ==== <$aService> : application service ==== <$aComponent> : application component endlegend @enduml`,
  },
  {
    title: '4. Example 2',
    source: `@startuml skinparam roundcorner 25 rectangle "Capture Information" as CI <<$archimate/business-process>> #Business @enduml`,
  },
  {
    title: '5. List possible sprites',
    source: `@startuml listsprite @enduml`,
  },
  {
    title: '6. ArchiMate Macros',
    source: `@startuml !include <archimate/Archimate> Motivation_Stakeholder(StakeholderElement, "Stakeholder Description") @enduml`,
  },
  {
    title: '7. ArchiMate Macros',
    source: `@startuml !include <archimate/Archimate> Business_Service(BService, "Business Service") @enduml`,
  },
  {
    title: '8. ArchiMate Macros',
    source: `@startuml !include <archimate/Archimate> Motivation_Stakeholder(StakeholderElement, "Stakeholder Description") Business_Service(BService, "Business Service") Rel_Composition(StakeholderElement, BService, "Description for the relationship") @enduml`,
  },
  {
    title: '9. ArchiMate Macros',
    source: `@startuml !include <archimate/Archimate> Motivation_Stakeholder(StakeholderElement, "Stakeholder Description") Business_Service(BService, "Business Service") Rel_Composition_Down(StakeholderElement, BService, "Description for the relationship") @enduml`,
  },
  {
    title: '10. ArchiMate Macros',
    source: `@startuml left to right direction skinparam nodesep 4 !include <archimate/Archimate> Rel_Triggering(i15, j15, Triggering) Rel_Specialization(i14, j14, Specialization) Rel_Serving(i13, j13, Serving) Rel_Realization(i12, j12, Realization) Rel_Influence(i11, j11, Influence) Rel_Flow(i10, j10, Flow) Rel_Composition(i9, j9, Composition) Rel_Association_dir(i8, j8, Association_dir) Rel_Association(i7, j7, Association) Rel_Assignment(i6, j6, Assignment) Rel_Aggregation(i5, j5, Aggregation) Rel_Access_w(i4, j4, Access_w) Rel_Access_rw(i3, j3, Access_rw) Rel_Access_r(i2, j2, Access_r) Rel_Access(i1, j1, Access) @enduml`,
  },
  {
    title: '11. ArchiMate Macros',
    source: `@startuml title ArchiMate Relationships Overview skinparam nodesep 5 <style> interface { shadowing 0 backgroundcolor transparent linecolor transparent FontColor transparent } </style> !include <archimate/Archimate> left to right direction rectangle Other { () i14 () j14 } rectangle Dynamic { () i10 () j10 () i15 () j15 } rectangle Dependency { () i13 () j13 () i4 () j4 () i11 () j11 () i7 () j7 } rectangle Structural { () i9 () j9 () i5 () j5 () i6 () j6 () i12 () j12 } Rel_Triggering(i15, j15, Triggering) Rel_Specialization(i14, j14, Specialization) Rel_Serving(i13, j13, Serving) Rel_Realization(i12, j12, Realization) Rel_Influence(i11, j11, Influence) Rel_Flow(i10, j10, Flow) Rel_Composition(i9, j9, Composition) Rel_Association_dir(i7, j7, \\nAssociation_dir) Rel_Association(i7, j7, Association) Rel_Assignment(i6, j6, Assignment) Rel_Aggregation(i5, j5, Aggregation) Rel_Access_w(i4, j4, Access_w) Rel_Access_rw(i4, j4, Access_rw) Rel_Access_r(i4, j4, Access_r) Rel_Access(i4, j4, Access) @enduml`,
  },
];
