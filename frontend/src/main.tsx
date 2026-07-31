import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Activity, Check, ChevronLeft, ChevronRight, FileText, History, MessageSquare, MessageSquarePlus, Mic, Play, Plus, RefreshCw, RotateCcw, Search, Save, Trash2, Wrench } from "lucide-react";
import "./styles.css";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const apiKey = import.meta.env.VITE_API_KEY ?? "change-me";
const statuses = ["new", "active", "qualified", "follow_up", "converted", "not_interested", "blocked"];

type Customer = {
  id: string;
  displayName: string | null;
  phoneNumber: string | null;
  whatsappId: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  wantedService: string | null;
  country: string | null;
  city: string | null;
  status: string;
  interests: string[];
  freeTextProfile: string | null;
  internalNotes: string | null;
  lastContactAt: string | null;
  createdAt: string;
  messageCount?: number;
};

type Attribute = {
  id: string;
  key: string;
  value: unknown;
  valueType: string;
};

type Message = {
  id: string;
  direction: "incoming" | "outgoing";
  senderType: string;
  messageType: string;
  status: string;
  n8nStatus: string;
  failureReason: string | null;
  body: string | null;
  caption: string | null;
  processedText: string | null;
  mediaUrl: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  mediaAttachments?: MediaAttachment[];
};

type MediaAttachment = {
  id: string;
  mediaType: string;
  mimeType: string | null;
  filename: string | null;
  sourceUrl: string | null;
  publicUrl: string | null;
  rawPayload?: string;
  transcript: string | null;
  visionSummary: string | null;
  status: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  customerId: string;
  channel: string;
  externalChatId: string | null;
  sessionId: string | null;
  status: string;
  startedAt: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: Customer | null;
  _count?: { messages: number };
};

type ProcessingJob = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  lastError: string | null;
  payload: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id?: string; displayName: string | null; whatsappId: string | null; phoneNumber: string | null } | null;
  conversation?: { id: string; externalChatId: string | null; sessionId: string | null } | null;
  message?: { id?: string; body: string | null; processedText?: string | null; messageType: string; status: string; n8nStatus: string } | null;
};

type ToolCall = {
  name: string;
  args: unknown;
  result: unknown;
  triggeredAt?: string;
};

type Stats = {
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  qualifiedCustomers: number;
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  contactedLastSevenDays: number;
};

type PromptVariable = {
  name: string;
  required: boolean;
  description?: string;
  example?: string;
};

type PromptUsage = {
  service: string;
  module: string;
  trigger: string;
  model?: string;
};

type Prompt = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  content: string;
  version: number;
  status: string;
  isActive: boolean;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  responseFormat: string | null;
  variables: PromptVariable[];
  metadata: Record<string, unknown>;
  usage: PromptUsage[];
  createdAt: string;
  updatedAt: string;
};

type PromptVersion = {
  id: string;
  promptId: string;
  version: number;
  content: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  responseFormat: string | null;
  variables: PromptVariable[];
  metadata: Record<string, unknown>;
  changeNote: string | null;
  createdAt: string;
  createdBy: string | null;
};

type PromptTestResult = {
  renderedPrompt: string;
  response: string | null;
  model: string;
  latencyMs: number;
  tokenUsage: unknown;
  destructiveToolsExecuted: boolean;
};

type GraphNode = {
  id: string;
  label: string;
  detail: string;
  kind: "model" | "prompt" | "service";
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="brand">Meet Tina CRM</Link>
          <nav>
            <Link to="/">Dashboard</Link>
            <Link to="/customers">Customers</Link>
            <Link to="/conversations">Conversations</Link>
            <Link to="/processing-jobs">Processing jobs</Link>
            <Link to="/prompts">Prompts</Link>
            <Link to="/ai-models">AI Models</Link>
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<CustomerList />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/processing-jobs" element={<ProcessingJobs />} />
            <Route path="/prompts" element={<PromptManagement />} />
            <Route path="/ai-models" element={<AiModelsGraph />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function Dashboard(): JSX.Element {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    request<Stats>("/stats").then(setStats).catch((err: Error) => setError(err.message));
  }, []);

  const items = stats
    ? [
        ["Total customers", stats.totalCustomers],
        ["New customers", stats.newCustomers],
        ["Active customers", stats.activeCustomers],
        ["Qualified", stats.qualifiedCustomers],
        ["Total messages", stats.totalMessages],
        ["Incoming", stats.incomingMessages],
        ["Outgoing", stats.outgoingMessages],
        ["Last 7 days", stats.contactedLastSevenDays]
      ]
    : [];

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Customer and WhatsApp activity overview.</p>
        </div>
        <div className="header-actions">
          <Link className="button" to="/conversations"><MessageSquare size={16} /> Conversations</Link>
          <Link className="button" to="/processing-jobs"><Activity size={16} /> Jobs</Link>
          <Link className="button" to="/prompts"><FileText size={16} /> Prompts</Link>
          <Link className="button" to="/ai-models"><Activity size={16} /> AI Models</Link>
          <Link className="button primary" to="/customers"><Search size={16} /> Customers</Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="stats-grid">
        {items.map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomerList(): JSX.Element {
  const navigate = useNavigate();
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [sort, setSort] = React.useState("newest_contact");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: "25", sort });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    request<{ data: Customer[]; pagination: { totalPages: number } }>(`/customers?${params.toString()}`)
      .then((body) => {
        setCustomers(body.data);
        setTotalPages(Math.max(1, body.pagination.totalPages));
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [page, search, sort, status]);

  React.useEffect(load, [load]);
  React.useEffect(() => {
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function createCustomer(): Promise<void> {
    const created = await request<Customer>("/customers", {
      method: "POST",
      body: JSON.stringify({ displayName: "New customer", status: "new" })
    });
    navigate(`/customers/${created.id}`);
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p>Search, filter, and open customer profiles.</p>
        </div>
        <button className="button primary" onClick={() => void createCustomer()}><Plus size={16} /> Create</button>
      </div>
      <div className="toolbar">
        <label className="searchbox"><Search size={16} /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search customers" /></label>
        <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest_contact">Newest contact</option>
          <option value="newest_customer">Newest customer</option>
        </select>
        <button className="icon-button" title="Refresh" onClick={load}><RefreshCw size={16} /></button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone / WhatsApp</th>
              <th>Company</th>
              <th>Status</th>
              <th>Interests</th>
              <th>Last contact</th>
              <th>Messages</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} onClick={() => navigate(`/customers/${customer.id}`)}>
                <td>{customer.displayName ?? "Unnamed"}</td>
                <td>{customer.phoneNumber ?? customer.whatsappId ?? "-"}</td>
                <td>{customer.company ?? "-"}</td>
                <td><span className="status">{customer.status}</span></td>
                <td>{customer.interests.join(", ") || "-"}</td>
                <td>{formatDate(customer.lastContactAt)}</td>
                <td>{customer.messageCount ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button>
        <span>Page {page} of {totalPages}</span>
        <button className="icon-button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button>
      </div>
    </section>
  );
}

function CustomerDetail(): JSX.Element {
  const { id } = useParams();
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [attributes, setAttributes] = React.useState<Attribute[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [notice, setNotice] = React.useState("");
  const customerId = id ?? "";

  const load = React.useCallback(() => {
    if (!customerId) return;
    void Promise.all([
      request<Customer>(`/customers/${customerId}`).then(setCustomer),
      request<Attribute[]>(`/customers/${customerId}/attributes`).then(setAttributes),
      request<{ data: Message[] }>(`/customers/${customerId}/messages?limit=200`).then((body) => setMessages(body.data))
    ]);
  }, [customerId]);

  React.useEffect(load, [load]);
  React.useEffect(() => {
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function saveCustomer(next: Customer): Promise<void> {
    const updated = await request<Customer>(`/customers/${customerId}`, {
      method: "PATCH",
      body: JSON.stringify({
        displayName: next.displayName,
        phoneNumber: next.phoneNumber,
        email: next.email,
        company: next.company,
        jobTitle: next.jobTitle,
        wantedService: next.wantedService,
        country: next.country,
        city: next.city,
        status: next.status,
        interests: next.interests,
        freeTextProfile: next.freeTextProfile,
        internalNotes: next.internalNotes
      })
    });
    setCustomer(updated);
    flash("Saved");
  }

  function flash(value: string): void {
    setNotice(value);
    window.setTimeout(() => setNotice(""), 1600);
  }

  if (!customer) {
    return <section className="page"><p>Loading customer...</p></section>;
  }

  return (
    <section className="page detail">
      <div className="page-header">
        <div>
          <Link className="back-link" to="/customers">Back to customers</Link>
          <h1>{customer.displayName ?? "Unnamed customer"}</h1>
          <p>{customer.whatsappId ?? customer.phoneNumber ?? "No WhatsApp identifier saved"}</p>
        </div>
        <button className="button primary" onClick={() => void saveCustomer(customer)}><Save size={16} /> Save</button>
      </div>
      {notice && <p className="success"><Check size={16} /> {notice}</p>}
      <div className="detail-grid">
        <ProfileEditor customer={customer} setCustomer={setCustomer} />
        <AttributesPanel customerId={customerId} attributes={attributes} reload={load} />
      </div>
      <section className="wide-panel">
        <h2>Conversation</h2>
        <MessageComposer customerId={customerId} reload={load} />
        <div className="chat">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </section>
    </section>
  );
}

function ProfileEditor({ customer, setCustomer }: { customer: Customer; setCustomer: (customer: Customer) => void }): JSX.Element {
  const update = (field: keyof Customer, value: string | string[]): void => setCustomer({ ...customer, [field]: value });
  return (
    <section className="panel">
      <h2>Profile</h2>
      <div className="form-grid">
        <Input label="Display name" value={customer.displayName} onChange={(value) => update("displayName", value)} />
        <Input label="Phone number" value={customer.phoneNumber} onChange={(value) => update("phoneNumber", value)} />
        <Input label="Email" value={customer.email} onChange={(value) => update("email", value)} />
        <Input label="Company" value={customer.company} onChange={(value) => update("company", value)} />
        <Input label="Job title" value={customer.jobTitle} onChange={(value) => update("jobTitle", value)} />
        <Input label="Wanted service" value={customer.wantedService} onChange={(value) => update("wantedService", value)} />
        <Input label="Country" value={customer.country} onChange={(value) => update("country", value)} />
        <Input label="City" value={customer.city} onChange={(value) => update("city", value)} />
        <label>
          <span>Status</span>
          <select value={customer.status} onChange={(event) => update("status", event.target.value)}>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
      <label>
        <span>Interests</span>
        <input value={customer.interests.join(", ")} onChange={(event) => update("interests", splitCsv(event.target.value))} />
      </label>
      <label>
        <span>Free-text profile</span>
        <textarea value={customer.freeTextProfile ?? ""} onChange={(event) => update("freeTextProfile", event.target.value)} />
      </label>
      <label>
        <span>Internal notes</span>
        <textarea value={customer.internalNotes ?? ""} onChange={(event) => update("internalNotes", event.target.value)} />
      </label>
    </section>
  );
}

function AttributesPanel({ customerId, attributes, reload }: { customerId: string; attributes: Attribute[]; reload: () => void }): JSX.Element {
  const [keyName, setKeyName] = React.useState("");
  const [value, setValue] = React.useState("");

  async function save(): Promise<void> {
    if (!keyName.trim()) return;
    await request(`/customers/${customerId}/attributes/${encodeURIComponent(keyName.trim())}`, {
      method: "PUT",
      body: JSON.stringify({ value, valueType: "string" })
    });
    setKeyName("");
    setValue("");
    reload();
  }

  async function remove(key: string): Promise<void> {
    await request(`/customers/${customerId}/attributes/${encodeURIComponent(key)}`, { method: "DELETE" });
    reload();
  }

  return (
    <section className="panel">
      <h2>Custom attributes</h2>
      <div className="attribute-form">
        <input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="key" />
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="value" />
        <button className="icon-button" title="Save attribute" onClick={() => void save()}><Save size={16} /></button>
      </div>
      <div className="attribute-list">
        {attributes.map((attribute) => (
          <div key={attribute.id}>
            <span><strong>{attribute.key}</strong>: {String(attribute.value)}</span>
            <button className="icon-button danger" title="Delete" onClick={() => void remove(attribute.key)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function MessageComposer({ customerId, conversationId, reload }: { customerId: string; conversationId?: string; reload: () => void }): JSX.Element {
  const [body, setBody] = React.useState("");
  const [direction, setDirection] = React.useState<"incoming" | "outgoing">("outgoing");
  const [error, setError] = React.useState("");

  async function save(): Promise<void> {
    if (!body.trim()) return;
    const conversations = conversationId ? [] : await request<Array<{ id: string }>>(`/customers/${customerId}/conversations`);
    const existingConversationId =
      conversationId ??
      conversations[0]?.id ??
      (
        await request<{ id: string }>("/conversations", {
          method: "POST",
          body: JSON.stringify({ customerId, channel: "whatsapp", status: "active" })
        })
      ).id;
    try {
      if (direction === "outgoing") {
        await request(`/conversations/${existingConversationId}/send`, {
          method: "POST",
          body: JSON.stringify({ text: body, senderType: "agent" })
        });
      } else {
        await request("/messages", {
          method: "POST",
          body: JSON.stringify({
            customerId,
            conversationId: existingConversationId,
            direction,
            senderType: "customer",
            messageType: "text",
            body,
            receivedAt: new Date().toISOString(),
            rawPayload: {}
          })
        });
      }
      setBody("");
      setError("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed");
    }
  }

  return (
    <>
      <div className="composer">
        <select value={direction} onChange={(event) => setDirection(event.target.value as "incoming" | "outgoing")}>
          <option value="outgoing">Send outgoing</option>
          <option value="incoming">Record incoming</option>
        </select>
        <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message" />
        <button className="button" onClick={() => void save()}><MessageSquarePlus size={16} /> {direction === "outgoing" ? "Send" : "Add"}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function Conversations(): JSX.Element {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [jobs, setJobs] = React.useState<ProcessingJob[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [sort, setSort] = React.useState<"recent" | "oldest" | "customer">("recent");
  const [groupBy, setGroupBy] = React.useState<"none" | "day" | "hour" | "customer">("none");
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    request<{ data: Conversation[] }>(`/conversations?limit=100&sort=${sort}`)
      .then((body) => {
        setConversations(body.data);
        setSelectedId((current) => body.data.some((conversation) => conversation.id === current) ? current : body.data[0]?.id || "");
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [sort]);

  const loadMessages = React.useCallback(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    request<{ data: Message[] }>(`/conversations/${selectedId}/messages?limit=200`)
      .then((body) => {
        setMessages(body.data);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [selectedId]);

  const loadJobs = React.useCallback(() => {
    request<ProcessingJob[]>("/processing-jobs")
      .then((body) => {
        setJobs(body);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  React.useEffect(load, [load]);
  React.useEffect(loadMessages, [loadMessages]);
  React.useEffect(loadJobs, [loadJobs]);
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      load();
      loadMessages();
      loadJobs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load, loadJobs, loadMessages]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const groups = groupConversations(conversations, groupBy);
  const timeline = buildConversationTimeline(messages, jobs.filter((job) => job.conversation?.id === selectedId));

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Conversations</h1>
          <p>Review WhatsApp threads, media analysis, transcripts, and manually keep messages.</p>
        </div>
        <button className="icon-button" title="Refresh" onClick={() => { load(); loadMessages(); loadJobs(); }}><RefreshCw size={16} /></button>
      </div>
      <div className="toolbar">
        <select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "oldest" | "customer")}>
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
          <option value="customer">Customer name</option>
        </select>
        <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as "none" | "day" | "hour" | "customer")}>
          <option value="none">No grouping</option>
          <option value="day">Group by day</option>
          <option value="hour">Group by hour</option>
          <option value="customer">Group by customer</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="conversation-layout">
        <aside className="conversation-list">
          {groups.map((group) => (
            <div key={group.label} className="conversation-group">
              <h3>{group.label}</h3>
              {group.items.map((conversation) => (
                <button
                  className={`conversation-row ${conversation.id === selectedId ? "active" : ""}`}
                  key={conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <strong>{conversation.customer?.displayName ?? conversation.customer?.whatsappId ?? "Unnamed customer"}</strong>
                  <span>{conversation._count?.messages ?? 0} messages · {formatDate(conversation.lastMessageAt ?? conversation.updatedAt)}</span>
                  <small>{conversation.externalChatId ?? conversation.channel}</small>
                </button>
              ))}
            </div>
          ))}
        </aside>
        <section className="conversation-detail">
          {selected ? (
            <>
              <div className="thread-header">
                <div>
                  <h2>{selected.customer?.displayName ?? "Conversation"}</h2>
                  <p>{selected.customer?.wantedService ? `Wanted service: ${selected.customer.wantedService}` : "Wanted service not set yet"}</p>
                </div>
                {selected.customerId && <Link className="button" to={`/customers/${selected.customerId}`}>Open customer</Link>}
              </div>
              <MessageComposer customerId={selected.customerId} conversationId={selected.id} reload={() => { load(); loadMessages(); loadJobs(); }} />
              <div className="chat">
                {timeline.map((item) =>
                  item.type === "message" ? (
                    <MessageBubble key={`message-${item.message.id}`} message={item.message} />
                  ) : (
                    <ToolCallBubble key={`tool-${item.job.id}-${item.index}`} job={item.job} call={item.call} />
                  )
                )}
              </div>
            </>
          ) : (
            <p>No conversations yet.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function ProcessingJobs(): JSX.Element {
  const [jobs, setJobs] = React.useState<ProcessingJob[]>([]);
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    request<ProcessingJob[]>("/processing-jobs")
      .then((body) => {
        setJobs(body);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  React.useEffect(load, [load]);
  React.useEffect(() => {
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function retry(id: string): Promise<void> {
    await request(`/processing-jobs/${id}/retry`, { method: "POST" });
    load();
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Processing jobs</h1>
          <p>Inbound chatbot handoffs, callbacks, and retry state.</p>
        </div>
        <button className="icon-button" title="Refresh" onClick={load}><RefreshCw size={16} /></button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Customer</th>
              <th>Message</th>
              <th>Attempts</th>
              <th>Failure</th>
              <th>Correlation</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td><span className="status">{job.status}</span></td>
                <td>{job.customer?.displayName ?? job.customer?.whatsappId ?? job.customer?.phoneNumber ?? "-"}</td>
                <td>{job.message?.body ?? job.message?.messageType ?? "-"}</td>
                <td>{job.attempts}/{job.maxAttempts}</td>
                <td>{job.lastError ?? "-"}</td>
                <td>{job.correlationId}</td>
                <td>{formatDate(job.updatedAt ?? job.createdAt)}</td>
                <td><button className="icon-button" title="Retry" onClick={() => void retry(job.id)}><RefreshCw size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const promptCategories = ["Sales", "Routing", "Classification", "Extraction", "Generation", "Safety", "Media", "Follow-up", "Internal", "Other"];
const promptStatuses = ["active", "draft", "archived"];

function PromptManagement(): JSX.Element {
  const [prompts, setPrompts] = React.useState<Prompt[]>([]);
  const [selected, setSelected] = React.useState<Prompt | null>(null);
  const [versions, setVersions] = React.useState<PromptVersion[]>([]);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [editor, setEditor] = React.useState(promptEditorDefaults());
  const [changeNote, setChangeNote] = React.useState("");
  const [sampleMessage, setSampleMessage] = React.useState("I run a clinic and I miss many WhatsApp appointment requests after hours.");
  const [variablesJson, setVariablesJson] = React.useState("{}");
  const [testResult, setTestResult] = React.useState<PromptTestResult | null>(null);
  const [versionPreview, setVersionPreview] = React.useState<PromptVersion | null>(null);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    request<{ data: Prompt[] }>(`/prompts?${params.toString()}`)
      .then((body) => {
        setPrompts(body.data);
        setSelected((current) => {
          const next = body.data.find((prompt) => prompt.id === current?.id) ?? body.data[0] ?? null;
          if (next) setEditor(promptToEditor(next));
          return next;
        });
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [category, search, status]);

  const loadVersions = React.useCallback(() => {
    if (!selected) {
      setVersions([]);
      setVersionPreview(null);
      return;
    }
    request<PromptVersion[]>(`/prompts/${selected.id}/versions`)
      .then((body) => {
        setVersions(body);
        setVersionPreview((current) => current && body.some((version) => version.id === current.id) ? current : body[0] ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, [selected]);

  React.useEffect(load, [load]);
  React.useEffect(loadVersions, [loadVersions]);

  function selectPrompt(prompt: Prompt): void {
    setSelected(prompt);
    setEditor(promptToEditor(prompt));
    setChangeNote("");
    setTestResult(null);
    setError("");
  }

  function createNew(): void {
    const next = promptEditorDefaults();
    setSelected(null);
    setEditor(next);
    setVersions([]);
    setVersionPreview(null);
    setChangeNote("Initial prompt version.");
    setTestResult(null);
  }

  async function save(): Promise<void> {
    try {
      const payload = {
        ...editor,
        temperature: numericOrNull(editor.temperature),
        maxTokens: integerOrNull(editor.maxTokens),
        description: editor.description || undefined,
        model: editor.model || undefined,
        responseFormat: editor.responseFormat || undefined,
        changeNote: changeNote || undefined,
        updatedBy: "dashboard"
      };
      const saved = selected
        ? await request<Prompt>(`/prompts/${selected.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await request<Prompt>("/prompts", { method: "POST", body: JSON.stringify(payload) });
      setSelected(saved);
      setEditor(promptToEditor(saved));
      setChangeNote("");
      setNotice("Prompt saved");
      window.setTimeout(() => setNotice(""), 1600);
      load();
      loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt save failed");
    }
  }

  async function activate(): Promise<void> {
    if (!selected) return;
    try {
      const activated = await request<Prompt>(`/prompts/${selected.id}/activate`, {
        method: "POST",
        body: JSON.stringify({ updatedBy: "dashboard", changeNote: "Activated from dashboard." })
      });
      setSelected(activated);
      setEditor(promptToEditor(activated));
      load();
      setNotice("Prompt activated");
      window.setTimeout(() => setNotice(""), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt activation failed");
    }
  }

  async function restore(version: PromptVersion): Promise<void> {
    if (!selected) return;
    try {
      const restored = await request<Prompt>(`/prompts/${selected.id}/restore/${version.id}`, {
        method: "POST",
        body: JSON.stringify({ updatedBy: "dashboard", changeNote: `Restored version ${version.version} from dashboard.` })
      });
      setSelected(restored);
      setEditor(promptToEditor(restored));
      load();
      loadVersions();
      setNotice(`Restored version ${version.version}`);
      window.setTimeout(() => setNotice(""), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt restore failed");
    }
  }

  async function testPrompt(): Promise<void> {
    try {
      const variables = parseJsonObject(variablesJson);
      const result = await request<PromptTestResult>("/prompts/test", {
        method: "POST",
        body: JSON.stringify({
          promptId: selected?.id,
          content: selected ? undefined : editor.content,
          sampleMessage,
          variables,
          model: editor.model || undefined,
          temperature: numericOrNull(editor.temperature) ?? undefined,
          maxTokens: integerOrNull(editor.maxTokens) ?? undefined
        })
      });
      setTestResult(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt test failed");
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Prompt Management</h1>
          <p>Edit Tina prompts, review version history, restore safely, and test rendering without deploying.</p>
        </div>
        <div className="header-actions">
          <button className="button" onClick={createNew}><Plus size={16} /> New prompt</button>
          <button className="icon-button" title="Refresh" onClick={load}><RefreshCw size={16} /></button>
        </div>
      </div>
      {notice && <p className="success"><Check size={16} /> {notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="prompt-layout">
        <aside className="prompt-list">
          <div className="prompt-filters">
            <label className="searchbox"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prompts" /></label>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {promptCategories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {promptStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          {prompts.map((prompt) => (
            <button key={prompt.id} className={`prompt-row ${prompt.id === selected?.id ? "active" : ""}`} onClick={() => selectPrompt(prompt)}>
              <strong>{prompt.name}</strong>
              <span>{prompt.key}</span>
              <small>{prompt.category} · v{prompt.version} · {prompt.status}</small>
            </button>
          ))}
        </aside>
        <section className="prompt-editor">
          <div className="prompt-editor-header">
            <div>
              <h2>{selected ? selected.name : "New prompt"}</h2>
              <p>{selected ? `Last updated ${formatDate(selected.updatedAt)}` : "Create a managed prompt with version history."}</p>
            </div>
            <div className="header-actions">
              {selected && <button className="button" onClick={() => void activate()}><Check size={16} /> Activate</button>}
              <button className="button primary" onClick={() => void save()}><Save size={16} /> Save</button>
            </div>
          </div>
          <div className="form-grid">
            <Input label="Key" value={editor.key} onChange={(value) => setEditor({ ...editor, key: value })} />
            <Input label="Name" value={editor.name} onChange={(value) => setEditor({ ...editor, name: value })} />
            <label>
              <span>Category</span>
              <select value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })}>
                {promptCategories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value })}>
                {promptStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Input label="Model" value={editor.model} onChange={(value) => setEditor({ ...editor, model: value })} />
            <Input label="Temperature" value={editor.temperature} onChange={(value) => setEditor({ ...editor, temperature: value })} />
            <Input label="Max tokens" value={editor.maxTokens} onChange={(value) => setEditor({ ...editor, maxTokens: value })} />
            <Input label="Response format" value={editor.responseFormat} onChange={(value) => setEditor({ ...editor, responseFormat: value })} />
          </div>
          <Input label="Description" value={editor.description} onChange={(value) => setEditor({ ...editor, description: value })} />
          <label>
            <span>Prompt content</span>
            <textarea className="prompt-content" value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} />
          </label>
          <Input label="Change note" value={changeNote} onChange={setChangeNote} />

          <div className="prompt-tabs">
            <section className="prompt-panel">
              <h2><History size={16} /> Version history</h2>
              <div className="version-list">
                {versions.map((version) => (
                  <button key={version.id} className={`version-row ${version.id === versionPreview?.id ? "active" : ""}`} onClick={() => setVersionPreview(version)}>
                    <span>v{version.version}</span>
                    <small>{formatDate(version.createdAt)} · {version.changeNote ?? "No note"}</small>
                  </button>
                ))}
              </div>
              {versionPreview && (
                <>
                  <div className="diff-grid">
                    <div>
                      <strong>Selected version</strong>
                      <pre>{versionPreview.content}</pre>
                    </div>
                    <div>
                      <strong>Current editor</strong>
                      <pre>{editor.content}</pre>
                    </div>
                  </div>
                  <button className="button" onClick={() => void restore(versionPreview)}><RotateCcw size={16} /> Restore selected</button>
                </>
              )}
            </section>
            <section className="prompt-panel">
              <h2><Play size={16} /> Safe test</h2>
              <label>
                <span>Variables JSON</span>
                <textarea value={variablesJson} onChange={(event) => setVariablesJson(event.target.value)} />
              </label>
              <label>
                <span>Sample customer message</span>
                <textarea value={sampleMessage} onChange={(event) => setSampleMessage(event.target.value)} />
              </label>
              <button className="button" onClick={() => void testPrompt()}><Play size={16} /> Run test</button>
              {testResult && (
                <div className="test-result">
                  <strong>{testResult.model} · {testResult.latencyMs} ms · tools executed: {String(testResult.destructiveToolsExecuted)}</strong>
                  <pre>{testResult.response ?? "No model response returned."}</pre>
                  <details>
                    <summary>Rendered prompt</summary>
                    <pre>{testResult.renderedPrompt}</pre>
                  </details>
                </div>
              )}
            </section>
            <section className="prompt-panel">
              <h2><FileText size={16} /> Usage</h2>
              {(selected?.usage ?? []).map((usage, index) => (
                <div className="usage-row" key={`${usage.module}-${index}`}>
                  <strong>{usage.service}</strong>
                  <span>{usage.module}</span>
                  <small>{usage.trigger}</small>
                  {usage.model && <small>Model: {usage.model}</small>}
                </div>
              ))}
              {selected && selected.usage.length === 0 && <p>No runtime usage registered.</p>}
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}

function AiModelsGraph(): JSX.Element {
  const [prompts, setPrompts] = React.useState<Prompt[]>([]);
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    request<{ data: Prompt[] }>("/prompts?limit=100")
      .then((body) => {
        setPrompts(body.data);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  React.useEffect(load, [load]);

  const graph = React.useMemo(() => buildAiModelGraph(prompts), [prompts]);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>AI Models</h1>
          <p>Model, prompt, and service map for Tina’s runtime AI stack.</p>
        </div>
        <button className="icon-button" title="Refresh" onClick={load}><RefreshCw size={16} /></button>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="model-graph-panel">
        <div className="model-graph">
          <svg className="model-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {graph.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              return (
                <g key={edge.id}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                  <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2}>{edge.label}</text>
                </g>
              );
            })}
          </svg>
          {graph.nodes.map((node) => (
            <div
              className={`model-node ${node.kind}`}
              key={node.id}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="model-legend">
        <span><b className="legend-box model" /> Model</span>
        <span><b className="legend-box prompt" /> Prompt</span>
        <span><b className="legend-box service" /> Service</span>
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: Message }): JSX.Element {
  const content = message.body || message.caption || message.processedText || "-";
  const hasProcessedText = Boolean(message.processedText && message.processedText !== message.body && message.processedText !== message.caption);
  return (
    <div className={`bubble ${message.direction}`}>
      <span>{message.senderType} · {message.messageType} · {formatDate(message.receivedAt ?? message.sentAt ?? message.createdAt)}</span>
      <small>{message.status}{message.n8nStatus !== "not_queued" ? ` / n8n ${message.n8nStatus}` : ""}</small>
      {message.failureReason && <small className="failure-reason">{message.failureReason}</small>}
      <p>{content}</p>
      {hasProcessedText && <pre className="message-analysis">{message.processedText}</pre>}
      {(message.mediaAttachments ?? []).map((attachment) => {
        const preview = mediaPreviewSrc(attachment);
        return (
          <div className="attachment" key={attachment.id}>
            <span>{attachmentIcon(attachment)} {attachment.filename ?? attachment.mediaType} · {attachment.status}</span>
            {preview && <img className="media-preview" src={preview} alt={attachment.filename ?? "Customer media"} />}
            {attachment.transcript && <p>{attachment.transcript}</p>}
            {attachment.visionSummary && <p>{attachment.visionSummary}</p>}
            {(attachment.publicUrl || attachment.sourceUrl) && <a href={attachment.publicUrl ?? attachment.sourceUrl ?? "#"} target="_blank" rel="noreferrer">Open source</a>}
          </div>
        );
      })}
    </div>
  );
}

function ToolCallBubble({ job, call }: { job: ProcessingJob; call: ToolCall }): JSX.Element {
  return (
    <details className="tool-bubble">
      <summary>
        <Wrench size={14} />
        <span>{call.name}</span>
        <small>{formatDate(call.triggeredAt ?? job.createdAt)} · {job.status} · attempt {job.attempts}/{job.maxAttempts}</small>
      </summary>
      {job.lastError && <p className="error compact-error">{job.lastError}</p>}
      <div className="tool-detail-grid">
        <div>
          <strong>Arguments</strong>
          <pre>{formatJson(call.args)}</pre>
        </div>
        <div>
          <strong>Result</strong>
          <pre>{formatJson(call.result)}</pre>
        </div>
      </div>
    </details>
  );
}

function attachmentIcon(attachment: MediaAttachment): JSX.Element {
  if (attachment.mimeType?.startsWith("audio/") || attachment.mediaType === "ptt" || attachment.mediaType === "audio") {
    return <Mic size={14} />;
  }
  return <FileText size={14} />;
}

function mediaPreviewSrc(attachment: MediaAttachment): string | null {
  if (!attachment.mimeType?.startsWith("image/")) return null;
  if (attachment.publicUrl || attachment.sourceUrl) return attachment.publicUrl ?? attachment.sourceUrl;
  if (!attachment.rawPayload) return null;
  try {
    const raw = JSON.parse(attachment.rawPayload) as unknown;
    const record = recordValue(raw);
    const rawData = recordValue(record?.data);
    const media = recordValue(rawData?.media) ?? recordValue(record?.media) ?? rawData ?? record;
    const data = media?.data ?? media?.base64 ?? rawData?.mediaData ?? rawData?.fileData ?? record?.data;
    if (typeof data !== "string" || !data.trim()) return null;
    if (data.startsWith("data:")) return data;
    return `data:${cleanMimeType(attachment.mimeType) ?? "image/jpeg"};base64,${data}`;
  } catch {
    return null;
  }
}

type ConversationTimelineItem =
  | { type: "message"; at: string; message: Message }
  | { type: "tool"; at: string; job: ProcessingJob; call: ToolCall; index: number };

function buildConversationTimeline(messages: Message[], jobs: ProcessingJob[]): ConversationTimelineItem[] {
  const items: ConversationTimelineItem[] = messages.map((message) => ({
    type: "message",
    at: message.receivedAt ?? message.sentAt ?? message.createdAt,
    message
  }));
  for (const job of jobs) {
    extractToolCalls(job).forEach((call, index) => {
      items.push({
        type: "tool",
        at: call.triggeredAt ?? job.createdAt,
        job,
        call,
        index
      });
    });
  }
  return items.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
}

function groupConversations(conversations: Conversation[], groupBy: "none" | "day" | "hour" | "customer"): Array<{ label: string; items: Conversation[] }> {
  if (groupBy === "none") return [{ label: "All conversations", items: conversations }];
  const groups = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const date = new Date(conversation.lastMessageAt ?? conversation.updatedAt);
    const label =
      groupBy === "customer"
        ? (conversation.customer?.displayName ?? conversation.customer?.whatsappId ?? "Unnamed customer")
        : groupBy === "hour"
          ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", hour: "numeric" }).format(date)
          : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
    groups.set(label, [...(groups.get(label) ?? []), conversation]);
  }
  return Array.from(groups, ([label, items]) => ({ label, items }));
}

function extractToolCalls(job: ProcessingJob): ToolCall[] {
  const result = parseJson(job.result);
  const payload = parseJson(job.payload);
  const dispatch = recordValue(result?.dispatch);
  const callback = recordValue(result?.callback);
  const tinaResponse = recordValue(result?.tinaResponse);
  const candidates = [
    result?.toolCalls,
    result?.tool_calls,
    tinaResponse?.toolCalls,
    tinaResponse?.tool_calls,
    dispatch?.toolCalls,
    dispatch?.tool_calls,
    callback?.toolCalls,
    callback?.tool_calls,
    payload?.toolCalls,
    payload?.tool_calls
  ];
  return candidates.flatMap((candidate) => normalizeToolCalls(candidate));
}

function normalizeToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: ToolCall[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : typeof record.tool === "string" ? record.tool : "tool";
    const triggeredAt = typeof record.triggeredAt === "string" ? record.triggeredAt : undefined;
    calls.push({ name, args: record.args ?? record.arguments ?? {}, result: record.result ?? record.output ?? null, triggeredAt });
  }
  return calls;
}

function buildAiModelGraph(prompts: Prompt[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const configuredPrompts = prompts.length > 0 ? prompts : fallbackPromptGraphPrompts();
  const modelNames = Array.from(
    new Set(
      [
        ...configuredPrompts.flatMap((prompt) => [prompt.model, ...prompt.usage.map((usage) => usage.model)]),
        "gpt-4o-mini-transcribe",
        "whisper-1"
      ]
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );
  const promptNodes = configuredPrompts.slice(0, 8);
  const serviceNames = Array.from(new Set(configuredPrompts.flatMap((prompt) => prompt.usage.map((usage) => usage.service)))).slice(0, 6);
  if (!serviceNames.includes("Audio transcription")) serviceNames.push("Audio transcription");

  const nodes: GraphNode[] = [
    ...layoutRow(modelNames, 18, "model", (name) => ({ id: `model:${name}`, label: name, detail: "AI model" })),
    ...layoutRow(promptNodes, 53, "prompt", (prompt) => ({
      id: `prompt:${prompt.key}`,
      label: prompt.name,
      detail: `${prompt.category} · v${prompt.version}`
    })),
    ...layoutRow(serviceNames, 86, "service", (service) => ({ id: `service:${service}`, label: service, detail: "Runtime service" }))
  ];

  const edges: GraphEdge[] = [];
  for (const prompt of promptNodes) {
    const promptId = `prompt:${prompt.key}`;
    const linkedModels = Array.from(new Set([prompt.model, ...prompt.usage.map((usage) => usage.model)].filter((value): value is string => Boolean(value))));
    for (const model of linkedModels) {
      edges.push({ id: `model:${model}->${promptId}`, from: `model:${model}`, to: promptId, label: "uses" });
    }
    for (const usage of prompt.usage) {
      edges.push({ id: `${promptId}->service:${usage.service}`, from: promptId, to: `service:${usage.service}`, label: "runs in" });
    }
  }
  edges.push({ id: "model:gpt-4o-mini-transcribe->service:Audio transcription", from: "model:gpt-4o-mini-transcribe", to: "service:Audio transcription", label: "transcribes" });
  edges.push({ id: "model:whisper-1->service:Audio transcription", from: "model:whisper-1", to: "service:Audio transcription", label: "fallback" });

  return { nodes, edges: edges.filter((edge) => nodes.some((node) => node.id === edge.from) && nodes.some((node) => node.id === edge.to)) };
}

function layoutRow<T>(
  items: T[],
  y: number,
  kind: GraphNode["kind"],
  map: (item: T) => Omit<GraphNode, "x" | "y" | "kind">
): GraphNode[] {
  const count = Math.max(items.length, 1);
  return items.map((item, index) => ({
    ...map(item),
    kind,
    x: ((index + 1) * 100) / (count + 1),
    y
  }));
}

function fallbackPromptGraphPrompts(): Prompt[] {
  return [
    {
      id: "fallback-sales",
      key: "sales.main_system",
      name: "Tina Sales System Prompt",
      description: null,
      category: "Sales",
      content: "",
      version: 1,
      status: "active",
      isActive: true,
      model: "gpt-5.4-mini",
      temperature: 0.2,
      maxTokens: null,
      responseFormat: null,
      variables: [],
      metadata: {},
      usage: [{ service: "Tinabrain", module: "tinabrain/tinabrain/graph.py", trigger: "System prompt", model: "gpt-5.4-mini" }],
      createdAt: "",
      updatedAt: ""
    },
    {
      id: "fallback-media",
      key: "media.image_analysis",
      name: "Vision and Document Analysis Prompt",
      description: null,
      category: "Media",
      content: "",
      version: 1,
      status: "active",
      isActive: true,
      model: "gpt-4o-mini",
      temperature: 0,
      maxTokens: null,
      responseFormat: null,
      variables: [],
      metadata: {},
      usage: [{ service: "Backend media processing", module: "backend/src/media/media.service.ts", trigger: "Vision analysis", model: "gpt-4o-mini" }],
      createdAt: "",
      updatedAt: ""
    }
  ];
}

function parseJson(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return recordValue(parsed);
  } catch {
    return null;
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cleanMimeType(value: string | null): string | null {
  return value?.split(";")[0]?.trim() || value;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

type PromptEditorState = {
  key: string;
  name: string;
  description: string;
  category: string;
  content: string;
  status: string;
  model: string;
  temperature: string;
  maxTokens: string;
  responseFormat: string;
};

function promptEditorDefaults(): PromptEditorState {
  return {
    key: "",
    name: "",
    description: "",
    category: "Sales",
    content: "",
    status: "draft",
    model: "gpt-5.4-mini",
    temperature: "0.2",
    maxTokens: "",
    responseFormat: ""
  };
}

function promptToEditor(prompt: Prompt): PromptEditorState {
  return {
    key: prompt.key,
    name: prompt.name,
    description: prompt.description ?? "",
    category: prompt.category,
    content: prompt.content,
    status: prompt.status,
    model: prompt.model ?? "",
    temperature: prompt.temperature === null ? "" : String(prompt.temperature),
    maxTokens: prompt.maxTokens === null ? "" : String(prompt.maxTokens),
    responseFormat: prompt.responseFormat ?? ""
  };
}

function numericOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: string): number | null {
  const parsed = numericOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  const record = recordValue(parsed);
  if (!record) throw new Error("Variables JSON must be an object.");
  return record;
}

function Input({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string) => void }): JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <input value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
