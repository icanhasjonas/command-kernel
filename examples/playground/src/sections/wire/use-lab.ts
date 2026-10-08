import type { Grant } from "@command-kernel/core";
import type { ConnectionStatus, WireClient, WireSpec } from "@command-kernel/wire";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDemo } from "../../demo/demo-context";
import { createLabClient, visitorId } from "../../wire/client";
import {
  type Flag,
  flipFlag,
  isLabRole,
  type KeyName,
  type LabChange,
  type LabStatus,
  labChanged,
  labStatus,
  presence,
  rotateKey,
} from "../../wire/spec";
import { type Attempt, tamper } from "../lab-ui";
import { labCall, refusal, type Via } from "./call";

export interface FeedItem extends LabChange {
  at: number;
  mine: boolean;
}

/**
 * The page's side of the lab: one wire client per role (the role rides the socket URL,
 * so a new role is a new connection), the server's state as it last told us, what every
 * visitor did, and the rotate-a-key flow with its server-minted grant.
 */
export function useLab() {
  const { ctx } = useDemo();
  const role = isLabRole(ctx.user.role) ? ctx.user.role : "viewer";
  const client = useRef<WireClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [server, setServer] = useState<LabStatus | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [via, setVia] = useState<Via>("auto");
  const [key, setKey] = useState<KeyName>("signing");
  const [owed, setOwed] = useState(false);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [used, setUsed] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const log = useCallback((a: Attempt) => setAttempts((xs) => [a, ...xs].slice(0, 6)), []);

  const refresh = useCallback(
    async (c = client.current) => {
      if (!c) return;
      const r = await labCall(
        c,
        labStatus,
        {},
        { via, label: "Read the status", log, quiet: true },
      );
      if (r.ok) {
        setServer(r.data);
        setOnline(r.data.online);
      }
    },
    [via, log],
  );
  // the connection outlives a change of transport: it reads the latest refresh, not its own
  const refreshNow = useRef(refresh);
  refreshNow.current = refresh;

  useEffect(() => {
    const c = createLabClient(role);
    client.current = c;
    const offs = [
      c.onStatus((s) => {
        setStatus(s);
        if (s === "open") void refreshNow.current(c);
      }),
      c.on(labChanged, (d) => {
        // a change this tab made comes back as an event too: the server's tag says whose
        const mine = d.by.tag === visitorId().slice(0, 6);
        setFeed((xs) => [{ ...d, at: Date.now(), mine }, ...xs].slice(0, 8));
        setServer((s) => s && { ...s, flags: d.flags, keys: d.keys });
      }),
      c.on(presence, ({ online }) => setOnline(online)),
    ];
    c.connect();
    return () => {
      for (const off of offs) off();
      c.close();
      client.current = null;
    };
  }, [role]);

  const call = <A extends object, O>(
    spec: WireSpec<A, O>,
    args: A,
    label: string,
    done: (out: O) => string,
    evidence?: Grant,
  ) => {
    const c = client.current;
    if (!c) return Promise.resolve(null);
    return labCall(c, spec, args, { via, label, log, done, ...(evidence && { evidence }) });
  };

  const other: KeyName = key === "signing" ? "public" : "signing";
  const rotated = (o: { key: KeyName; fingerprint: string }) => `${o.key} is now ${o.fingerprint}`;
  /** run the rotation with this evidence; a success means the grant is now spent */
  const rotate = async (args: { key: KeyName }, label: string, evidence: Grant) => {
    const r = await call(rotateKey, args, label, rotated, evidence);
    if (r?.ok) setUsed(true);
  };

  return {
    role,
    status,
    server,
    online,
    feed,
    via,
    setVia,
    key,
    owed,
    grant,
    used,
    attempts,
    cut: () => client.current?.close(),
    reconnect: () => client.current?.connect(),
    flip: (flag: Flag) => call(flipFlag, { flag }, `Flip ${flag}`, (o) => (o.on ? "on" : "off")),
    chooseKey(k: KeyName) {
      setKey(k);
      setOwed(false);
      setGrant(null);
      setUsed(false);
    },
    async ask() {
      setGrant(null);
      setUsed(false);
      const r = await call(rotateKey, { key }, "Ask, no evidence", rotated);
      setOwed(r?.ok === false && r.error.code === "confirmRequired");
    },
    async confirm() {
      const c = client.current;
      if (!c) return;
      try {
        const g = await c.confirm(rotateKey, { key }, via === "http" ? { via: "http" } : {});
        setGrant(g);
        log({
          label: "Confirm",
          answer: "granted",
          detail: "the server checked you and minted a grant",
        });
      } catch (e) {
        log({ label: "Confirm", ...refusal(e) });
      }
    },
    run: () => grant && rotate({ key }, "Run with the grant", grant),
    replay: () => grant && rotate({ key }, "Use the same grant again", grant),
    otherKey: () => grant && rotate({ key: other }, `Use it for the ${other} key`, grant),
    forge: () =>
      grant && rotate({ key }, "One hex digit changed", { ...grant, sig: tamper(grant.sig) }),
  };
}
