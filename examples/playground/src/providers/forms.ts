import type { CommandNode, CommandResult } from "@command-kernel/core";
import { type Form, searchForms } from "./data";

const toast = (message: string): Promise<CommandResult> =>
  Promise.resolve({ kind: "toast", message });

function formActions(f: Form): CommandNode[] {
  const actions: CommandNode[] = [
    {
      id: `forms.${f.slug}.open`,
      title: "Open in editor",
      category: f.title,
      icon: "PenLine",
      run: async () => ({
        kind: "navigate",
        message: `Editing ${f.slug}`,
        payload: { module: "forms", recordId: f.slug },
      }),
    },
    {
      id: `forms.${f.slug}.duplicate`,
      title: "Duplicate form",
      category: f.title,
      icon: "CopyPlus",
      run: async () => toast(`Duplicated ${f.slug}`),
    },
  ];
  if (f.draft) {
    actions.splice(1, 0, {
      id: `forms.${f.slug}.publish`,
      title: "Re-publish draft",
      category: f.title,
      icon: "Rocket",
      gate: {
        roles: ["admin"],
        confirm: true,
        reason: "promotes the draft subtree to live + re-bakes",
      },
      run: async () => toast(`Published ${f.slug} → live`),
    });
  }
  return actions;
}

function formEntity(f: Form): CommandNode {
  return {
    id: `forms.entity.${f.slug}`,
    title: f.title,
    subtitle: `${f.slug}${f.draft ? " · draft" : ""}`,
    icon: f.draft ? "FileEdit" : "FileText",
    keywords: [f.slug, f.module, f.draft ? "draft" : "live"],
    resolve: async () => formActions(f),
  };
}

const formsSearch: CommandNode = {
  id: "forms.search",
  title: "Search forms",
  summary:
    "Find forms by title or slug. Enumerating runs a backend search, so pass the positional `q` first — don't list it blank.",
  category: "Forms",
  icon: "Search",
  weight: 60,
  args: [
    {
      id: "q",
      label: "query",
      kind: "string",
      positional: true,
      placeholder: "title or slug…",
    },
  ],
  resolve: async (a) => (await searchForms(a.q ?? "")).map(formEntity),
  run: async (a) => ({ kind: "page", message: `Results page · forms matching “${a.q ?? ""}”` }),
};

export const formsCategory: CommandNode = {
  id: "forms",
  title: "Forms",
  subtitle: "edit · publish · duplicate",
  summary:
    "Form definitions (the YAML the portal renders). Drill in to search forms by title or slug, then open in the editor, duplicate, or re-publish a draft (admin).",
  icon: "FileText",
  weight: 68,
  resolve: async () => [formsSearch],
};
