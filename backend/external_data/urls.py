from django.urls import path

from .views import AnalyticsOverviewView, EvaluationDayOffView, EvaluationProgressView

urlpatterns = [
    path("analytics/", AnalyticsOverviewView.as_view(), name="analytics-overview"),
    path(
        "evaluation-progress/",
        EvaluationProgressView.as_view(),
        name="evaluation-progress",
    ),
    path(
        "evaluation-progress/day-off/",
        EvaluationDayOffView.as_view(),
        name="evaluation-progress-day-off",
    ),
]
