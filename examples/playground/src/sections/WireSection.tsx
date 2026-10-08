import { AttemptLog } from "./lab-ui";
import { Code, Panel, Section } from "./Section";
import { ConnectionBar } from "./wire/ConnectionBar";
import { FlagsPanel } from "./wire/FlagsPanel";
import { FrameLog } from "./wire/FrameLog";
import { LiveFeed } from "./wire/LiveFeed";
import { RotatePanel } from "./wire/RotatePanel";
import { useLab } from "./wire/use-lab";

/** Chapter: the same kernel model on a server, reached over the wire, shared by every visitor. */
export function WireSection() {
  const lab = useLab();
  return (
    <Section
      id="wire"
      title="Over the wire, to a server"
      lede={
        <>
          Everything above runs in your browser. This is a second kernel on a Cloudflare Durable
          Object, called through <Code>@command-kernel/wire</Code> over a WebSocket, or plain HTTP
          when the socket is down. Same declarations, same gate, but the <em>server</em> decides
          now, and every visitor shares it. Your role comes from the switcher up top; a real host
          would take it from your sign-in.
        </>
      }
    >
      <Panel>
        <ConnectionBar
          status={lab.status}
          server={lab.server}
          online={lab.online}
          role={lab.role}
          via={lab.via}
          setVia={lab.setVia}
          cut={lab.cut}
          reconnect={lab.reconnect}
        />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-6 border-white/8 p-5 lg:border-r">
            <FlagsPanel server={lab.server} flip={(f) => void lab.flip(f)} />
            <div className="border-white/8 border-t pt-5">
              <RotatePanel lab={lab} server={lab.server} />
            </div>
            {lab.attempts.length > 0 && (
              <div className="border-white/8 border-t pt-4">
                <AttemptLog attempts={lab.attempts} />
              </div>
            )}
          </div>
          <div className="border-white/8 border-t p-5 lg:border-t-0">
            <FrameLog />
          </div>
        </div>
        <LiveFeed feed={lab.feed} />
      </Panel>
    </Section>
  );
}
