import type { Grant } from "@command-kernel/core";
import type { ConnectionStatus, WireClient, WireSpec } from "@command-kernel/wire";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDemo } from "../../demo/demo-context";
import { createLabClient, visitorId } from "../../wire/client";
import { labFlags } from "../../wire/flags";
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
  /** our own change, made while the socket was down: no push carried it */
  viaHttp?: boolean;
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
  const cutByUser = useRef(false);
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

  // the flags the server last told us, for chrome outside this section (the header's banner)
  useEffect(() => {
    if (server) labFlags.set(server.flags);
  }, [server]);

  // short logs: the newest few say what happened; the frames and the trace keep the rest
  const log = useCallback((a: Attempt) => setAttempts((xs) => [a, ...xs].slice(0, 4)), []);

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
        // a count is only live while the socket is: presence events keep it true
        if (c.status === "open") setOnline(r.data.online);
      }
    },
    [via, log],
  );
  // off the socket nothing is pushed: re-read the shared state over HTTP so the flags
  // another visitor flips still show up here, a few seconds late instead of never
  useEffect(() => {
    const c = client.current;
    if (!(status === "closed" || (status === "idle" && cutByUser.current)) || !c) return;
    const read = async () => {
      const r = await labCall(c, labStatus, {}, { via: "http", label: "status", log, quiet: true });
      if (r.ok) setServer(r.data);
    };
    const t = setInterval(read, 5000);
    void read();
    return () => clearInterval(t);
  }, [status, log]);

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
        // a tab off the socket hears no presence: it shows no count rather than a stale one
        else setOnline(null);
      }),
      c.on(labChanged, (d) => {
        // a change this tab made comes back as an event too: the server's tag says whose
        const mine = d.by.tag === visitorId().slice(0, 6);
        setFeed((xs) => [{ ...d, at: Date.now(), mine }, ...xs].slice(0, 4));
        setServer((s) => s && { ...s, flags: d.flags, keys: d.keys });
      }),
      c.on(presence, ({ online }) => setOnline(online)),
    ];
    // a socket the person cut stays cut across a role change, until they reconnect it
    if (!cutByUser.current) c.connect();
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
    grantWhy?: string,
  ) => {
    const c = client.current;
    if (!c) return Promise.resolve(null);
    return labCall(c, spec, args, {
      via,
      label,
      log,
      done,
      ...(evidence && { evidence }),
      ...(grantWhy && { grantWhy }),
    });
  };

  /**
   * A change of ours that went over HTTP: the server pushed it to every OTHER socket,
   * but this tab has none open to hear it, so the feed records it here.
   */
  const heardOwn = (command: string, what: string, next: LabStatus | null) => {
    if (client.current?.status === "open" || !next) return;
    const item: FeedItem = {
      command,
      what,
      by: { role, tag: visitorId().slice(0, 6) },
      flags: next.flags,
      keys: next.keys,
      at: Date.now(),
      mine: true,
      viaHttp: true,
    };
    setFeed((xs) => [item, ...xs].slice(0, 4));
  };

  const other: KeyName = key === "signing" ? "public" : "signing";
  const rotated = (o: { key: KeyName; fingerprint: string }) => `${o.key} is now ${o.fingerprint}`;
  /** run the rotation with this evidence; a success means the grant is now spent */
  const rotate = async (
    args: { key: KeyName },
    label: string,
    evidence: Grant,
    grantWhy?: string,
  ) => {
    const r = await call(rotateKey, args, label, rotated, evidence, grantWhy);
    if (!r?.ok) return;
    setUsed(true);
    // the answer itself is the new state: over HTTP no event follows to say so
    const { key: k, fingerprint } = r.data;
    const next = server && { ...server, keys: { ...server.keys, [k]: fingerprint } };
    setServer(next);
    heardOwn(rotateKey.node.id, k, next);
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
    cut: () => {
      cutByUser.current = true;
      client.current?.close();
    },
    reconnect: () => {
      cutByUser.current = false;
      client.current?.connect();
    },
    async flip(flag: Flag) {
      const r = await call(flipFlag, { flag }, `Flip ${flag}`, (o) => (o.on ? "on" : "off"));
      if (!r?.ok) return;
      // the answer itself is the new state: over HTTP no event follows to say so
      const next = server && { ...server, flags: { ...server.flags, [r.data.flag]: r.data.on } };
      setServer(next);
      heardOwn(flipFlag.node.id, `${r.data.flag} ${r.data.on ? "on" : "off"}`, next);
    },
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
        // a fresh grant is unused: Run and the break-its are live again
        setGrant(g);
        setUsed(false);
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
    replay: () =>
      grant && rotate({ key }, "Use the same grant again", grant, "it was already used once"),
    otherKey: () =>
      grant &&
      rotate(
        { key: other },
        `Use it for the ${other} key`,
        grant,
        `it was signed for the ${key} key, not ${other}`,
      ),
    forge: () =>
      grant &&
      rotate(
        { key },
        "One hex digit changed",
        { ...grant, sig: tamper(grant.sig) },
        "the signature no longer matches",
      ),
  };
}
