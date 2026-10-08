/**
 * A failed gate check, said as what the caller lacks: "role: admin" -> "needs the admin
 * role". One phrasing for the trace rail, the agent's card and the wire log.
 */
export function needs(label: string): string {
  const role = label.match(/^role:\s*(.+)$/)?.[1];
  return role ? `needs the ${role} role` : label;
}
