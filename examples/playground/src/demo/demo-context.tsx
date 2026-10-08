import type { CommandResult, Ctx, Role } from "@command-kernel/core";
import { bumpFrecency } from "@command-kernel/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export interface Place {
  module: string;
  label: string;
  recordId?: string;
}

export interface Toast {
  id: number;
  msg: string;
  tone: "ok" | "nav" | "warn";
}

interface Demo {
  ctx: Ctx;
  /** the latest ctx, for drivers that read it at event time (deeplinks, invokers) */
  getCtx: () => Ctx;
  setRole: (role: Role) => void;
  setPlace: (place: Place) => void;
  ran: (id: string) => void;
  showResult: (r: CommandResult) => void;
  toast: Toast | null;
  say: (msg: string, tone?: Toast["tone"]) => void;
  /** `via` names the driver the trace credits: a chord, or the palette itself */
  palette: {
    open: boolean;
    trigger: { id: string; nonce: number } | null;
    via: "palette" | "chord";
  };
  openPalette: (commandId?: string, via?: "palette" | "chord") => void;
  closePalette: () => void;
}

const DemoContext = createContext<Demo | null>(null);

export function useDemo(): Demo {
  const d = useContext(DemoContext);
  if (!d) throw new Error("useDemo outside <DemoProvider>");
  return d;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx>({
    location: { module: "home", label: "Home" },
    user: { id: "u_1001", name: "Jonas Frost", role: "admin", brand: "circle" },
    now: 0,
    frecency: {},
  });
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);
  const [palette, setPalette] = useState<Demo["palette"]>({
    open: false,
    trigger: null,
    via: "palette",
  });
  const nonce = useRef(0);

  const say = useCallback((msg: string, tone: Toast["tone"] = "ok") => {
    setToast({ id: ++toastSeq.current, msg, tone });
  }, []);

  const setPlace = useCallback((place: Place) => {
    setCtx((c) => ({
      ...c,
      location: {
        module: place.module,
        label: place.label,
        ...(place.recordId !== undefined && { recordId: place.recordId }),
      },
    }));
  }, []);

  // a navigation result moves "where you are", which re-ranks the palette
  const showResult = useCallback(
    (r: CommandResult) => {
      if (r.kind === "navigate" && r.payload && typeof r.payload === "object") {
        const pl = r.payload as Partial<Place>; // the demo's nav commands write exactly a Place
        if (pl.module) setPlace({ module: pl.module, label: pl.label ?? pl.module });
      }
      say(r.message, r.kind === "navigate" || r.kind === "page" ? "nav" : "ok");
    },
    [say, setPlace],
  );

  // stable identities: the keyboard and hash drivers subscribe once, not per render
  const getCtx = useCallback(() => ctxRef.current, []);
  const ran = useCallback(
    (id: string) => setCtx((c) => ({ ...c, frecency: bumpFrecency(c.frecency, id) })),
    [],
  );
  const openPalette = useCallback((commandId?: string, via: "palette" | "chord" = "palette") => {
    setPalette({
      open: true,
      trigger: commandId ? { id: commandId, nonce: ++nonce.current } : null,
      via,
    });
  }, []);
  const closePalette = useCallback(() => setPalette((p) => ({ ...p, open: false })), []);

  const value = useMemo<Demo>(
    () => ({
      ctx,
      getCtx,
      setRole: (role) => setCtx((c) => ({ ...c, user: { ...c.user, role } })),
      setPlace,
      ran,
      showResult,
      toast,
      say,
      palette,
      openPalette,
      closePalette,
    }),
    [ctx, getCtx, setPlace, ran, showResult, toast, say, palette, openPalette, closePalette],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
