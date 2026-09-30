import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../components/DateRangePicker";
import { PerformanceTrendChart } from "../components/PerformanceTrendChart";
import { useShellPageLoading } from "../components/PageLoadingContext";
import { useScopedTeamFilter } from "../hooks/useScopedTeamFilter";
import { defaultAnalyticsRange, toIsoDate, type DateRange } from "../lib/dateRange";
import { matchesAgentSearch } from "../lib/audits";
import { fetchAgents, fetchReports, fetchReportsExport, type ReportsKpi } from "../lib/externalApi";
import { downloadQaReportWorkbook } from "../lib/qaReportExport";
import { useNotify } from "../notifications/NotificationContext";

type TeamFilter = "all" | "calls" | "tickets" | "live-chat" | "sales";

type AgentOption = {
  id: string;
  name: string;
  alias: string;
  agentName?: string;
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

const exportPeriodOptions: Array<{ id: "months" | "weeks"; label: string }> = [
  { id: "months", label: "Months" },
  { id: "weeks", label: "Weeks" },
];

const EMPTY_KPIS: KpiCard[] = [
  { id: "total-audits", label: "Total Audits", value: "—" },
  { id: "calls", label: "Calls Avg", value: "—" },
  { id: "tickets", label: "Tickets Avg", value: "—" },
  { id: "live-chat", label: "Live Chat Avg", value: "—" },
  { id: "sales", label: "Sales Avg", value: "—" },
];

function teamLabel(team: TeamFilter): string {
  return teamOptions.find((option) => option.id === team)?.label ?? "All teams";
}

function mergeKpis(live: ReportsKpi[]): KpiCard[] {
  const byId = new Map(live.map((row) => [row.id, row]));
  return EMPTY_KPIS.map((fallback) => {
    const row = byId.get(fallback.id);
    return row
      ? { ...fallback, label: row.label || fallback.label, value: row.value }
      : fallback;
  });
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
    if (!query.trim()) return [];
    return pool.filter((agent) => matchesAgentSearch(agent, query));
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
                      {[agent.agentName, agent.alias, teamLabel(agent.team)]
                        .filter(Boolean)
                        .join(" · ")}
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
  labelId = "reports-filter-label",
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
  labelId?: string;
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
      <span className="reports-filter__label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className={`reports-filter__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
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
        <div className="reports-filter__menu" role="listbox" aria-labelledby={labelId}>
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
  const [team, setTeam, teamScope] = useScopedTeamFilter("all");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [kpis, setKpis] = useState<KpiCard[]>(EMPTY_KPIS);
  const [trendPoints, setTrendPoints] = useState<number[]>([]);
  const [trendLabels, setTrendLabels] = useState<string[]>([]);
  const [loadDetail, setLoadDetail] = useState("");
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);

  useEffect(() => {
    void fetchAgents({ team: team === "all" ? "all" : team })
      .then((payload) => {
        if (!payload.connected) return;
        setAgents(
          payload.agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            alias: agent.alias,
            agentName: agent.agentName || "",
            team: (agent.team === "tickets" ||
            agent.team === "live-chat" ||
            agent.team === "sales"
              ? agent.team
              : "calls") as Exclude<TeamFilter, "all">,
          })),
        );
      })
      .catch(() => {
        /* keep empty agent list */
      });
  }, [team]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchReports({
      start: toIsoDate(range.start) || undefined,
      end: toIsoDate(range.end) || undefined,
      team,
      agentIds: selectedAgentIds,
    })
      .then((payload) => {
        if (cancelled) return;
        setKpis(mergeKpis(payload.kpis));
        setTrendPoints(payload.trendPoints);
        setTrendLabels(payload.trendLabels);
        setLoadDetail(
          payload.connected ? "" : payload.detail || "External database disconnected.",
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setKpis(EMPTY_KPIS);
        setTrendPoints([]);
        setTrendLabels([]);
        setLoadDetail(error instanceof Error ? error.message : "Unable to load reports.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, team, selectedAgentIds]);

  const visibleKpis = useMemo(() => {
    if (team === "all") return kpis;
    return kpis.filter((card) => card.id === "total-audits" || card.id === team);
  }, [team, kpis]);

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  );

  const trendTitle = useMemo(() => {
    if (selectedAgents.length === 1) {
      const agent = selectedAgents[0];
      return `${agent.name} performance trend`;
    }
    if (selectedAgents.length > 1) {
      return `Selected agents performance trend`;
    }
    if (team !== "all") {
      return `${teamLabel(team)} performance trend`;
    }
    return "Performance trend";
  }, [selectedAgents, team]);

  const trendMeta = useMemo(() => {
    if (selectedAgents.length === 1) {
      const agent = selectedAgents[0];
      const bits = [agent.agentName || agent.alias, teamLabel(agent.team)].filter(Boolean);
      return bits.join(" · ");
    }
    if (selectedAgents.length > 1) {
      const names = selectedAgents
        .slice(0, 3)
        .map((agent) => agent.name)
        .join(", ");
      const extra =
        selectedAgents.length > 3 ? ` +${selectedAgents.length - 3} more` : "";
      return `${names}${extra}`;
    }
    if (team === "all") return "All teams in selected range";
    return `Showing ${teamLabel(team)} only`;
  }, [selectedAgents, team]);

  const handleTeamChange = (next: TeamFilter) => {
    if (teamScope.locked) return;
    setTeam(next);
    if (next === "all") return;
    setSelectedAgentIds((current) =>
      current.filter((id) => agents.find((agent) => agent.id === id)?.team === next),
    );
  };

  const [exporting, setExporting] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<"months" | "weeks">("weeks");

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const payload = await fetchReportsExport({
        start: toIsoDate(range.start) || undefined,
        end: toIsoDate(range.end) || undefined,
        team,
        agentIds: selectedAgentIds,
        period: exportPeriod,
      });
      if (!payload.connected) {
        notify(payload.detail || "External database disconnected. Export unavailable.", {
          variant: "error",
        });
        return;
      }
      await downloadQaReportWorkbook(payload);
      notify(
        exportPeriod === "months" ? "Monthly report exported." : "Weekly report exported.",
        { variant: "success" },
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to export report.", {
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
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
            label={teamScope.locked ? "Team" : "Filter by team"}
            labelId="reports-team-label"
            value={team}
            options={
              teamScope.locked && teamScope.scope
                ? teamOptions.filter((option) => option.id === teamScope.scope)
                : teamOptions
            }
            onChange={(value) => handleTeamChange(value as TeamFilter)}
          />
        </div>

        <div className="reports-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <FilterSelect
            label="Export by"
            labelId="reports-export-period-label"
            value={exportPeriod}
            options={exportPeriodOptions}
            onChange={(value) =>
              setExportPeriod(value === "months" ? "months" : "weeks")
            }
          />
          <button
            type="button"
            className="cases-add-btn"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>

      {loadDetail ? (
        <p className="audits-page__hint" role="status">
          {loadDetail}
        </p>
      ) : null}

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
          <p className="reports-trend__meta">{trendMeta}</p>
        </div>
        <div className="reports-trend__chart">
          <PerformanceTrendChart
            key={`${team}|${selectedAgentIds.join(",")}|${toIsoDate(range.start)}|${toIsoDate(range.end)}|${trendPoints.join(",")}`}
            points={trendPoints}
            labels={trendLabels}
            emptyMessage={
              selectedAgentIds.length > 0
                ? "No performance data for the selected agents in this range"
                : team === "all"
                  ? "No performance data for this range"
                  : `No ${teamLabel(team).toLowerCase()} performance data for this range`
            }
          />
        </div>
      </section>
    </main>
  );
}
