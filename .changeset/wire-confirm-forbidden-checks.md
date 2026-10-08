---
"@command-kernel/wire": patch
---

A confirm the gate refuses (`forbidden`) now carries the gate's `checks`, exactly as the
same call refused by the gate does, so a client can say what is missing ("needs the admin
role"). It answered with no checks before. It stays a refusal of the host's command, so
`refusalDetails` still applies.
