/** The Worker's bindings (wrangler.toml). */
interface Env {
  LAB: DurableObjectNamespace<import("./lab-do").LabDO>;
  ASSETS: Fetcher;
}
