import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../components/DateRangePicker";
import { PerformanceTrendChart } from "../components/PerformanceTrendChart";
import { defaultAnalyticsRange, type DateRange } from "../lib/dateRange";
import { useNotify } from "../notifications/NotificationContext";

type TeamFilter = "all" | "calls" | "tickets" | "live-chat" | "sales";

type AgentOption = {
  id: string;
  name: string;
  alias: string;
  team: Exclude<TeamFilter, "all">;
};

type KpiCard = {
  id: "total-audits" | "calls" | "tickets" | "live-chat" | "sales";
  label: string;
  value: string;
};

const teamOptions: Array<{ id: TeamFilter; label: string }> = [
  { id: "all", label: "All teams" },
  { id: "calls", label: "Calls" },
  { id: "tickets", label: "Tickets" },
  { id: "live-chat", label: "Live Chat" },
  { id: "sales", label: "Sales" },
];

const allKpis: KpiCard[] = [
  { id: "total-audits", label: "Total Audits", value: "—" },
  { id: "calls", label: "Calls Avg", value: "—" },
  { id: "tickets", label: "Tickets Avg", value: "—" },
  { id: "live-chat", label: "Live Chat Avg", value: "—" },
  { id: "sales", label: "Sales Avg", value: "—" },
];

function teamLabel(team: TeamFilter): string {
  return teamOptions.find((option) => option.id === team)?.label ?? "All teams";
}

function AgentSearch({
  agents,
  team,
  selectedIds,
  onChange,
}: {
  agents: AgentOption[];
  team: TeamFilter;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const pool = useMemo(
    () => (team === "all" ? agents : agents.filter((agent) => agent.team === team)),
    [agents, team],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pool.filter(
      (agent) =>
        agent.name.toLowerCase().includes(q) ||
        agent.alias.toLowerCase().includes(q),
    );
  }, [pool, query]);

  const emptyMessage = !query.trim()
    ? "Type to search agents"
    : "No agents found";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleAgent = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((current) => current !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="reports-search" ref={rootRef}>
      <span className="reports-search__label" id="reports-search-label">
        Search
      </span>
      <div className={`reports-search__field${open ? " is-open" : ""}`}>
        <svg
          className="reports-search__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="M20 20l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          className="reports-search__input"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="reports-agent-list"
          aria-autocomplete="list"
          aria-labelledby="reports-search-label"
          placeholder={
            selectedIds.length
              ? `${selectedIds.length} agent${selectedIds.length === 1 ? "" : "s"} selected`
              : "Search agents, aliases…"
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open ? (
        <div
          className="reports-search__menu"
          id="reports-agent-list"
          role="listbox"
          aria-multiselectable="true"
        >
          {matches.length === 0 ? (
            <p className="reports-search__empty">{emptyMessage}</p>
          ) : (
            matches.map((agent) => {
              const checked = selectedIds.includes(agent.id);
              return (
                <label
                  key={agent.id}
                  className={`reports-search__option${checked ? " is-checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="reports-search__checkbox"
                    checked={checked}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  <span className="reports-search__option-text">
                    <span className="reports-search__option-name">{agent.name}</span>
                    <span className="reports-search__option-meta">
                      {agent.alias} · {teamLabel(agent.team)}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TeamFilter;
  options: Array<{ id: TeamFilter; label: string }>;
  onChange: (value: TeamFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="reports-filter" ref={rootRef}>
      <span className="reports-filter__label" id="reports-team-label">
        {label}
      </span>
      <button
        type="button"
        className={`reports-filter__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="reports-team-label"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="reports-filter__value">{selected}</span>
        <svg
          className="reports-filter__chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <polyline
            points="6 9 12 15 18 9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="reports-filter__menu" role="listbox" aria-labelledby="reports-team-label">
          {options.map((option) => {
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`reports-filter__option${isActive ? " is-active" : ""}`}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const { notify } = useNotify();
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamFilter>("all");

  // Populated from API when agent search is wired
  const agents = useMemo<AgentOption[]>(() => [], []);

  const visibleKpis = useMemo(() => {
    if (team === "all") return allKpis;
    return allKpis.filter((card) => card.id === "total-audits" || card.id === team);
  }, [team]);

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  );

  const trendTitle =
    team === "all" ? "Performance trend" : `${teamLabel(team)} performance trend`;

  const handleTeamChange = (next: TeamFilter) => {
    setTeam(next);
    if (next === "all") return;
    setSelectedAgentIds((current) =>
      current.filter((id) => agents.find((agent) => agent.id === id)?.team === next),
    );
  };

  const handleExport = () => {
    // Template will be provided later — export scope already follows active filters.
    const teamsIncluded =
      team === "all" ? (["calls", "tickets", "live-chat", "sales"] as const) : ([team] as const);
    void {
      range,
      team,
      teamsIncluded,
      agentIds: selectedAgentIds,
      agents: selectedAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        alias: agent.alias,
        team: agent.team,
      })),
      kpis: visibleKpis.map((card) => card.id),
    };

    const agentNote =
      selectedAgentIds.length === 0
        ? "all agents"
        : `${selectedAgentIds.length} selected agent${selectedAgentIds.length === 1 ? "" : "s"}`;

    notify(
      team === "all"
        ? `Export will include ${agentNote} across all teams (template pending).`
        : `Export will include ${agentNote} for ${teamLabel(team)} only (template pending).`,
      { variant: "info" },
    );
  };

  return (
    <main className="reports-page" aria-label="Reports">
      <div className="reports-page__toolbar">
        <div className="reports-page__controls">
          <AgentSearch
            agents={agents}
            team={team}
            selectedIds={selectedAgentIds}
            onChange={setSelectedAgentIds}
          />

          <FilterSelect
            label="Filter by team"
            value={team}
            options={teamOptions}
            onChange={handleTeamChange}
          />

          <div className="reports-export">
            <span className="reports-export__label" aria-hidden="true">
              Export
            </span>
            <button type="button" className="reports-export__btn" onClick={handleExport}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3v12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M7 10l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 19h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Export
            </button>
          </div>
        </div>

        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section
        className={`reports-kpi-grid reports-kpi-grid--${visibleKpis.length}`}
        aria-label="Report summary"
      >
        {visibleKpis.map((card) => (
          <article key={card.id} className="reports-kpi-card">
            <p className="reports-kpi-card__label">{card.label}</p>
            <p className="reports-kpi-card__value">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="reports-trend" aria-label={trendTitle}>
        <div className="reports-trend__header">
          <h2 className="reports-trend__title">{trendTitle}</h2>
          <p className="reports-trend__meta">
            {selectedAgentIds.length > 0
              ? `${selectedAgentIds.length} agent${selectedAgentIds.length === 1 ? "" : "s"} selected`
              : team === "all"
                ? "All teams in selected range"
                : `Showing ${teamLabel(team)} only`}
          </p>
        </div>
        <div className="reports-trend__chart">
          <PerformanceTrendChart
            emptyMessage={
              team === "all"
                ? "No performance data for this range"
                : `No ${teamLabel(team).toLowerCase()} performance data for this range`
            }
          />
        </div>
      </section>
    </main>
  );
}
