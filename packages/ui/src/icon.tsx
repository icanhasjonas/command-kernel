import { Circle, type LucideIcon, type LucideProps } from "lucide-react";

/**
 * Icons by name, for the names commands carry as data (`node.icon`, an option's
 * `icon`). Only REGISTERED icons resolve: importing every lucide icon to look names
 * up would put the whole set (~700 kB) in every app that renders a palette. An app
 * registers the icons its commands name, once, at startup:
 *
 *   import { Mail, Users } from "lucide-react";
 *   registerIcons({ Mail, Users });
 *
 * An unregistered name draws a plain circle, and `iconFor` answers undefined for it,
 * so a test can assert that every name a command tree uses is registered.
 */
const registry: Record<string, LucideIcon> = {};

export function registerIcons(icons: Record<string, LucideIcon>): void {
  Object.assign(registry, icons);
}

/** The registered icon for `name`, or undefined (an `Icon` then draws a circle). */
export function iconFor(name: string): LucideIcon | undefined {
  return Object.hasOwn(registry, name) ? registry[name] : undefined;
}

export function Icon({ name, ...props }: { name?: string | undefined } & LucideProps) {
  const Cmp = (name && iconFor(name)) || Circle;
  return <Cmp {...props} />;
}
