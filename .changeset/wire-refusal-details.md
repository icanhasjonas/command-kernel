---
"@command-kernel/wire": minor
---

`refusalDetails`: a host gives `details` to the wire's own refusals of a declared command
(bad args, the gate's verdict, an unreadable or oversized body or frame, a wrong method, a
confirm it does not take), on both transports. Never asked about an undeclared name or about
anything the host's own code threw. An oversized socket frame's refusal now knows its
command's `name` too, read from the frame as its `id` already was.
