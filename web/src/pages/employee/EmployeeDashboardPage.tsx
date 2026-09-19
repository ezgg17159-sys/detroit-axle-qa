import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { QualityTrendChart } from "../../components/QualityTrendChart";
import { defaultAnalyticsRange, type DateRange } from "../../lib/dateRange";
import {
  buildEmployeeDashboardFromAudits,
  loadEmployeeAudits,
  resolveEmployeeIdentity,
  type EmployeeIdentity,
} from "../../lib/employeePortal";

export function EmployeeDashboardPage() {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<EmployeeIdentity | null>(null);
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(() =>
    buildEmployeeDashboardFromAudits([]),
  );
  useShellPageLoading(loading);

  useEffect(() => {
    let cancelled = false;
    void resolveEmployeeIdentity(user).then((resolved) => {
      if (!cancelled) setIdentity(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!identity) {
      setStats(buildEmployeeDashboardFromAudits([]));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadEmployeeAudits(identity, { start: range.start, end: range.end })
      .then((audits) => {
        if (!cancelled) setStats(buildEmployeeDashboardFromAudits(audits));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, range.start, range.end]);

  const greeting = useMemo(
    () => identity?.displayName || user?.full_name || "Employee",
    [identity, user],
  );

  if (!identity && !loading) return null;

  return (
    <main className="employee-page" aria-label="Dashboard">
      <div className="employee-page__toolbar">
        <div>
          <h2 className="employee-page__greeting">Welcome, {greeting}</h2>
          <p className="employee-page__hint">Your quality overview</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section className="employee-kpi-grid" aria-label="Summary">
        <article className="employee-kpi-card">
          <span className="employee-kpi-card__label">Avg quality</span>
          <strong className="employee-kpi-card__value">
            {stats.avgQuality == null ? "—" : `${stats.avgQuality}%`}
          </strong>
        </article>
        <article className="employee-kpi-card">
          <span className="employee-kpi-card__label">Total audits</span>
          <strong className="employee-kpi-card__value">{stats.totalAudits}</strong>
        </article>
      </section>

      <section className="employee-chart-card" aria-label="Quality trend">
        <header className="employee-chart-card__header">
          <h3 className="employee-chart-card__title">Quality trend</h3>
          <p className="employee-chart-card__subtitle">QA score over the selected range</p>
        </header>
        <QualityTrendChart points={stats.chartPoints} labels={stats.chartLabels} />
      </section>
    </main>
  );
}
