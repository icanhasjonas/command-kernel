import { argList, argText, isFilled } from "@command-kernel/core";
import type { RefObject } from "react";
import { cn } from "./cn.js";
import { Icon } from "./icon.js";
import type { PaletteLabels } from "./labels.js";
import { PILL_LOOK, PILL_SHAPE, Pill } from "./Pill.js";
import type { ArgSession } from "./palette-types.js";

/**
 * Args mode's top line: the command, then a pill per arg. The arg being filled is the one
 * accent on screen, and its pill IS the input.
 */
export function ArgBar({
  arg,
  query,
  inputRef,
  labels,
  onQuery,
}: {
  arg: ArgSession;
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  labels: PaletteLabels;
  onQuery: (q: string) => void;
}) {
  // named args get a pill each; a positional arg only appears when it IS the one
  // being collected (otherwise the query line is its input)
  const named = (arg.node.args ?? []).filter((a) => !a.positional || a.id === arg.activeArg);
  const filled = named.filter((a) => isFilled(arg.values[a.id])).length;

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <span className="flex items-center gap-2 text-[14px] font-medium text-ck-fg">
        <Icon
          name={arg.node.icon}
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="text-ck-fg-muted"
        />
        {arg.node.title}
      </span>
      {named.map((spec) => {
        const val = arg.values[spec.id];
        if (spec.id !== arg.activeArg) {
          return (
            <Pill
              key={spec.id}
              label={spec.label}
              value={argText(val)}
              state={isFilled(val) ? "filled" : "empty"}
              requiredLabel={labels.required}
              optionalLabel={labels.optional}
              {...(spec.required !== undefined && { required: spec.required })}
            />
          );
        }
        // accumulated values for a multiple (listOf) arg
        const chips = spec.multiple ? argList(val) : [];
        return (
          <span key={spec.id} className={cn(PILL_SHAPE, PILL_LOOK.active, "max-w-none pr-1")}>
            <span>{spec.label}</span>
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-pill bg-ck-surface px-1.5 py-0.5 text-[11px] text-ck-fg"
              >
                {c}
              </span>
            ))}
            <input
              ref={inputRef}
              aria-label={spec.label}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={
                spec.multiple ? labels.addMore : (spec.placeholder ?? labels.argPlaceholder)
              }
              className="w-44 bg-transparent font-normal text-ck-fg outline-none placeholder:text-ck-fg-muted"
            />
          </span>
        );
      })}
      <span className="ml-auto text-[12px] text-ck-fg-muted tabular-nums">
        {labels.argCounter(filled, named.length)}
      </span>
      {arg.error && (
        <p role="alert" className="basis-full text-[12px] text-ck-danger">
          {arg.error}
        </p>
      )}
    </div>
  );
}
