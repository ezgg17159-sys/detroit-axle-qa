from datetime import date, timedelta

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .analytics import fetch_analytics
from .db import external_db_enabled
from .queries import fetch_evaluation_progress, toggle_day_off


class EvaluationProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(
                {
                    "connected": False,
                    "detail": "External DB disconnected (USE_EXTERNAL_DB=False in db_config.py).",
                    "year": None,
                    "month": None,
                    "agents": [],
                }
            )

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
                {"connected": False, "detail": str(exc), "agents": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class EvaluationDayOffView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not external_db_enabled():
            return Response(
                {"detail": "External DB disconnected (USE_EXTERNAL_DB=False in db_config.py)."},
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
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AnalyticsOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not external_db_enabled():
            return Response(
                {
                    "connected": False,
                    "detail": "External DB disconnected (USE_EXTERNAL_DB=False in db_config.py).",
                    "kpis": [],
                    "departments": [],
                }
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

        if end < start:
            start, end = end, start

        try:
            return Response(fetch_analytics(start, end))
        except Exception as exc:
            return Response(
                {
                    "connected": False,
                    "detail": str(exc),
                    "kpis": [],
                    "departments": [],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
