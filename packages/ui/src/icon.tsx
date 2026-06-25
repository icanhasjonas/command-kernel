import type { LucideIcon, LucideProps } from "lucide-react";
import * as Lucide from "lucide-react";

// Dynamic icon lookup by name. The cast is the one justified place: lucide
// ships a flat module of components and we resolve them from authored strings.
const registry = Lucide as unknown as Record<string, LucideIcon | undefined>;

export function Icon({ name, ...props }: { name?: string } & LucideProps) {
  const Cmp = (name && registry[name]) || Lucide.Circle;
  return <Cmp {...props} />;
}
