// PlantUML gantt-diagram examples extracted from https://plantuml.com/en/gantt-diagram.
// Each entry preserves the literal PlantUML source. PlantUML's "\n" newline escape
// appears here as the two-character sequence \\n in a JS string literal (one backslash + 'n').

export interface GanttSample {
  readonly title: string;
  readonly source: string;
}

export const SAMPLES_GANTT_LIST: ReadonlyArray<GanttSample> = [
  {
    title: '1. Workload',
    source: `@startgantt
[Prototype design] requires 15 days
[Test prototype] requires 10 days
-- All example --
[Task 1 (1 day)] requires 1 day
[T2 (5 days)] requires 5 days
[T3 (1 week)] requires 1 week
[T4 (1 week and 4 days)] requires 1 week and 4 days
[T5 (2 weeks)] requires 2 weeks
@endgantt`,
  },
  {
    title: '2. Start',
    source: `@startgantt
Project starts 2020-07-01
[Prototype design] requires 15 days
[Test prototype] requires 10 days
[Prototype design] starts 2020-07-01
[Test prototype] starts 2020-07-16
@endgantt`,
  },
  {
    title: '3. Start',
    source: `@startgantt
[Prototype design] requires 15 days
[Test prototype] requires 10 days
[Prototype design] starts D+0
[Test prototype] starts D+15
@endgantt`,
  },
  {
    title: '4. End',
    source: `@startgantt
Project starts 2020-07-01
[Prototype design] requires 15 days
[Test prototype] requires 10 days
[Prototype design] ends 2020-07-15
[Test prototype] ends 2020-07-25
@endgantt`,
  },
  {
    title: '5. End',
    source: `@startgantt
[Prototype design] requires 15 days
[Test prototype] requires 10 days
[Prototype design] ends D+14
[Test prototype] ends D+24
@endgantt`,
  },
  {
    title: '6. Start/End',
    source: `@startgantt
Project starts 2020-07-01
[Prototype design] starts 2020-07-01
[Test prototype] starts 2020-07-16
[Prototype design] ends 2020-07-15
[Test prototype] ends 2020-07-25
@endgantt`,
  },
  {
    title: '7. Start/End',
    source: `@startgantt
[Prototype design] starts D+0
[Test prototype] starts D+15
[Prototype design] ends D+14
[Test prototype] ends D+24
@endgantt`,
  },
  {
    title: '8. One-line declaration (with the and conjunction)',
    source: `@startgantt
Project starts 2020-07-01
[Prototype design] starts 2020-07-01 and ends 2020-07-15
[Test prototype] starts 2020-07-16 and requires 10 days
@endgantt`,
  },
  {
    title: '9. Adding constraints',
    source: `@startgantt
[Prototype design] requires 15 days
[Test prototype] requires 10 days
[Test prototype] starts at [Prototype design]'s end
@endgantt`,
  },
  {
    title: '10. Adding constraints',
    source: `@startgantt
[Prototype design] requires 10 days
[Code prototype] requires 10 days
[Write tests] requires 5 days
[Code prototype] starts at [Prototype design]'s end
[Write tests] starts at [Code prototype]'s start
@endgantt`,
  },
  {
    title: '11. Short names or alias',
    source: `@startgantt
[Prototype design] as [D] requires 15 days
[Test prototype] as [T] requires 10 days
[T] starts at [D]'s end
@endgantt`,
  },
  {
    title: '12. Tasks with same name',
    source: `@startgantt
Project starts 2020-11-08
[Task 7 days] as [T7] starts at 2020-11-09
[T7] ends at 2020-11-15
[Task 7 days] as [T7bis] starts at 2020-11-09
[T7bis] ends at 2020-11-15
@endgantt`,
  },
  {
    title: '13. Tasks with same name',
    source: `@startgantt
[SameTaskName] as [T1] lasts 7 days and is colored in pink
[SameTaskName] as [T2] lasts 3 days and is colored in orange
[T1] -> [T2]
@endgantt`,
  },
  {
    title: '14. Customize colors',
    source: `@startgantt
[Prototype design] requires 13 days
[Test prototype] requires 4 days
[Test prototype] starts at [Prototype design]'s end
[Prototype design] is colored in Fuchsia/FireBrick
[Test prototype] is colored in GreenYellow/Green
@endgantt`,
  },
  {
    title: '15. Adding completion depending percentage',
    source: `@startgantt
[foo] requires 21 days
[foo] is 40% completed
[bar] requires 30 days and is 10% complete
@endgantt`,
  },
  {
    title: '16. Change colour of completion (by style)',
    source: `@startgantt
<style>
ganttDiagram {
task {
BackGroundColor GreenYellow
LineColor Green
unstarted {
BackGroundColor Fuchsia
LineColor FireBrick
}
}
}
</style>
[Prototype design] requires 7 days
[Test prototype 0] requires 4 days
[Test prototype 10] requires 4 days
[Test prototype 20] requires 4 days
[Test prototype 30] requires 4 days
[Test prototype 40] requires 4 days
[Test prototype 50] requires 4 days
[Test prototype 60] requires 4 days
[Test prototype 70] requires 4 days
[Test prototype 80] requires 4 days
[Test prototype 90] requires 4 days
[Test prototype 100] requires 4 days
[Test prototype 0] starts at [Prototype design]'s end
[Test prototype 10] starts at [Prototype design]'s end
[Test prototype 20] starts at [Prototype design]'s end
[Test prototype 30] starts at [Prototype design]'s end
[Test prototype 40] starts at [Prototype design]'s end
[Test prototype 50] starts at [Prototype design]'s end
[Test prototype 60] starts at [Prototype design]'s end
[Test prototype 70] starts at [Prototype design]'s end
[Test prototype 80] starts at [Prototype design]'s end
[Test prototype 90] starts at [Prototype design]'s end
[Test prototype 100] starts at [Prototype design]'s end
[Test prototype 0] is 0% complete
[Test prototype 10] is 10% complete
[Test prototype 20] is 20% complete
[Test prototype 30] is 30% complete
[Test prototype 40] is 40% complete
[Test prototype 50] is 50% complete
[Test prototype 60] is 60% complete
[Test prototype 70] is 70% complete
[Test prototype 80] is 80% complete
[Test prototype 90] is 90% complete
[Test prototype 100] is 100% complete
@endgantt`,
  },
  {
    title: '17. Change colour of undone part of Task (by style)',
    source: `@startgantt
<style>
ganttDiagram {
task {
BackGroundColor GreenYellow
LineColor Green
}
undone {
BackGroundColor red
}
}
</style>
[foo] lasts 21 days
[foo] is 40% completed
[bar] lasts 30 days and is 10% complete
@endgantt`,
  },
  {
    title: '18. Relative milestone (use of constraints)',
    source: `@startgantt
[Test prototype] requires 10 days
[Prototype completed] happens at [Test prototype]'s end
[Setup assembly line] requires 12 days
[Setup assembly line] starts at [Test prototype]'s end
@endgantt`,
  },
  {
    title: '19. Absolute milestone (use of fixed date)',
    source: `@startgantt
Project starts 2020-07-01
[Test prototype] requires 10 days
[Prototype completed] happens 2020-07-10
[Setup assembly line] requires 12 days
[Setup assembly line] starts at [Test prototype]'s end
@endgantt`,
  },
  {
    title: '20. Milestone of maximum end of tasks',
    source: `@startgantt
[Task1] requires 4 days
then [Task1.1] requires 4 days
[Task1.2] starts at [Task1]'s end and requires 7 days
[Task2] requires 5 days
then [Task2.1] requires 4 days
[MaxTaskEnd] happens at [Task1.1]'s end
[MaxTaskEnd] happens at [Task1.2]'s end
[MaxTaskEnd] happens at [Task2.1]'s end
@endgantt`,
  },
  {
    title: '21. Hyperlinks',
    source: `@startgantt
[task1] requires 10 days
[task1] links to [[http://plantuml.com]]
@endgantt`,
  },
  {
    title: '22. Calendar',
    source: `@startgantt
Project starts the 20th of september 2017
[Prototype design] as [TASK1] requires 13 days
[TASK1] is colored in Lavender/LightBlue
@endgantt`,
  },
  {
    title: '23. Coloring days',
    source: `@startgantt
Project starts the 2020/09/01
2020/09/07 is colored in salmon
2020/09/13 to 2020/09/16 are colored in lightblue
[Prototype design] as [TASK1] requires 22 days
[TASK1] is colored in Lavender/LightBlue
[Prototype completed] happens at [TASK1]'s end
@endgantt`,
  },
  {
    title: '24. Daily (by default)',
    source: `@startgantt
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '25. Weekly',
    source: `@startgantt
printscale weekly
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '26. Weekly',
    source: `@startgantt
printscale weekly
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '27. Monthly',
    source: `@startgantt
projectscale monthly
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '28. Quarterly',
    source: `@startgantt
projectscale quarterly
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '29. Quarterly',
    source: `@startgantt
projectscale quarterly
Project starts the 1st of october 2020
[Prototype design] as [TASK1] requires 700 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 200 days
[TASK1]->[Testing]
2021-01-18 to 2021-03-22 are colored in salmon
@endgantt`,
  },
  {
    title: '30. Yearly',
    source: `@startgantt
projectscale yearly
Project starts the 1st of october 2020
[Prototype design] as [TASK1] requires 700 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 200 days
[TASK1]->[Testing]
2021-01-18 to 2021-03-22 are colored in salmon
@endgantt`,
  },
  {
    title: '31. Date range with between (Without date range)',
    source: `@startgantt
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 8 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 3 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '32. Date range with between (With date range)',
    source: `@startgantt
Print between 2021-01-12 and 2021-01-22
Saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 8 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 3 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '33. Zoom on daily (default) scale (Without zoom)',
    source: `@startgantt
printscale daily
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 8 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 3 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '34. Zoom on daily (default) scale (With zoom)',
    source: `@startgantt
printscale daily zoom 2
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 8 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 3 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '35. Zoom on weekly scale (Without zoom)',
    source: `@startgantt
printscale weekly
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '36. Zoom on weekly scale (With zoom)',
    source: `@startgantt
printscale weekly zoom 4
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '37. Zoom on monthly scale (Without zoom)',
    source: `@startgantt
projectscale monthly
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '38. Zoom on monthly scale (With zoom)',
    source: `@startgantt
projectscale monthly zoom 3
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '39. Zoom on quarterly scale (Without zoom)',
    source: `@startgantt
projectscale quarterly
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '40. Zoom on quarterly scale (With zoom)',
    source: `@startgantt
projectscale quarterly zoom 7
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '41. Zoom on yearly scale (Without zoom)',
    source: `@startgantt
projectscale yearly
Project starts the 1st of october 2020
[Prototype design] as [TASK1] requires 700 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 200 days
[TASK1]->[Testing]
2021-01-18 to 2021-03-22 are colored in salmon
@endgantt`,
  },
  {
    title: '42. Zoom on yearly scale (With zoom)',
    source: `@startgantt
projectscale yearly zoom 2
Project starts the 1st of october 2020
[Prototype design] as [TASK1] requires 700 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 200 days
[TASK1]->[Testing]
2021-01-18 to 2021-03-22 are colored in salmon
@endgantt`,
  },
  {
    title: '43. With Weeknumbers (by default)',
    source: `@startgantt
printscale weekly
Project starts the 6th of July 2020
[Task1] on {Alice} requires 2 weeks
[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days
@endgantt`,
  },
  {
    title: '44. With Weeknumbers (starting from 1)',
    source: `@startgantt
printscale weekly with week numbering from 1
Project starts the 6th of July 2020
[Task1] on {Alice} requires 2 weeks
[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days
@endgantt`,
  },
  {
    title: '45. With specific Weeknumbers (starting from n [including negative integer])',
    source: `@startgantt
printscale weekly with week numbering from 11
Project starts the 6th of July 2020
[Task1] on {Alice} requires 2 weeks
[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days
@endgantt`,
  },
  {
    title: '46. With specific Weeknumbers (starting from n [including negative integer])',
    source: `@startgantt
printscale weekly with week numbering from -3
Project starts the 6th of July 2020
[Task1] on {Alice} requires 2 weeks
[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days
@endgantt`,
  },
  {
    title: '47. With Calendar Date',
    source: `@startgantt
printscale weekly with calendar date
Project starts the 6th of July 2020
[Task1] on {Alice} requires 2 weeks
[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days
@endgantt`,
  },
  {
    title: '48. Change first day of week',
    source: `@startgantt
printscale weekly
weeks starts on Sunday and must have at least 4 days
friday are closed
saturday are closed
Project starts the 1st of january 2025
[Prototype design end] as [TASK1] requires 19 days
[Testing] requires 14 days
[TASK1]->[Testing]
@endgantt`,
  },
  {
    title: '49. Close day',
    source: `@startgantt
project starts the 2018/04/09
saturday are closed
sunday are closed
2018/05/01 is closed
2018/04/17 to 2018/04/19 is closed
[Prototype design] requires 14 days
[Test prototype] requires 4 days
[Test prototype] starts at [Prototype design]'s end
[Prototype design] is colored in Fuchsia/FireBrick
[Test prototype] is colored in GreenYellow/Green
@endgantt`,
  },
  {
    title: '50. Close day',
    source: `@startgantt
2020-07-07 to 2020-07-17 is closed
2020-07-13 is open
Project starts the 2020-07-01
[Prototype design] requires 10 days
Then [Test prototype] requires 10 days
@endgantt`,
  },
  {
    title: '51. Definition of a week depending of closed days',
    source: `@startgantt
Project starts 2021-03-29
[Review 01] happens at 2021-03-29
[Review 02 - 3 weeks] happens on 3 weeks after [Review 01]'s end
[Review 02 - 21 days] happens on 21 days after [Review 01]'s end
@endgantt`,
  },
  {
    title: '52. Definition of a week depending of closed days',
    source: `@startgantt
Project starts 2021-03-29
saturday are closed
sunday are closed
[Review 01] happens at 2021-03-29
[Review 02 - 3 weeks] happens on 3 weeks after [Review 01]'s end
[Review 02 - 21 days] happens on 21 days after [Review 01]'s end
@endgantt`,
  },
  {
    title: '53. Working days',
    source: `@startgantt
saturday are closed
sunday are closed
2022-07-04 to 2022-07-15 is closed
Project starts 2022-06-27
[task1] starts at 2022-06-27 and requires 1 week
[task2] starts 2 working days after [task1]'s end and requires 3 days
@endgantt`,
  },
  {
    title: '54. Simplified task succession',
    source: `@startgantt
[Prototype design] requires 14 days then [Test prototype] requires 4 days then [Deploy prototype] requires 6 days
@endgantt`,
  },
  {
    title: '55. Simplified task succession',
    source: `@startgantt
[Prototype design] requires 14 days
[Build prototype] requires 4 days
[Prepare test] requires 6 days
[Prototype design] -> [Build prototype]
[Prototype design] -> [Prepare test]
@endgantt`,
  },
  {
    title: '56. Working with resources',
    source: `@startgantt
[Task1] on {Alice} requires 10 days
[Task2] on {Bob:50%} requires 2 days then [Task3] on {Alice:25%} requires 1 days
@endgantt`,
  },
  {
    title: '57. Working with resources',
    source: `@startgantt
[Task1] on {Alice} {Bob} requires 20 days
@endgantt`,
  },
  {
    title: '58. Working with resources',
    source: `@startgantt
project starts on 2020-06-19
[Task1] on {Alice} requires 10 days
{Alice} is off on 2020-06-24 to 2020-06-26
@endgantt`,
  },
  {
    title: '59. Without any hiding (by default)',
    source: `@startgantt
[Task1] on {Alice} requires 10 days
[Task2] on {Bob:50%} requires 2 days then [Task3] on {Alice:25%} requires 1 days then [Task4] on {Alice:25%} {Bob} requires 1 days
@endgantt`,
  },
  {
    title: '60. Hide resources names',
    source: `@startgantt
hide resources names
[Task1] on {Alice} requires 10 days
[Task2] on {Bob:50%} requires 2 days then [Task3] on {Alice:25%} requires 1 days then [Task4] on {Alice:25%} {Bob} requires 1 days
@endgantt`,
  },
  {
    title: '61. Hide resources footbox',
    source: `@startgantt
hide resources footbox
[Task1] on {Alice} requires 10 days
[Task2] on {Bob:50%} requires 2 days then [Task3] on {Alice:25%} requires 1 days then [Task4] on {Alice:25%} {Bob} requires 1 days
@endgantt`,
  },
  {
    title: '62. Hide the both (resources names and resources footbox)',
    source: `@startgantt
hide resources names
hide resources footbox
[Task1] on {Alice} requires 10 days
[Task2] on {Bob:50%} requires 2 days then [Task3] on {Alice:25%} requires 1 days then [Task4] on {Alice:25%} {Bob} requires 1 days
@endgantt`,
  },
  {
    title: '63. Horizontal Separator',
    source: `@startgantt
[Task1] requires 10 days then [Task2] requires 4 days
-- Phase Two --
then [Task3] requires 5 days then [Task4] requires 6 days
@endgantt`,
  },
  {
    title: '64. Vertical Separator',
    source: `@startgantt
[task1] requires 1 week
[task2] starts 20 days after [task1]'s end and requires 3 days
Separator just at [task1]'s end
Separator just 2 days after [task1]'s end
Separator just at [task2]'s start
Separator just 2 days before [task2]'s start
@endgantt`,
  },
  {
    title: '65. Complex example',
    source: `@startgantt
[Prototype design] requires 13 days and is colored in Lavender/LightBlue
[Test prototype] requires 9 days and is colored in Coral/Green and starts 3 days after [Prototype design]'s end
[Write tests] requires 5 days and ends at [Prototype design]'s end
[Hire tests writers] requires 6 days and ends at [Write tests]'s start
[Init and write tests report] is colored in Coral/Green
[Init and write tests report] starts 1 day before [Test prototype]'s start and ends at [Test prototype]'s end
@endgantt`,
  },
  {
    title: '66. Comments',
    source: `@startgantt
' This is a comment
[T1] requires 3 days
/' this comment is on several lines
'/
[T2] starts at [T1]'s end and requires 1 day
@endgantt`,
  },
  {
    title: '67. Without style (by default)',
    source: `@startgantt
[Task1] requires 20 days
note bottom
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
[Task2] requires 4 days
[Task1] -> [Task2]
-- Separator title --
[M1] happens on 5 days after [Task1]'s end
-- end --
@endgantt`,
  },
  {
    title: '68. With style',
    source: `@startgantt
<style>
ganttDiagram {
task {
FontName Helvetica
FontColor red
FontSize 18
FontStyle bold
BackGroundColor GreenYellow
LineColor blue
}
milestone {
FontColor blue
FontSize 25
FontStyle italic
BackGroundColor yellow
LineColor red
}
note {
FontColor DarkGreen
FontSize 10
LineColor OrangeRed
}
arrow {
FontName Helvetica
FontColor red
FontSize 18
FontStyle bold
BackGroundColor GreenYellow
LineColor blue
}
separator {
LineColor red
BackGroundColor green
FontSize 16
FontStyle bold
FontColor purple
}
}
</style>
[Task1] requires 20 days
note bottom
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
[Task2] requires 4 days
[Task1] -> [Task2]
-- Separator title --
[M1] happens on 5 days after [Task1]'s end
-- end --
@endgantt`,
  },
  {
    title: '69. With style (full example)',
    source: `@startgantt
<style>
ganttDiagram {
task {
FontName Helvetica
FontColor red
FontSize 18
FontStyle bold
BackGroundColor GreenYellow
LineColor blue
}
milestone {
FontColor blue
FontSize 25
FontStyle italic
BackGroundColor yellow
LineColor red
}
note {
FontColor DarkGreen
FontSize 10
LineColor OrangeRed
}
arrow {
FontName Helvetica
FontColor red
FontSize 18
FontStyle bold
BackGroundColor GreenYellow
LineColor blue
LineStyle 8.0;13.0
LineThickness 3.0
}
separator {
BackgroundColor lightGreen
LineStyle 8.0;3.0
LineColor red
LineThickness 1.0
FontSize 16
FontStyle bold
FontColor purple
Margin 5
Padding 20
}
timeline {
BackgroundColor Bisque
}
closed {
BackgroundColor pink
FontColor red
}
}
</style>
Project starts the 2020-12-01
[Task1] requires 10 days
sunday are closed
note bottom
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
[Task2] requires 20 days
[Task2] starts 10 days after [Task1]'s end
-- Separator title --
[M1] happens on 5 days after [Task1]'s end
<style>
separator {
LineColor black
Margin 0
Padding 0
}
</style>
-- end --
@endgantt`,
  },
  {
    title: '70. Clean style',
    source: `@startgantt
<style>
ganttDiagram {
timeline {
LineColor transparent
FontColor transparent
}
}
</style>
hide footbox
[Test prototype] requires 7 days
[Prototype completed] happens at [Test prototype]'s end
[Setup assembly line] requires 9 days
[Setup assembly line] starts at [Test prototype]'s end
then [Setup] requires 5 days
[T2] requires 2 days and starts at [Test prototype]'s end
then [T3] requires 3 days
-- end task --
then [T4] requires 2 days
@endgantt`,
  },
  {
    title: '71. Clean style',
    source: `@startgantt
<style>
ganttDiagram {
timeline {
LineColor transparent
FontColor transparent
}
closed {
FontColor transparent
}
}
</style>
hide footbox
project starts the 2018/04/09
saturday are closed
sunday are closed
2018/05/01 is closed
2018/04/17 to 2018/04/19 is closed
[Prototype design] requires 9 days
[Test prototype] requires 5 days
[Test prototype] starts at [Prototype design]'s end
[Prototype design] is colored in Fuchsia/FireBrick
[Test prototype] is colored in GreenYellow/Green
@endgantt`,
  },
  {
    title: '72. Add notes',
    source: `@startgantt
[task01] requires 15 days
note bottom
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
[task01] -> [task02]
@endgantt`,
  },
  {
    title: '73. Add notes',
    source: `@startgantt
[task01] requires 15 days
note bottom
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
[task01] -> [task02]
[task03] requires 5 days
@endgantt`,
  },
  {
    title: '74. Add notes',
    source: `@startgantt
-- test01 --
[task01] requires 4 days
note bottom
'note left
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
[task02] requires 8 days
[task01] -> [task02]
note bottom
'note left
memo1 ...
memo2 ...
explanations1 ...
explanations2 ...
end note
-- test02 --
[task03] as [t3] requires 7 days
[t3] -> [t4]
@endgantt`,
  },
  {
    title: '75. Add notes',
    source: `@startgantt
Project starts 2020-09-01
[taskA] starts 2020-09-01 and requires 3 days
[taskB] starts 2020-09-10 and requires 3 days
[taskB] displays on same row as [taskA]
[task01] starts 2020-09-05 and requires 4 days
then [task02] requires 8 days
note bottom
note for task02
more notes
end note
then [task03] requires 7 days
note bottom
note for task03
more notes
end note
-- separator --
[taskC] starts 2020-09-02 and requires 5 days
[taskD] starts 2020-09-09 and requires 5 days
[taskD] displays on same row as [taskC]
[task 10] starts 2020-09-05 and requires 5 days
then [task 11] requires 5 days
note bottom
note for task11
more notes
end note
@endgantt`,
  },
  {
    title: '76. Pause tasks',
    source: `@startgantt
Project starts the 5th of december 2018
saturday are closed
sunday are closed
2018/12/29 is opened
[Prototype design] requires 17 days
[Prototype design] pauses on 2018/12/13
[Prototype design] pauses on 2018/12/14
[Prototype design] pauses on monday
[Test prototype] starts at [Prototype design]'s end and requires 2 weeks
@endgantt`,
  },
  {
    title: '77. Change link colors',
    source: `@startgantt
[T1] requires 4 days
[T2] requires 4 days and starts 3 days after [T1]'s end with blue dotted link
[T3] requires 4 days and starts 3 days after [T2]'s end with green bold link
[T4] requires 4 days and starts 3 days after [T3]'s end with green dashed link
@endgantt`,
  },
  {
    title: '78. Change link colors',
    source: `@startgantt
<style>
ganttDiagram {
arrow {
LineColor blue
}
}
</style>
[Prototype design] requires 7 days
[Build prototype] requires 4 days
[Prepare test] requires 6 days
[Prototype design] -[#FF00FF]-> [Build prototype]
[Prototype design] -[dotted]-> [Prepare test]
Then [Run test] requires 4 days
@endgantt`,
  },
  {
    title: '79. Tasks or Milestones on the same line',
    source: `@startgantt
[Prototype design] requires 13 days
[Test prototype] requires 4 days and 1 week
[Test prototype] starts 1 week and 2 days after [Prototype design]'s end
[Test prototype] displays on same row as [Prototype design]
[r1] happens on 5 days after [Prototype design]'s end
[r2] happens on 5 days after [r1]'s end
[r3] happens on 5 days after [r2]'s end
[r2] displays on same row as [r1]
[r3] displays on same row as [r1]
@endgantt`,
  },
  {
    title: '80. Highlight today',
    source: `@startgantt
Project starts the 20th of september 2018
sunday are close
2018/09/21 to 2018/09/23 are colored in salmon
2018/09/21 to 2018/09/30 are named [Vacation in the Bahamas]
today is 30 days after start and is colored in #AAF
[Foo] happens 40 days after start
[Dummy] requires 10 days and starts 10 days after start
@endgantt`,
  },
  {
    title: '81. Task between two milestones',
    source: `@startgantt
project starts on 2020-07-01
[P_start] happens 2020-07-03
[P_end] happens 2020-07-13
[Prototype design] occurs from [P_start] to [P_end]
@endgantt`,
  },
  {
    title: '82. Add title, header, footer, caption or legend',
    source: `@startgantt
header some header
footer some footer
title My title
[Prototype design] requires 13 days
legend
The legend
end legend
caption This is caption
@endgantt`,
  },
  {
    title: '83. Add color on legend',
    source: `@startgantt
[Kick off] requires 1 days and is colored in blue
then [Prototype design] requires 5 days
[Test prototype] requires 4 days
[Test prototype] starts at [Prototype design]'s end
[Prototype design] is colored in Green
[Test prototype] is colored in gray
legend
Legend:
|= Color |= Task Type |
|<#gray> | Planned |
|<#Green>| In progress |
|<#blue> | Done |
end legend
@endgantt`,
  },
  {
    title: '84. Removing Foot Boxes (daily scale (without project start))',
    source: `@startgantt
hide footbox
title Foot Box removed
[Prototype design] requires 15 days
[Test prototype] requires 10 days
@endgantt`,
  },
  {
    title: '85. Removing Foot Boxes (daily scale)',
    source: `@startgantt
Project starts the 20th of september 2017
[Prototype design] as [TASK1] requires 13 days
[TASK1] is colored in Lavender/LightBlue
hide footbox
@endgantt`,
  },
  {
    title: '86. Removing Foot Boxes (weekly scale)',
    source: `@startgantt
hide footbox
printscale weekly
saturday are closed
sunday are closed
Project starts the 1st of january 2021
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '87. Removing Foot Boxes (monthly scale)',
    source: `@startgantt
hide footbox
projectscale monthly
Project starts the 20th of september 2020
[Prototype design] as [TASK1] requires 130 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 20 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are named [End's committee]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '88. Removing Foot Boxes (quarterly scale)',
    source: `@startgantt
hide footbox
projectscale quarterly
Project starts the 1st of october 2020
[Prototype design] as [TASK1] requires 700 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 200 days
[TASK1]->[Testing]
2021-01-18 to 2021-03-22 are colored in salmon
@endgantt`,
  },
  {
    title: '89. Removing Foot Boxes (yearly scale)',
    source: `@startgantt
hide footbox
projectscale yearly
Project starts the 1st of october 2020
[Prototype design] as [TASK1] requires 700 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 200 days
[TASK1]->[Testing]
2021-01-18 to 2021-03-22 are colored in salmon
@endgantt`,
  },
  {
    title: '90. English (en, by default)',
    source: `@startgantt
saturday are closed
sunday are closed
Project starts 2021-01-01
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '91. Deutsch (de)',
    source: `@startgantt
language de
saturday are closed
sunday are closed
Project starts 2021-01-01
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '92. Japanese (ja)',
    source: `@startgantt
language ja
saturday are closed
sunday are closed
Project starts 2021-01-01
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '93. Chinese (zh)',
    source: `@startgantt
language zh
saturday are closed
sunday are closed
Project starts 2021-01-01
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '94. Korean (ko)',
    source: `@startgantt
language ko
saturday are closed
sunday are closed
Project starts 2021-01-01
[Prototype design end] as [TASK1] requires 19 days
[TASK1] is colored in Lavender/LightBlue
[Testing] requires 14 days
[TASK1]->[Testing]
2021-01-18 to 2021-01-22 are colored in salmon
@endgantt`,
  },
  {
    title: '95. Delete Tasks or Milestones',
    source: `@startgantt
[Prototype design] requires 1 weeks
then [Prototype completed] requires 4 days
[End Prototype completed] happens at [Prototype completed]'s end
then [Test prototype] requires 5 days
[End Test prototype] happens at [Test prototype]'s end
[Prototype completed] is deleted
[End Prototype completed] is deleted
@endgantt`,
  },
  {
    title: '96. Start a project, a task or a milestone a number of days before or after today',
    source: `@startgantt
title Today is %date("YYYY-MM-dd")
!$now = %now()
!$past = %date("YYYY-MM-dd", $now - 14*24*3600)
Project starts $past
today is colored in pink
[foo] requires 10 days
[bar] requires 5 days and starts %date("YYYY-MM-dd", $now + 4*24*3600)
[Tomorrow] happens %date("YYYY-MM-dd", $now + 1*24*3600)
@endgantt`,
  },
  {
    title: '97. The labels are near elements (by default)',
    source: `@startgantt
[Task1] requires 1 days
then [Task2_long_long_long] as [T2] requires 2 days
-- Phase Two --
then [Task3] as [T3] requires 2 days
[Task4] as [T4] requires 1 day
[Task5] as [T5] requires 2 days
[T2] -> [T4]
[T2] -> [T5]
[Task6_long_long_long] as [T6] requires 4 days
[T3] -> [T6]
[T5] -> [T6]
[End] happens 1 day after [T6]'s end
@endgantt`,
  },
  {
    title: '98. Label on first column and left aligned',
    source: `@startgantt
Label on first column and left aligned
[Task1] requires 1 days
then [Task2_long_long_long] as [T2] requires 2 days
-- Phase Two --
then [Task3] as [T3] requires 2 days
[Task4] as [T4] requires 1 day
[Task5] as [T5] requires 2 days
[T2] -> [T4]
[T2] -> [T5]
[Task6_long_long_long] as [T6] requires 4 days
[T3] -> [T6]
[T5] -> [T6]
[End] happens 1 day after [T6]'s end
@endgantt`,
  },
  {
    title: '99. Label on first column and right aligned',
    source: `@startgantt
Label on first column and right aligned
[Task1] requires 1 days
then [Task2_long_long_long] as [T2] requires 2 days
-- Phase Two --
then [Task3] as [T3] requires 2 days
[Task4] as [T4] requires 1 day
[Task5] as [T5] requires 2 days
[T2] -> [T4]
[T2] -> [T5]
[Task6_long_long_long] as [T6] requires 4 days
[T3] -> [T6]
[T5] -> [T6]
[End] happens 1 day after [T6]'s end
@endgantt`,
  },
  {
    title: '100. Label on last column and left aligned',
    source: `@startgantt
Label on last column and left aligned
[Task1] requires 1 days
then [Task2_long_long_long] as [T2] requires 2 days
-- Phase Two --
then [Task3] as [T3] requires 2 days
[Task4] as [T4] requires 1 day
[Task5] as [T5] requires 2 days
[T2] -> [T4]
[T2] -> [T5]
[Task6_long_long_long] as [T6] requires 4 days
[T3] -> [T6]
[T5] -> [T6]
[End] happens 1 day after [T6]'s end
@endgantt`,
  },
  {
    title: '101. Label on last column and right aligned',
    source: `@startgantt
Label on last column and right aligned
[Task1] requires 1 days
then [Task2_long_long_long] as [T2] requires 2 days
-- Phase Two --
then [Task3] as [T3] requires 2 days
[Task4] as [T4] requires 1 day
[Task5] as [T5] requires 2 days
[T2] -> [T4]
[T2] -> [T5]
[Task6_long_long_long] as [T6] requires 4 days
[T3] -> [T6]
[T5] -> [T6]
[End] happens 1 day after [T6]'s end
@endgantt`,
  },
  {
    title: '102. Definition of a month (30 days)',
    source: `@startgantt
[A] lasts 2 days
[B] lasts 2 weeks
[C] lasts 1 month
@endgantt`,
  },
];
