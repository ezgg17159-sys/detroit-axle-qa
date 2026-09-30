from datetime import date, timedelta

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .analytics import fetch_analytics
from .action_center import fetch_action_center
from .catalog import list_agents, list_schema_tables
from .db import connection_status, external_connection, external_db_enabled
from .permissions import IsStaffOrReadOnly, IsStaffUser
from .queries import fetch_evaluation_progress, set_scheduled_day_off, toggle_day_off
from .portal_data import (
    list_agent_feedback,
    list_audit_edit_history,
    list_coachings,
    list_managed_users,
    list_supervisor_requests,
)
from .production import list_production
from .rankings import fetch_rankings
from .records import (
    delete_case_type,
    delete_team_metric,
    get_audit,
    list_audits,
    list_case_types,
    list_monitoring,
    list_team_metrics,
    upsert_case_type,
    upsert_team_metric,
)
from .report_export import fetch_report_export
from .reports import fetch_reports
from .writes import (
    add_supervisor_reply,
    delete_agent_feedback,
    delete_audit,
    delete_coaching,
    delete_managed_user,
    delete_monitoring,
    delete_supervisor_request,
    get_role_permissions,
    import_production_rows,
    insert_audit_edit_history,
    save_role_permissions,
    upsert_agent_feedback,
    upsert_audit,
    upsert_coaching,
    upsert_managed_user,
    upsert_monitoring,
    upsert_supervisor_request,
)

MAX_PRODUCTION_IMPORT_ROWS = 5000


def _exc_detail(exc: BaseException) -> str:
    if settings.DEBUG:
        return str(exc)
    return "Service temporarily unavailable."


def _actor_from_request(request) -> dict:
    user = request.user
    name = (
        f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
        or getattr(user, "username", "")
        or "QA System"
    )
    return {
        "userId": str(getattr(user, "id", "") or ""),
        "name": name,
        "email": getattr(user, "email", "") or "",
        "role": "admin" if getattr(user, "is_staff", False) else "qa",
    }


def _db_disconnected_payload(**extra):
    status_info = connection_status()
    # Never expose host/dbname/schema to non-staff clients.
    public = {
        "enabled": status_info.get("enabled"),
        "configured": status_info.get("configured"),
    }
    detail = (
        "External DB credentials are missing. Fill the project-root .env (QA_DB_*)."
        if status_info["enabled"] and not status_info["configured"]
        else "External DB disconnected (QA_USE_EXTERNAL_DB=false in .env)."
    )
    return {"connected": False, "detail": detail, **public, **extra}


def _is_staff(request) -> bool:
    user = getattr(request, "user", None)
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


class ExternalStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        info = connection_status()
        public = {
            "enabled": info.get("enabled"),
            "configured": info.get("configured"),
            "connected": False,
            "tables": [],
        }
        if not external_db_enabled():
            return Response(public)

        try:
            with external_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1 AS ok")
                    cur.fetchone()
            payload = {**public, "connected": True}
            if _is_staff(request):
                tables = list_schema_tables()
                payload.update(
                    {
                        **info,
                        "tableCount": len(tables),
                        "tables": tables,
                    }
                )
            else:
                payload["tableCount"] = None
            return Response(payload)
        except Exception as exc:
            return Response(
                {**public, "detail": _exc_detail(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class AgentsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(agents=[]))

        team = request.query_params.get("team") or "all"
        search = request.query_params.get("search") or ""
        try:
            agents = list_agents(team=team, search=search)
            return Response({"connected": True, "agents": agents})
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "agents": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class AuditsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(audits=[], total=0))

        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = date.fromisoformat(start_raw) if start_raw else None
            end = date.fromisoformat(end_raw) if end_raw else None
        except ValueError:
            return Response({"detail": "Invalid start/end date."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = list_audits(
                start=start,
                end=end,
                team=request.query_params.get("team") or "all",
                search=request.query_params.get("search") or "",
                limit=limit,
                offset=offset,
            )
            return Response(payload)
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "audits": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            audit = upsert_audit(dict(request.data), actor=_actor_from_request(request))
            return Response({"connected": True, "audit": audit}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AuditDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, audit_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            audit = get_audit(audit_id)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not audit:
            return Response({"detail": "Audit not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"connected": True, "audit": audit})

    def put(self, request, audit_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        data = dict(request.data)
        data["id"] = audit_id
        actor = _actor_from_request(request)
        try:
            before = get_audit(audit_id)
            audit = upsert_audit(data, actor=actor)
            changes = request.data.get("changes")
            if before and isinstance(changes, list) and changes:
                insert_audit_edit_history(
                    audit=audit,
                    action="edit",
                    changes=[
                        {
                            "field": str(item.get("field") or "Field"),
                            "from": str(item.get("from") or "—"),
                            "to": str(item.get("to") or "—"),
                        }
                        for item in changes
                        if isinstance(item, dict)
                    ],
                    edited_by=actor,
                    before_snapshot=before,
                    after_snapshot=audit,
                )
            return Response({"connected": True, "audit": audit})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, audit_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        actor = _actor_from_request(request)
        try:
            existing = delete_audit(audit_id)
            if not existing:
                return Response({"detail": "Audit not found."}, status=status.HTTP_404_NOT_FOUND)
            insert_audit_edit_history(
                audit=existing,
                action="delete",
                changes=[{"field": "Audit", "from": "Present", "to": "Deleted"}],
                edited_by=actor,
                before_snapshot=existing,
                after_snapshot=None,
            )
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CaseTypesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(caseTypes=[]))
        try:
            rows = list_case_types(team=request.query_params.get("team") or "all")
            return Response({"connected": True, "caseTypes": rows})
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "caseTypes": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        case_id = str(request.data.get("id") or "").strip()
        if not case_id:
            case_id = f"case-type-{int(__import__('time').time())}"
        try:
            row = upsert_case_type(
                case_id=case_id,
                name=name,
                sort_order=int(request.data.get("sortOrder") or 0),
                team=str(request.data.get("team") or "").strip() or None,
            )
            return Response({"connected": True, "caseType": row}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CaseTypeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, case_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            row = upsert_case_type(
                case_id=case_id,
                name=name,
                sort_order=int(request.data.get("sortOrder") or 0),
                team=str(request.data.get("team") or "").strip() or None,
            )
            return Response({"connected": True, "caseType": row})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, case_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            deleted = delete_case_type(case_id)
            if not deleted:
                return Response({"detail": "Case type not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class TeamMetricsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(metrics=[]))
        try:
            rows = list_team_metrics(team=request.query_params.get("team") or "all")
            return Response({"connected": True, "metrics": rows})
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "metrics": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        name = str(request.data.get("name") or request.data.get("label") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        metric_id = str(request.data.get("id") or request.data.get("key") or "").strip()
        if not metric_id:
            metric_id = f"metric-{int(__import__('time').time())}"
        try:
            row = upsert_team_metric(
                metric_id=metric_id,
                name=name,
                team=str(request.data.get("team") or "").strip() or None,
                pass_points=_optional_float(request.data.get("passPoints", request.data.get("pass"))),
                borderline_points=_optional_float(
                    request.data.get("borderlinePoints", request.data.get("borderline"))
                ),
                counts_toward_score=bool(
                    request.data.get("countsTowardScore", True)
                ),
                auto_fail=bool(request.data.get("canAutoFail", request.data.get("autoFail", False))),
                sort_order=int(request.data.get("sortOrder") or 0),
            )
            return Response({"connected": True, "metric": row}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class TeamMetricDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, metric_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        name = str(request.data.get("name") or request.data.get("label") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            row = upsert_team_metric(
                metric_id=metric_id,
                name=name,
                team=str(request.data.get("team") or "").strip() or None,
                pass_points=_optional_float(request.data.get("passPoints", request.data.get("pass"))),
                borderline_points=_optional_float(
                    request.data.get("borderlinePoints", request.data.get("borderline"))
                ),
                counts_toward_score=bool(request.data.get("countsTowardScore", True)),
                auto_fail=bool(request.data.get("canAutoFail", request.data.get("autoFail", False))),
                sort_order=int(request.data.get("sortOrder") or 0),
            )
            return Response({"connected": True, "metric": row})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, metric_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            deleted = delete_team_metric(metric_id)
            if not deleted:
                return Response({"detail": "Metric not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


def _optional_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class MonitoringListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))

        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = list_monitoring(
                team=request.query_params.get("team") or "all",
                status=request.query_params.get("status") or "all",
                search=request.query_params.get("search") or "",
                limit=limit,
                offset=offset,
            )
            return Response(payload)
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            item = upsert_monitoring(dict(request.data), actor=_actor_from_request(request))
            return Response({"connected": True, "item": item}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class MonitoringDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        data = dict(request.data)
        data["id"] = item_id
        try:
            item = upsert_monitoring(data, actor=_actor_from_request(request))
            return Response({"connected": True, "item": item})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            if not delete_monitoring(item_id):
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class EvaluationProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(year=None, month=None, agents=[]))

        try:
            year = int(request.query_params.get("year") or date.today().year)
            month = int(request.query_params.get("month") or date.today().month)
        except ValueError:
            return Response({"detail": "Invalid year/month."}, status=status.HTTP_400_BAD_REQUEST)

        if month < 1 or month > 12:
            return Response({"detail": "Month must be 1–12."}, status=status.HTTP_400_BAD_REQUEST)

        team = request.query_params.get("team") or "all"
        search = request.query_params.get("search") or ""

        try:
            payload = fetch_evaluation_progress(
                year=year,
                month=month,
                team=team,
                search=search,
            )
            return Response(payload)
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "agents": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class EvaluationDayOffView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not external_db_enabled():
            return Response(
                _db_disconnected_payload(),
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        agent_id = str(request.data.get("agentId") or "").strip()
        iso = str(request.data.get("date") or "").strip()
        off = bool(request.data.get("off"))

        if not agent_id or not iso:
            return Response(
                {"detail": "agentId and date are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        user_name = (
            f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
            or getattr(user, "username", "")
            or "QA System"
        )

        try:
            now_off = toggle_day_off(agent_id, iso, off, user_name=user_name)
            return Response({"agentId": agent_id, "date": iso, "off": now_off})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class EvaluationScheduledDayOffView(APIView):
    """POST — set weekly scheduled day off (Sun–Sat) for an agent."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not external_db_enabled():
            return Response(
                _db_disconnected_payload(),
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        agent_id = str(request.data.get("agentId") or "").strip()
        weekday = str(request.data.get("weekday") or "").strip()

        if not agent_id:
            return Response(
                {"detail": "agentId is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        user_name = (
            f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
            or getattr(user, "username", "")
            or "QA System"
        )

        try:
            saved = set_scheduled_day_off(agent_id, weekday, user_name=user_name)
            return Response({"agentId": agent_id, "weekday": saved})
        except ValueError as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AnalyticsOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(kpis=[], departments=[]))

        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = (
                date.fromisoformat(start_raw)
                if start_raw
                else date.today() - timedelta(days=8)
            )
            end = date.fromisoformat(end_raw) if end_raw else date.today()
        except ValueError:
            return Response(
                {"detail": "Invalid start/end date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if end < start:
            start, end = end, start

        try:
            team = request.query_params.get("team") or "all"
            return Response(fetch_analytics(start, end, team=team))
        except Exception as exc:
            return Response(
                {
                    "connected": False,
                    "detail": _exc_detail(exc),
                    "kpis": [],
                    "departments": [],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class ProductionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))

        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = date.fromisoformat(start_raw) if start_raw else None
            end = date.fromisoformat(end_raw) if end_raw else None
        except ValueError:
            return Response(
                {"detail": "Invalid start/end date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if start and end and end < start:
            start, end = end, start

        try:
            payload = list_production(
                start=start,
                end=end,
                department=request.query_params.get("department") or "all",
                search=request.query_params.get("search") or "",
            )
            return Response(payload)
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not _is_staff(request):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        rows = request.data.get("rows")
        if not isinstance(rows, list):
            return Response({"detail": "rows array is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(rows) > MAX_PRODUCTION_IMPORT_ROWS:
            return Response(
                {"detail": f"Too many rows (max {MAX_PRODUCTION_IMPORT_ROWS})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = import_production_rows(rows)
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AgentFeedbackListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))
        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(
                list_agent_feedback(
                    team=request.query_params.get("team") or "all",
                    search=request.query_params.get("search") or "",
                    limit=limit,
                    offset=offset,
                )
            )
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            item = upsert_agent_feedback(dict(request.data))
            return Response({"connected": True, "item": item}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AgentFeedbackDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        data = dict(request.data)
        data["id"] = item_id
        try:
            item = upsert_agent_feedback(data)
            return Response({"connected": True, "item": item})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            if not delete_agent_feedback(item_id):
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class SupervisorRequestsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))
        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(
                list_supervisor_requests(
                    team=request.query_params.get("team") or "all",
                    status=request.query_params.get("status") or "all",
                    search=request.query_params.get("search") or "",
                    limit=limit,
                    offset=offset,
                )
            )
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            item = upsert_supervisor_request(dict(request.data))
            return Response({"connected": True, "item": item}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class SupervisorRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        data = dict(request.data)
        data["id"] = item_id
        try:
            item = upsert_supervisor_request(data)
            return Response({"connected": True, "item": item})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            if not delete_supervisor_request(item_id):
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class SupervisorRequestReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        body = str(request.data.get("body") or "").strip()
        if not body:
            return Response({"detail": "body is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            reply = add_supervisor_reply(
                item_id, body=body, actor=_actor_from_request(request)
            )
            return Response({"connected": True, "reply": reply}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CoachingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))
        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(
                list_coachings(
                    search=request.query_params.get("search") or "",
                    limit=limit,
                    offset=offset,
                )
            )
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            item = upsert_coaching(dict(request.data), actor=_actor_from_request(request))
            return Response({"connected": True, "item": item}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CoachingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        data = dict(request.data)
        data["id"] = item_id
        try:
            item = upsert_coaching(data, actor=_actor_from_request(request))
            return Response({"connected": True, "item": item})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, item_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            if not delete_coaching(item_id):
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class TeamTrackingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))
        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(
                list_audit_edit_history(
                    team=request.query_params.get("team") or "all",
                    search=request.query_params.get("search") or "",
                    limit=limit,
                    offset=offset,
                )
            )
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class ManagedUsersListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrReadOnly]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(items=[], total=0))
        try:
            limit = int(request.query_params.get("limit") or 500)
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(
                list_managed_users(
                    search=request.query_params.get("search") or "",
                    limit=limit,
                    offset=offset,
                )
            )
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "items": [], "total": 0},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def post(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            item = upsert_managed_user(dict(request.data))
            return Response({"connected": True, "item": item}, status=status.HTTP_201_CREATED)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class ManagedUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsStaffUser]

    def put(self, request, user_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        data = dict(request.data)
        data["id"] = user_id
        try:
            item = upsert_managed_user(data)
            return Response({"connected": True, "item": item})
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def delete(self, request, user_id: str):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            if not delete_managed_user(user_id):
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"connected": True, "deleted": True})
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class RolePermissionsView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrReadOnly]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(permissions={"admin": {}, "qa": {}}))
        try:
            return Response(get_role_permissions())
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "permissions": {"admin": {}, "qa": {}}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def put(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(), status=status.HTTP_503_SERVICE_UNAVAILABLE)
        matrix = request.data.get("permissions") or request.data
        if not isinstance(matrix, dict):
            return Response({"detail": "permissions object required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(save_role_permissions(matrix))
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class RankingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(_db_disconnected_payload(rows=[]))

        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = (
                date.fromisoformat(start_raw)
                if start_raw
                else date.today() - timedelta(days=8)
            )
            end = date.fromisoformat(end_raw) if end_raw else date.today()
        except ValueError:
            return Response(
                {"detail": "Invalid start/end date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team = request.query_params.get("team") or "calls"
        metric = request.query_params.get("metric") or "quality"
        try:
            return Response(fetch_rankings(start=start, end=end, team=team, metric=metric))
        except Exception as exc:
            return Response(
                {"connected": False, "detail": _exc_detail(exc), "rows": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class ReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            if (request.query_params.get("export") or "").strip().lower() in {
                "1",
                "true",
                "yes",
                "xlsx",
            }:
                return Response(_db_disconnected_payload())
            return Response(_db_disconnected_payload(kpis=[], trendPoints=[], trendLabels=[]))

        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = (
                date.fromisoformat(start_raw)
                if start_raw
                else date.today() - timedelta(days=8)
            )
            end = date.fromisoformat(end_raw) if end_raw else date.today()
        except ValueError:
            return Response(
                {"detail": "Invalid start/end date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team = request.query_params.get("team") or "all"
        agent_ids = [
            item.strip()
            for item in (request.query_params.get("agentIds") or "").split(",")
            if item.strip()
        ]
        period = (request.query_params.get("period") or "weeks").strip().lower()
        export = (request.query_params.get("export") or "").strip().lower() in {
            "1",
            "true",
            "yes",
            "xlsx",
        }
        try:
            if export:
                return Response(
                    fetch_report_export(
                        start=start,
                        end=end,
                        team=team,
                        agent_ids=agent_ids,
                        period=period,
                    )
                )
            return Response(
                fetch_reports(start=start, end=end, team=team, agent_ids=agent_ids)
            )
        except Exception as exc:
            if export:
                return Response(
                    {"connected": False, "detail": _exc_detail(exc)},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response(
                {
                    "connected": False,
                    "detail": _exc_detail(exc),
                    "kpis": [],
                    "trendPoints": [],
                    "trendLabels": [],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class ActionCenterView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(
                _db_disconnected_payload(health={}, queues=[], aging=[])
            )

        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = (
                date.fromisoformat(start_raw)
                if start_raw
                else date.today() - timedelta(days=8)
            )
            end = date.fromisoformat(end_raw) if end_raw else date.today()
        except ValueError:
            return Response(
                {"detail": "Invalid start/end date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            return Response(fetch_action_center(start=start, end=end))
        except Exception as exc:
            return Response(
                {
                    "connected": False,
                    "detail": _exc_detail(exc),
                    "health": {"urgent": "—", "watch": "—", "stable": "—"},
                    "queues": [],
                    "aging": [],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class PowerAutomateStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .power_automate import FLOW_KEYS, flow_configured

        return Response(
            {
                "flows": {
                    key: {"configured": flow_configured(key), "env": env}
                    for key, env in FLOW_KEYS.items()
                }
            }
        )


class PowerAutomateTriggerView(APIView):
    """POST /api/integrations/power-automate/<flow>/ with a JSON body."""

    permission_classes = [IsAuthenticated]

    def post(self, request, flow: str):
        from .power_automate import FLOW_KEYS, post_to_flow, prepare_payload

        if flow not in FLOW_KEYS:
            return Response({"detail": "Unknown flow."}, status=status.HTTP_404_NOT_FOUND)

        # Password-reset mail is only sent from /api/auth/forgot-password/.
        if flow == "forgot-password":
            return Response(
                {"detail": "Use /api/auth/forgot-password/ for reset emails."},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = dict(request.data) if isinstance(request.data, dict) else {}
        routed = prepare_payload(flow, payload)
        actor = _actor_from_request(request)
        from datetime import datetime as _dt

        envelope = {
            "flow": flow,
            "triggeredAt": _dt.utcnow().isoformat() + "Z",
            "triggeredBy": {
                "userId": actor.get("userId"),
                "name": actor.get("name"),
                "email": actor.get("email"),
            },
            # Flat fields at root for simple PA expressions (triggerBody()?['toEmail'])
            # Nested copy kept under payload for flows that already use it.
            **routed,
            "payload": routed,
            "emailTestMode": bool(routed.get("emailTestMode")),
            "testEmail": (routed.get("toEmail") if routed.get("emailTestMode") else None),
        }
        try:
            result = post_to_flow(flow, envelope)
            return Response(
                {
                    "ok": True,
                    "toEmail": routed.get("toEmail"),
                    "emailTestMode": bool(routed.get("emailTestMode")),
                    **result,
                }
            )
        except RuntimeError as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as exc:
            return Response({"detail": _exc_detail(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
