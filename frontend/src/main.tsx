import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Activity, Check, ChevronLeft, ChevronRight, FileText, MessageSquare, MessageSquarePlus, Mic, Plus, RefreshCw, Search, Save, Trash2, Wrench } from "lucide-react";
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
            <Link to="/tool-calls">Tool calls</Link>
            <Link to="/processing-jobs">Processing jobs</Link>
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<CustomerList />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/tool-calls" element={<ToolCalls />} />
            <Route path="/processing-jobs" element={<ProcessingJobs />} />
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
          <Link className="button" to="/tool-calls"><Wrench size={16} /> Tools</Link>
          <Link className="button" to="/processing-jobs"><Activity size={16} /> Jobs</Link>
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

  React.useEffect(load, [load]);
  React.useEffect(loadMessages, [loadMessages]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const groups = groupConversations(conversations, groupBy);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Conversations</h1>
          <p>Review WhatsApp threads, media analysis, transcripts, and manually keep messages.</p>
        </div>
        <button className="icon-button" title="Refresh" onClick={() => { load(); loadMessages(); }}><RefreshCw size={16} /></button>
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
              <MessageComposer customerId={selected.customerId} conversationId={selected.id} reload={() => { load(); loadMessages(); }} />
              <div className="chat">
                {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
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

function ToolCalls(): JSX.Element {
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

  const rows = jobs.flatMap((job) => extractToolCalls(job).map((call, index) => ({ ...call, key: `${job.id}-${index}`, job })));

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Tool calls</h1>
          <p>CRM writes and TinaBrain tool results captured from processing jobs.</p>
        </div>
        <button className="icon-button" title="Refresh" onClick={load}><RefreshCw size={16} /></button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="tool-call-grid">
        {rows.map((row) => (
          <article className="tool-card" key={row.key}>
            <div className="tool-card-header">
              <span className="status">{row.name}</span>
              <small>{formatDate(row.job.updatedAt ?? row.job.createdAt)}</small>
            </div>
            <strong>{row.job.customer?.displayName ?? row.job.customer?.whatsappId ?? "Unknown customer"}</strong>
            <p>{row.job.message?.processedText ?? row.job.message?.body ?? row.job.message?.messageType ?? "-"}</p>
            <details>
              <summary>Arguments</summary>
              <pre>{formatJson(row.args)}</pre>
            </details>
            <details>
              <summary>Result</summary>
              <pre>{formatJson(row.result)}</pre>
            </details>
          </article>
        ))}
        {rows.length === 0 && <p>No tool calls captured yet.</p>}
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

function MessageBubble({ message }: { message: Message }): JSX.Element {
  const content = message.body || message.caption || message.processedText || "-";
  const hasProcessedText = Boolean(message.processedText && message.processedText !== message.body && message.processedText !== message.caption);
  return (
    <div className={`bubble ${message.direction}`}>
      <span>{message.senderType} · {message.messageType} · {formatDate(message.receivedAt ?? message.sentAt ?? message.createdAt)}</span>
      <small>{message.status}{message.n8nStatus !== "not_queued" ? ` / n8n ${message.n8nStatus}` : ""}</small>
      <p>{content}</p>
      {hasProcessedText && <pre className="message-analysis">{message.processedText}</pre>}
      {(message.mediaAttachments ?? []).map((attachment) => (
        <div className="attachment" key={attachment.id}>
          <span>{attachmentIcon(attachment)} {attachment.filename ?? attachment.mediaType} · {attachment.status}</span>
          {attachment.transcript && <p>{attachment.transcript}</p>}
          {attachment.visionSummary && <p>{attachment.visionSummary}</p>}
          {(attachment.publicUrl || attachment.sourceUrl) && <a href={attachment.publicUrl ?? attachment.sourceUrl ?? "#"} target="_blank" rel="noreferrer">Open source</a>}
        </div>
      ))}
    </div>
  );
}

function attachmentIcon(attachment: MediaAttachment): JSX.Element {
  if (attachment.mimeType?.startsWith("audio/") || attachment.mediaType === "ptt" || attachment.mediaType === "audio") {
    return <Mic size={14} />;
  }
  return <FileText size={14} />;
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
  const candidates = [
    result?.toolCalls,
    result?.tool_calls,
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
    calls.push({ name, args: record.args ?? record.arguments ?? {}, result: record.result ?? record.output ?? null });
  }
  return calls;
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

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
