import { COLO_HEADER } from "./lab-do";

export { LabDO } from "./lab-do";

/**
 * The demo's Worker: the page's static files, plus one lab behind `/api/*` (HTTP) and
 * `/ws` (the socket). Both go to the SAME Durable Object, so a flag flipped over HTTP is
 * the flag every socket hears about.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== "/ws" && !pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const headers = new Headers(request.headers);
    // set here, never trusted from the caller: the edge this request came in through
    const colo = (request.cf as { colo?: string } | undefined)?.colo;
    headers.set(COLO_HEADER, colo ?? "local");
    const lab = env.LAB.get(env.LAB.idFromName("lab"));
    return lab.fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<Env>;
