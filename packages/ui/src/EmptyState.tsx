import type { ReactNode } from "react";

/** Arc's quiet empty state: a muted glyph over one line, centred in the list's place. */
export function EmptyState({ icon, text }: { icon: ReactNode; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 pt-7 pb-8 text-center">
      <span aria-hidden="true" className="grid size-8 place-items-center text-ck-fg-muted">
        {icon}
      </span>
      {text && <span className="text-[14px] font-medium text-ck-fg-secondary">{text}</span>}
    </div>
  );
}
