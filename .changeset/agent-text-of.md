---
"@command-kernel/agent": minor
---

`pickTool` fills a text arg with what the goal says, not the whole request:
"encrypt the launch date for ada@x.y" seals "the launch date". The words that picked
the tool, the address and the submission id are cut out; a goal that says nothing
more leaves the arg empty, so it is asked for. `textOf(goal, node, also?)` is exported
for a caller that resolves more words itself (a name it turned into a person arg).

A closed-list arg gets the option the goal names ("email a reminder" picks Reminder),
and nothing when it names none: it no longer fills a `subject` with the first option.
