import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BrainCircuit,
  Building2,
  CalendarCheck,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Command,
  Copy,
  Crosshair,
  ExternalLink,
  Globe2,
  Layers3,
  Loader2,
  Mail,
  MessageSquare,
  Network,
  Orbit,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { api, setToken } from "./lib/api";
import type { Mission, Screen } from "./lib/types";

const DEFAULT_GOAL =
  "Find 50 SaaS companies in the USA with 50–500 employees that could benefit from our AI automation platform.";
const navigation = [
  { id: "mission", label: "Revenue Mission", icon: Crosshair },
  { id: "command", label: "AI Command Center", icon: Activity },
  { id: "intelligence", label: "Lead Intelligence", icon: BrainCircuit },
  { id: "result", label: "Mission Result", icon: CircleCheck },
] as const;
const phaseNames = [
  "Discovering opportunities",
  "Qualifying companies",
  "Writing your introduction",
  "Preparing outreach",
  "Listening for a reply",
  "Choosing the next action",
];
const planIcons = [Search, BrainCircuit, Mail, CalendarCheck];

function App() {
  const [screen, setScreen] = useState<Screen>("mission");
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [mission, setMission] = useState<Mission | null>(null);
  const [config, setConfig] = useState<{
    demo: boolean;
    graph8_url: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [eventType, setEventType] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [listId, setListId] = useState("");
  const advancing = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  useEffect(() => {
    void initialize();
  }, []);
  async function initialize() {
    try {
      const c = await api.config();
      setConfig(c);
      const saved = localStorage.getItem("autopilot-mission");
      if (saved && c.demo) {
        const m = await api.mission(saved);
        setMission(m);
        setGoal(m.goal);
        setScreen(m.status === "ready" ? "mission" : "command");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function receive(m: Mission) {
    setMission(m);
    localStorage.setItem("autopilot-mission", m.id);
  }
  async function perform(action: () => Promise<Mission>, next?: Screen) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      receive(result);
      setGoal(result.goal);
      if (next) setScreen(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !mission ||
      error ||
      busy ||
      !["running", "waiting_reply"].includes(mission.status)
    )
      return;
    const timer = setTimeout(
      async () => {
        if (advancing.current) return;
        advancing.current = true;
        try {
          const next = await api.run(mission.id, "advance");
          receive(next);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          advancing.current = false;
        }
      },
      mission.status === "waiting_reply" ? 15000 : 1100,
    );
    return () => clearTimeout(timer);
  }, [mission, error, busy]);
  const isRunning = mission?.status === "running";
  const pending = mission?.status === "awaiting_approval";
  const completed = mission?.status === "complete";
  const lead = mission?.lead;
  const demo = config?.demo ?? true;
  function newMission() {
    setMission(null);
    setScreen("mission");
    setError("");
    localStorage.removeItem("autopilot-mission");
  }
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(lead?.message?.body ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the message text.",
      );
    }
  }
  function approve() {
    if (!mission) return;
    void perform(
      () =>
        api.run(
          mission.id,
          "approve",
          demo
            ? {}
            : {
                booking: {
                  event_type_id: Number(eventType),
                  start_time: new Date(bookingTime).toISOString(),
                  time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
              },
        ),
      "result",
    );
  }
  const statusText = completed
    ? "Mission complete"
    : pending
      ? "Approval needed"
      : mission?.status === "paused"
        ? "Mission paused"
        : mission?.status === "awaiting_outreach"
          ? "Review outreach"
          : mission?.status === "waiting_reply"
            ? "Listening for replies"
            : isRunning
              ? "Agents working"
              : mission
                ? "Ready to launch"
                : "Ready when you are";

  function approval() {
    return (
      <Card className="approval-card">
        <div className="section-label">
          <CalendarCheck size={16} /> NEXT BEST ACTION{" "}
          <span className="tag lime">YOUR CALL</span>
        </div>
        <h3>
          {lead?.recommendation?.action === "BOOK_MEETING"
            ? "Turn interest into a conversation."
            : "Review the recommended action."}
        </h3>
        <p>{lead?.recommendation?.reason}</p>
        {mission?.action_in_flight && (
          <p className="caveat">
            A previous action has an unconfirmed outcome.{" "}
            <a href={mission.graph8_url} target="_blank" rel="noreferrer">
              Review in Graph8
            </a>{" "}
            before taking further action.
          </p>
        )}
        {!demo && lead?.recommendation?.action === "BOOK_MEETING" && (
          <div className="booking-fields">
            <label>
              Graph8 event type ID
              <input
                type="number"
                min="1"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              />
            </label>
            <label>
              Agreed meeting time (your local time)
              <input
                type="datetime-local"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-6">
          {lead?.recommendation?.action === "BOOK_MEETING" ? (
            <Button
              disabled={
                busy ||
                !!mission?.action_in_flight ||
                (!demo && (!eventType || !bookingTime))
              }
              onClick={approve}
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <CalendarCheck size={16} />
              )}
              Approve & book meeting
              <ArrowUpRight size={16} />
            </Button>
          ) : (
            <Button asChild>
              <a href={mission?.graph8_url} target="_blank" rel="noreferrer">
                Review in Graph8
                <ExternalLink size={15} />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              mission && void perform(() => api.run(mission.id, "decline"))
            }
          >
            Decline
          </Button>
        </div>
        <small>
          <ShieldCheck size={13} />
          {demo
            ? "Demo action · No real invitation will be sent"
            : "Graph8 executes only after your approval"}
        </small>
      </Card>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("mission");
          }}
        >
          <span className="brand-mark">
            <Orbit size={25} />
          </span>
          <span>
            autopilot<span className="brand-ai">AI</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">R</span>
          <div>
            Revenue workspace<small>AI-powered growth</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={`nav-item ${screen === item.id ? "active" : ""}`}
              aria-current={screen === item.id ? "page" : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "intelligence" && pending ? (
                <span className="nav-count">1</span>
              ) : (
                <span className="nav-number">0{index + 1}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-card">
            <div className="flex items-center gap-2">
              <Network size={17} />
              <strong>Built on Graph8</strong>
              <span className="workspace-dot" />
            </div>
            <p>
              The revenue engine.
              <br />
              We bring the intelligence.
            </p>
            <a
              href="https://docs.graph8.com/developers/"
              target="_blank"
              rel="noreferrer"
            >
              Explore the infrastructure
              <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="profile">
            <span className="profile-avatar">YO</span>
            <div>
              Your workspace<small>Hackathon edition</small>
            </div>
            <Sparkles size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={13} />
            <span>{navigation.find((n) => n.id === screen)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="mode">
              <span className="status-dot" />
              {config
                ? demo
                  ? "Demo environment"
                  : "Live environment"
                : "Connecting"}
            </span>
            <span className="topbar-divider" />
            <span className="key-hint">
              <Command size={13} /> AI-first. Human-led.
            </span>
          </div>
        </header>
        <main>
          <div className="page-top">
            <div className="eyebrow">
              <span className="tiny-line" />
              AI REVENUE AUTOPILOT
            </div>
            <span className="mission-id">
              {mission
                ? `MISSION / ${mission.id.slice(0, 8).toUpperCase()}`
                : "YOUR NEXT OPPORTUNITY STARTS HERE"}
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <div>
                <strong>Let’s get you back on track</strong>
                <p>{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError("");
                  if (mission) void perform(() => api.mission(mission.id));
                  else void initialize();
                }}
              >
                <RotateCcw size={14} />
                Retry / refresh
              </Button>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {!demo && !mission && (
            <Card className="token-card">
              <ShieldCheck size={20} />
              <label>
                Local access token{" "}
                <input
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setToken(e.target.value);
                  }}
                  placeholder="AUTOPILOT_API_TOKEN"
                />
              </label>
              {localStorage.getItem("autopilot-mission") && (
                <Button
                  variant="outline"
                  disabled={busy || !accessToken}
                  onClick={() =>
                    void perform(
                      () =>
                        api.mission(localStorage.getItem("autopilot-mission")!),
                      "command",
                    )
                  }
                >
                  Restore mission
                </Button>
              )}
              <small>Kept in memory. Provider keys stay on the server.</small>
            </Card>
          )}

          {screen === "mission" && (
            <section className="page-enter">
              <div className="hero-heading">
                <div>
                  <h1>
                    A goal is all you need.
                    <br />
                    <span>Let AI find the way.</span>
                  </h1>
                  <p>
                    From the right prospects to the next conversation.
                    <br className="desktop-break" /> Give your revenue team an
                    intelligent copilot.
                  </p>
                </div>
                <div className="orb-illustration" aria-hidden="true">
                  <div className="orbit-ring ring-one" />
                  <div className="orbit-ring ring-two" />
                  <div className="orbit-ring ring-three" />
                  <div className="orb-core">
                    <Sparkles size={35} />
                  </div>
                  <span className="orb-satellite sat-one">
                    <Search size={15} />
                  </span>
                  <span className="orb-satellite sat-two">
                    <Mail size={15} />
                  </span>
                  <span className="orb-satellite sat-three">
                    <CalendarCheck size={15} />
                  </span>
                </div>
              </div>
              <div className="mission-grid">
                <div>
                  <Card className="goal-card">
                    <div className="card-heading">
                      <div className="flex items-center gap-2">
                        <Target size={18} />
                        <h2>Your revenue mission</h2>
                      </div>
                      <span className="tag">01 / THE GOAL</span>
                    </div>
                    <label htmlFor="goal" className="input-label">
                      What would you like to achieve?
                    </label>
                    <textarea
                      id="goal"
                      value={goal}
                      onChange={(e) => {
                        setGoal(e.target.value);
                      }}
                      maxLength={2000}
                      disabled={busy || !!mission}
                      placeholder="Describe your ideal customer and what you want to achieve…"
                    />
                    <div className="goal-footer">
                      <span>
                        <Sparkles size={14} />
                        Think outcome. We’ll handle the steps.
                      </span>
                      <span>{goal.length}/2000</span>
                    </div>
                    <div className="suggestions">
                      <span>TRY A MISSION</span>
                      <button
                        disabled={!!mission || busy}
                        onClick={() => setGoal(DEFAULT_GOAL)}
                      >
                        Find my next 50 customers
                        <ArrowUpRight size={12} />
                      </button>
                    </div>
                    <div className="goal-actions">
                      <small>
                        <ShieldCheck size={14} />
                        {demo
                          ? "Safe to explore. All actions are simulated."
                          : "Review the plan before starting."}
                      </small>
                      {mission ? (
                        <Button
                          variant="outline"
                          onClick={newMission}
                          disabled={busy || isRunning}
                        >
                          New mission
                          <RotateCcw size={15} />
                        </Button>
                      ) : (
                        <Button
                          onClick={() => void perform(() => api.plan(goal))}
                          disabled={busy || goal.trim().length < 12 || !config}
                        >
                          {busy ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                          Generate AI plan
                          <ArrowRight size={16} />
                        </Button>
                      )}
                    </div>
                  </Card>
                  {mission && (
                    <Card className="plan-card">
                      <div className="card-heading">
                        <div className="flex items-center gap-2">
                          <BrainCircuit size={18} />
                          <h2>Your AI mission plan</h2>
                        </div>
                        <span className="tag lime">READY</span>
                      </div>
                      <p>{mission.plan.summary}</p>
                      <div className="filter-chips">
                        <span>{mission.plan.industry}</span>
                        <span>{mission.plan.country}</span>
                        <span>
                          {mission.plan.min_employees}–
                          {mission.plan.max_employees} employees
                        </span>
                        <span>{mission.plan.target} target companies</span>
                      </div>
                      <div className="plan-steps">
                        {mission.plan.steps.map((step, i) => (
                          <div key={step}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            {step}
                            <Check size={15} />
                          </div>
                        ))}
                      </div>
                      <div className="goal-actions">
                        <small>
                          AI plans. Graph8 executes. You stay in control.
                        </small>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            mission.status === "ready"
                              ? void perform(
                                  () => api.run(mission.id, "start"),
                                  "command",
                                )
                              : setScreen("command")
                          }
                        >
                          {busy ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Play size={15} />
                          )}{" "}
                          {mission.status === "ready"
                            ? "Start Mission"
                            : "View mission"}
                          <ArrowRight size={15} />
                        </Button>
                      </div>
                    </Card>
                  )}
                </div>
                <Card className="how-card">
                  <div className="section-label">FROM INTENT TO IMPACT</div>
                  <h3>
                    One mission. <br />
                    An intelligent team.
                  </h3>
                  <div className="how-steps">
                    {[
                      {
                        title: "You set the direction",
                        desc: "Describe your ideal outcome.",
                      },
                      {
                        title: "AI connects the dots",
                        desc: "Research, reason, and personalize.",
                      },
                      {
                        title: "Graph8 makes it happen",
                        desc: "Discover, reach out, and book.",
                      },
                    ].map((item, i) => (
                      <div key={item.title}>
                        <span className="step-number">0{i + 1}</span>
                        <div>
                          <h4>{item.title}</h4>
                          <p>{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="human-note">
                    <ShieldCheck size={17} />
                    <span>
                      Autonomous intelligence.
                      <br />
                      <strong>Human control, always.</strong>
                    </span>
                  </div>
                </Card>
              </div>
              <div className="capability-strip">
                {[
                  { icon: Search, label: "Discover with precision" },
                  { icon: BrainCircuit, label: "Qualify with context" },
                  { icon: Mail, label: "Make it personal" },
                  { icon: CalendarCheck, label: "Move conversations forward" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label}>
                    <Icon size={18} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="bottom-note">
                <span>INTELLIGENCE BY OPENAI</span>
                <span className="tiny-dot" />
                <span>REVENUE INFRASTRUCTURE BY GRAPH8</span>
              </div>
            </section>
          )}

          {screen === "command" && (
            <section className="page-enter">
              <div className="page-heading">
                <div>
                  <h1>Your mission, in motion.</h1>
                  <p>A front-row seat to every decision your AI makes.</p>
                </div>
                <span className={`status-pill ${isRunning ? "live" : ""}`}>
                  <span className="status-dot" />
                  {statusText}
                </span>
              </div>
              {!mission ? (
                <EmptyState
                  icon={Activity}
                  title="Your agents are on standby"
                  text="Create a revenue mission to see your AI team in action."
                  action={() => setScreen("mission")}
                />
              ) : (
                <>
                  <div className="command-grid">
                    <Card className="mission-control">
                      <div className="card-heading">
                        <span className="section-label">MISSION CONTROL</span>
                        <span className="tag">
                          {demo ? "SIMULATION" : "LIVE"}
                        </span>
                      </div>
                      <h3>{mission.goal}</h3>
                      <div className="progress-label">
                        <span>{statusText}</span>
                        <strong>{mission.progress}%</strong>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label="Mission progress"
                        aria-valuenow={mission.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div style={{ width: `${mission.progress}%` }} />
                      </div>
                      <div className="phase-track">
                        {[
                          "Discover",
                          "Qualify",
                          "Personalize",
                          "Engage",
                          "Convert",
                        ].map((name, i) => (
                          <div
                            className={
                              mission.progress >= (i + 1) * 20 ? "done" : ""
                            }
                            key={name}
                          >
                            <span>
                              {mission.progress >= (i + 1) * 20 ? (
                                <Check size={12} />
                              ) : (
                                i + 1
                              )}
                            </span>
                            {name}
                          </div>
                        ))}
                      </div>
                      <div className="current-action">
                        <span
                          className={`action-icon ${isRunning ? "pulsing" : ""}`}
                        >
                          <BrainCircuit size={23} />
                        </span>
                        <div>
                          <small>CURRENT AI ACTION</small>
                          <strong>
                            {pending
                              ? "Waiting for your go-ahead"
                              : completed
                                ? "Mission accomplished"
                                : mission.status === "paused"
                                  ? "Action declined — mission paused"
                                  : mission.status === "awaiting_outreach"
                                    ? "Ready for sequence enrollment"
                                    : mission.status === "waiting_reply"
                                      ? "Listening for a real Graph8 reply"
                                      : phaseNames[mission.stage]}
                          </strong>
                        </div>
                        {isRunning && (
                          <AudioLines className="text-primary" size={22} />
                        )}
                      </div>
                    </Card>
                    <Card className="agent-team">
                      <div className="section-label">YOUR AI TEAM</div>
                      {[
                        {
                          name: "Discovery agent",
                          role: "Graph8 prospect search",
                          active: mission.stage === 0,
                        },
                        {
                          name: "Intelligence agent",
                          role: "Qualification & scoring",
                          active: mission.stage === 1,
                        },
                        {
                          name: "Conversation agent",
                          role: "Personalization & reply analysis",
                          active: mission.stage >= 2 && mission.stage <= 4,
                        },
                        {
                          name: "Strategy agent",
                          role: "The next best action",
                          active: mission.stage === 5,
                        },
                      ].map((a, i) => {
                        const Icon = planIcons[i];
                        return (
                          <div className="agent-row" key={a.name}>
                            <span
                              className={
                                a.active && isRunning
                                  ? "agent-icon active"
                                  : "agent-icon"
                              }
                            >
                              <Icon size={18} />
                            </span>
                            <div>
                              <strong>{a.name}</strong>
                              <small>{a.role}</small>
                            </div>
                            <span
                              className={`agent-dot ${a.active && isRunning ? "on" : ""}`}
                            />
                          </div>
                        );
                      })}
                      <div className="agent-team-foot">
                        <Layers3 size={14} /> One shared goal. Coordinated
                        intelligence.
                      </div>
                    </Card>
                  </div>
                  <div className="command-lower">
                    <Card className="activity-card">
                      <div className="card-heading">
                        <h2>Live activity</h2>
                        <span className="section-label">
                          <span className="status-dot" />
                          {mission.events.length} EVENTS
                        </span>
                      </div>
                      <div className="activity-feed" aria-live="polite">
                        {[...mission.events].reverse().map((item, i) => (
                          <div
                            className={`event-row ${i === 0 ? "latest" : ""}`}
                            key={item.id}
                          >
                            <span className="event-check">
                              {i === 0 && isRunning ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Check size={13} />
                              )}
                            </span>
                            <div>
                              <div className="event-title">
                                <strong>{item.title}</strong>
                                <time>
                                  {new Date(item.time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </time>
                              </div>
                              <p>{item.detail}</p>
                              <span className="event-agent">{item.agent}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                    <div>
                      {pending ? (
                        approval()
                      ) : (
                        <Card className="insight-preview">
                          <span className="section-label">
                            <Sparkles size={15} /> INTELLIGENCE SPOTLIGHT
                          </span>
                          {lead?.score ? (
                            <>
                              <div className="mini-score">
                                {lead.score.score}
                                <span>/100</span>
                              </div>
                              <h3>{lead.company}</h3>
                              <p>{lead.score.reasons[0]}</p>
                              <Button
                                variant="outline"
                                className="w-full mt-6"
                                onClick={() => setScreen("intelligence")}
                              >
                                Explore lead intelligence
                                <ArrowRight size={15} />
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="spotlight-visual">
                                <Crosshair size={52} />
                              </div>
                              <h3>Finding your best-fit opportunity</h3>
                              <p>
                                Your strongest lead will appear here as the
                                qualification agent uncovers it.
                              </p>
                            </>
                          )}
                        </Card>
                      )}
                      {mission.status === "awaiting_outreach" && (
                        <Button
                          className="w-full mt-4"
                          onClick={() => setScreen("intelligence")}
                        >
                          Review personalized outreach
                          <ArrowRight size={16} />
                        </Button>
                      )}
                      {completed && (
                        <Button
                          className="w-full mt-4"
                          onClick={() => setScreen("result")}
                        >
                          View mission result
                          <ArrowRight size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {screen === "intelligence" && (
            <section className="page-enter">
              <div className="page-heading">
                <div>
                  <h1>Beyond a name. A reason.</h1>
                  <p>The context behind your next best conversation.</p>
                </div>
                {lead?.score && (
                  <span className="status-pill">
                    <Sparkles size={14} />
                    TOP OPPORTUNITY
                  </span>
                )}
              </div>
              {!lead?.score ? (
                <EmptyState
                  icon={BrainCircuit}
                  title="Intelligence is on its way"
                  text="Start a mission. Your top qualified prospect and the reasoning behind its score will appear here."
                  action={() => setScreen(mission ? "command" : "mission")}
                />
              ) : (
                <>
                  <div className="lead-grid">
                    <Card className="lead-profile">
                      <div className="company-heading">
                        <span className="company-logo">
                          {lead.company.slice(0, 1)}
                        </span>
                        <div>
                          <h2>{lead.company}</h2>
                          <span>{lead.domain}</span>
                        </div>
                        <span className="tag lime">
                          {demo ? "DEMO PROSPECT" : "GRAPH8 DATA"}
                        </span>
                      </div>
                      <div className="company-meta">
                        <span>
                          <Building2 size={15} />
                          {lead.industry}
                        </span>
                        <span>
                          <Users size={15} />
                          {lead.employees} employees
                        </span>
                        <span>
                          <Globe2 size={15} />
                          {lead.location}
                        </span>
                      </div>
                      <div className="contact-person">
                        <span className="person-avatar">
                          {lead.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <strong>{lead.name}</strong>
                          <span>
                            {lead.role || "Contact details from Graph8"}
                          </span>
                        </div>
                        <Mail size={18} />
                      </div>
                      <div className="source-note">
                        <Network size={14} />
                        {demo
                          ? "Illustrative prospect · Graph8 demo fixture"
                          : "Prospect information from Graph8"}
                      </div>
                    </Card>
                    <Card className="score-card">
                      <div
                        className="score-ring"
                        style={
                          {
                            "--score": `${lead.score.score}%`,
                          } as React.CSSProperties
                        }
                      >
                        <div>
                          <strong>{lead.score.score}</strong>
                          <span>OUT OF 100</span>
                        </div>
                      </div>
                      <div>
                        <span className="section-label">AI FIT SCORE</span>
                        <h3>
                          {lead.score.qualified
                            ? "High-fit opportunity"
                            : "Needs more context"}
                        </h3>
                        <p>
                          Fit evaluated against your mission.
                          <br />
                          Every score comes with a reason.
                        </p>
                      </div>
                    </Card>
                  </div>
                  <div className="intelligence-grid">
                    <div>
                      <Card className="reasons-card">
                        <div className="card-heading">
                          <h2>
                            <BrainCircuit size={18} />
                            Why this company?
                          </h2>
                          <span className="tag">AI REASONING</span>
                        </div>
                        {lead.score.reasons.map((reason, i) => (
                          <div className="reason" key={reason}>
                            <span>0{i + 1}</span>
                            <p>{reason}</p>
                            <CheckCheck size={17} />
                          </div>
                        ))}
                        <p className="caveat">{lead.score.caveat}</p>
                      </Card>
                      <Card className="message-card">
                        <div className="card-heading">
                          <h2>
                            <Mail size={18} />A message that feels personal
                          </h2>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Copy personalized message"
                            disabled={!lead.message}
                            onClick={() => void copyMessage()}
                          >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                          </Button>
                        </div>
                        {lead.message ? (
                          <>
                            <div className="message-subject">
                              <span>SUBJECT</span>
                              {lead.message.subject}
                            </div>
                            <p className="message-body">{lead.message.body}</p>
                            <div className="message-foot">
                              <Sparkles size={13} /> AI-generated ·{" "}
                              {demo
                                ? "Demo message"
                                : "Personalized message · Review before outreach"}
                            </div>
                          </>
                        ) : (
                          <p className="empty-inline">
                            Your personalization agent is drafting an
                            introduction…
                          </p>
                        )}
                      </Card>
                    </div>
                    <div>
                      <Card className="reply-card">
                        <div className="card-heading">
                          <h2>
                            <MessageSquare size={18} />
                            Reading between the lines
                          </h2>
                        </div>
                        {lead.reply ? (
                          <>
                            <span className="section-label">
                              {demo
                                ? "SIMULATED PROSPECT REPLY"
                                : "PROSPECT REPLY"}
                            </span>
                            <blockquote>“{lead.reply}”</blockquote>
                            <div className="reply-analysis">
                              <span className="tag lime">
                                {lead.analysis?.classification}
                              </span>
                              <span>
                                {Math.round(
                                  (lead.analysis?.confidence ?? 0) * 100,
                                )}
                                % confidence
                              </span>
                            </div>
                            <p>{lead.analysis?.explanation}</p>
                          </>
                        ) : (
                          <div className="waiting-reply">
                            <MessageSquare size={28} />
                            <h4>Good conversations take two.</h4>
                            <p>
                              When a reply arrives, AI will understand its
                              intent and recommend what comes next.
                            </p>
                          </div>
                        )}
                      </Card>
                      {pending && approval()}
                      {mission?.status === "awaiting_outreach" && (
                        <Card className="approval-card">
                          <h3>Ready for Graph8 outreach</h3>
                          <p>
                            Approve the message shown here. Graph8 will save the
                            prospect and deliver it through your configured
                            sequence.
                          </p>
                          <label className="input-label">
                            Graph8 list ID
                            <input
                              type="number"
                              min="1"
                              value={listId}
                              onChange={(e) => setListId(e.target.value)}
                            />
                          </label>
                          {!lead.email && (
                            <p className="caveat">
                              No prospect email was returned. Enrich this
                              prospect in Graph8 before outreach.
                            </p>
                          )}
                          <Button
                            disabled={
                              busy ||
                              !!mission?.action_in_flight ||
                              !lead.email ||
                              !listId
                            }
                            onClick={() =>
                              mission &&
                              void perform(
                                () =>
                                  api.run(mission.id, "outreach", {
                                    list_id: Number(listId),
                                  }),
                                "command",
                              )
                            }
                          >
                            Approve sequence enrollment
                          </Button>
                          <Button variant="ghost" asChild>
                            <a
                              href={mission.graph8_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Graph8
                              <ExternalLink size={14} />
                            </a>
                          </Button>
                        </Card>
                      )}
                      {completed && (
                        <Card className="approval-card">
                          <CalendarCheck className="text-primary mb-4" />
                          <h3>
                            {mission.metrics.meetings
                              ? "The next conversation is set."
                              : "Mission complete."}
                          </h3>
                          <p>
                            {mission.metrics.meetings
                              ? "Your approved action has been completed."
                              : "Review the mission outcome."}
                          </p>
                          <Button
                            onClick={() => setScreen("result")}
                            className="mt-5"
                          >
                            View mission result
                            <ArrowRight size={15} />
                          </Button>
                        </Card>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {screen === "result" && (
            <section className="page-enter">
              {!completed ? (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Every mission has an outcome.</h1>
                      <p>
                        See what your AI team accomplished, all in one place.
                      </p>
                    </div>
                  </div>
                  <EmptyState
                    icon={CircleCheck}
                    title={
                      pending
                        ? "One decision away."
                        : "The story is still unfolding."
                    }
                    text={
                      pending
                        ? "Review the recommended next action to complete your mission."
                        : "Your mission result will be ready once the agents finish their work."
                    }
                    action={() =>
                      setScreen(
                        pending
                          ? "intelligence"
                          : mission
                            ? "command"
                            : "mission",
                      )
                    }
                  />
                </>
              ) : (
                <>
                  <div className="result-hero">
                    <span className="result-check">
                      <Check size={33} />
                    </span>
                    <span className="eyebrow">MISSION COMPLETE</span>
                    <h1>
                      From a goal to{" "}
                      <span>
                        {mission.metrics.meetings
                          ? "a real opportunity."
                          : "new intelligence."}
                      </span>
                    </h1>
                    <p>
                      {mission.metrics.meetings
                        ? "Your AI team found the fit, started the conversation, and moved it forward."
                        : "Your AI team evaluated the available prospects against your goal."}
                    </p>
                    {mission.booking && !demo && (
                      <span className="tag">
                        GRAPH8 BOOKING:{" "}
                        {String(mission.booking.status).toUpperCase()}
                      </span>
                    )}
                    {demo && (
                      <span className="tag">
                        DEMO RESULTS · SIMULATED ACTIONS
                      </span>
                    )}
                  </div>
                  <Card className="results-metrics">
                    {[
                      {
                        label: "Prospects found",
                        value: mission.metrics.found,
                        icon: Search,
                      },
                      {
                        label: "AI qualified",
                        value: mission.metrics.qualified,
                        icon: BrainCircuit,
                      },
                      {
                        label: demo ? "Outreach" : "Enrolled",
                        value: mission.metrics.outreach,
                        icon: Mail,
                      },
                      {
                        label: "Interested",
                        value: mission.metrics.interested,
                        icon: MessageSquare,
                      },
                      {
                        label: "Meetings",
                        value: mission.metrics.meetings,
                        icon: CalendarCheck,
                      },
                    ].map(({ label, value, icon: Icon }, i) => (
                      <div className={i === 4 ? "highlight" : ""} key={label}>
                        <Icon size={20} />
                        <strong>{value}</strong>
                        <span>{label}</span>
                        {i < 4 && (
                          <ChevronRight className="metric-arrow" size={18} />
                        )}
                      </div>
                    ))}
                  </Card>
                  <div className="result-bottom">
                    <Card className="result-summary">
                      <div className="section-label">
                        <Target size={15} /> THE MISSION
                      </div>
                      <h3>{mission.goal}</h3>
                      <div className="result-divider" />
                      <div className="flex items-center gap-3">
                        <CheckCheck size={23} className="text-primary" />
                        <div>
                          <strong>AI intelligence. Graph8 execution.</strong>
                          <p>
                            Every step connected, from discovery to decision.
                          </p>
                        </div>
                      </div>
                    </Card>
                    <Card className="handoff-card">
                      <Network size={28} />
                      <h3>
                        Your revenue journey
                        <br />
                        continues in Graph8.
                      </h3>
                      <p>
                        {demo
                          ? "Explore the revenue engine behind this demo. Demo records are not saved to your workspace."
                          : "Continue the conversation in your Graph8 workspace."}
                      </p>
                      <Button asChild>
                        <a
                          href={mission.graph8_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Graph8
                          <ArrowUpRight size={17} />
                        </a>
                      </Button>
                    </Card>
                  </div>
                  <div className="result-reset">
                    <Button variant="ghost" onClick={newMission}>
                      <RotateCcw size={15} />
                      Start a new mission
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
          <footer>
            <span>
              <Orbit size={13} /> Revenue moves with intelligence.
            </span>
            <span>YOU SET THE GOAL. AI FINDS THE WAY.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Activity;
  title: string;
  text: string;
  action: () => void;
}) {
  return (
    <Card className="empty-state">
      <span>
        <Icon size={34} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <Button onClick={action}>
        Go to mission
        <ArrowRight size={16} />
      </Button>
    </Card>
  );
}
export default App;
