/** Mock backend. Async with small delays so the UI shows real resolving state. */

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "advisor" | "surrogate" | "ip";
  brand: string;
  status: "active" | "invited" | "dormant";
}

export interface Form {
  slug: string;
  title: string;
  module: string;
  draft: boolean;
}

export interface Submission {
  id: string;
  form: string;
  email: string;
  status: "synced" | "pending" | "failed";
  when: string;
}

export interface Connection {
  id: string;
  name: string;
  driver: "sugarcrm" | "salesforce" | "webhook" | "email";
  live: boolean;
}

export const USERS: User[] = [
  {
    id: "u_1001",
    name: "Jonas Frost",
    email: "jonas@example.com",
    role: "admin",
    brand: "circle",
    status: "active",
  },
  {
    id: "u_1002",
    name: "Danielle Cole",
    email: "danielle@northstar.co",
    role: "advisor",
    brand: "circle",
    status: "active",
  },
  {
    id: "u_1003",
    name: "Jane Doe",
    email: "jane.doe@gmail.com",
    role: "surrogate",
    brand: "circle",
    status: "active",
  },
  {
    id: "u_1004",
    name: "Jon Snow",
    email: "jon@wall.north",
    role: "surrogate",
    brand: "circle",
    status: "invited",
  },
  {
    id: "u_1005",
    name: "Joni Mitchell",
    email: "joni@blue.ca",
    role: "ip",
    brand: "everie",
    status: "active",
  },
  {
    id: "u_1006",
    name: "Frank Ocean",
    email: "frank@channel.org",
    role: "ip",
    brand: "gg",
    status: "dormant",
  },
  {
    id: "u_1007",
    name: "Lou Reed",
    email: "lou@velvet.nyc",
    role: "advisor",
    brand: "circle",
    status: "active",
  },
  {
    id: "u_1008",
    name: "Maya Angelou",
    email: "maya@caged.bird",
    role: "surrogate",
    brand: "gg",
    status: "active",
  },
  {
    id: "u_1009",
    name: "Grace Hopper",
    email: "grace@navy.mil",
    role: "admin",
    brand: "circle",
    status: "active",
  },
  {
    id: "u_1010",
    name: "Ada Lovelace",
    email: "ada@analytical.engine",
    role: "ip",
    brand: "everie",
    status: "invited",
  },
  {
    id: "u_1011",
    name: "Jordan Lee",
    email: "jordan.lee@proton.me",
    role: "surrogate",
    brand: "circle",
    status: "active",
  },
  {
    id: "u_1012",
    name: "Josephine Baker",
    email: "jo@paris.fr",
    role: "ip",
    brand: "gg",
    status: "dormant",
  },
];

export const FORMS: Form[] = [
  { slug: "ip/long-form", title: "IP Long Application", module: "ip", draft: true },
  { slug: "ip/short-form", title: "IP Short Inquiry", module: "ip", draft: false },
  {
    slug: "surrogate/application",
    title: "Surrogate Application",
    module: "surrogate",
    draft: false,
  },
  {
    slug: "surrogate/background-checks",
    title: "Background Checks",
    module: "surrogate",
    draft: false,
  },
  {
    slug: "surrogate/health-insurance-intake",
    title: "Health Insurance Intake",
    module: "surrogate",
    draft: true,
  },
  {
    slug: "surrogate/prequal-eligibility",
    title: "PreQual Eligibility",
    module: "surrogate",
    draft: false,
  },
  { slug: "surrogate/surrogacy-plan", title: "Surrogacy Plan", module: "surrogate", draft: false },
  { slug: "demo/kitchen-sink", title: "Kitchen Sink", module: "demo", draft: true },
];

export const SUBMISSIONS: Submission[] = [
  { id: "sub_4821", form: "ip/long-form", email: "joni@blue.ca", status: "synced", when: "2m ago" },
  {
    id: "sub_4820",
    form: "surrogate/application",
    email: "jane.doe@gmail.com",
    status: "pending",
    when: "11m ago",
  },
  {
    id: "sub_4819",
    form: "ip/short-form",
    email: "frank@channel.org",
    status: "failed",
    when: "34m ago",
  },
  {
    id: "sub_4818",
    form: "surrogate/prequal-eligibility",
    email: "jon@wall.north",
    status: "synced",
    when: "1h ago",
  },
  {
    id: "sub_4817",
    form: "surrogate/application",
    email: "maya@caged.bird",
    status: "synced",
    when: "2h ago",
  },
  {
    id: "sub_4816",
    form: "ip/long-form",
    email: "ada@analytical.engine",
    status: "failed",
    when: "3h ago",
  },
  {
    id: "sub_4815",
    form: "surrogate/background-checks",
    email: "jordan.lee@proton.me",
    status: "pending",
    when: "5h ago",
  },
  {
    id: "sub_4814",
    form: "demo/kitchen-sink",
    email: "jonas@example.com",
    status: "synced",
    when: "1d ago",
  },
  { id: "sub_4813", form: "ip/short-form", email: "jo@paris.fr", status: "synced", when: "1d ago" },
  {
    id: "sub_4812",
    form: "surrogate/surrogacy-plan",
    email: "jane.doe@gmail.com",
    status: "synced",
    when: "2d ago",
  },
];

export const CONNECTIONS: Connection[] = [
  { id: "c_sugar", name: "SugarCRM (Circle)", driver: "sugarcrm", live: true },
  { id: "c_sf", name: "Salesforce (GG)", driver: "salesforce", live: false },
  { id: "c_hook", name: "Outbound webhooks", driver: "webhook", live: true },
  { id: "c_email", name: "Email (Cloudflare)", driver: "email", live: true },
];

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function matches(hay: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return hay.toLowerCase().includes(needle);
}

export async function searchUsers(q: string): Promise<User[]> {
  await delay(180);
  return USERS.filter((u) => matches(`${u.name} ${u.email} ${u.role} ${u.brand}`, q)).slice(0, 8);
}

export async function searchForms(q: string): Promise<Form[]> {
  await delay(150);
  return FORMS.filter((f) => matches(`${f.title} ${f.slug} ${f.module}`, q)).slice(0, 8);
}

export async function searchSubmissions(q: string): Promise<Submission[]> {
  await delay(200);
  return SUBMISSIONS.filter((s) => matches(`${s.id} ${s.form} ${s.email} ${s.status}`, q)).slice(
    0,
    8,
  );
}
