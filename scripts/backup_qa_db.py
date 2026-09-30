"""pg_dump only QA tables this app uses (one file per table, then verify)."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
BACKUP_DIR = ROOT / "backups"
PG_DUMP = Path(r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe")

QA_TABLES = (
    "profiles",
    "qa_auth_users",
    "qa_role_permissions",
    "audits",
    "audit_edit_history",
    "monitoring_items",
    "agent_feedback",
    "coachings",
    "supervisor_requests",
    "supervisor_request_replies",
    "case_types",
    "team_metrics",
    "agent_daily_status",
    "calls_records",
    "tickets_records",
    "sales_records",
)


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, val = raw.split("=", 1)
        out[key.strip()] = val.strip().strip('"').strip("'")
    return out


def main() -> int:
    if not PG_DUMP.is_file():
        print(f"pg_dump not found at {PG_DUMP}", file=sys.stderr)
        return 1

    env = load_env()
    host = env.get("QA_DB_HOST", "").strip()
    port = (env.get("QA_DB_PORT") or "5432").strip()
    name = env.get("QA_DB_NAME", "").strip()
    user = env.get("QA_DB_USER", "").strip()
    password = env.get("QA_DB_PASSWORD", "")
    schema = (env.get("QA_EXTERNAL_SCHEMA") or "db_external_data").strip()
    if not all([host, name, user, password]):
        print("QA_DB_* credentials missing in .env", file=sys.stderr)
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = BACKUP_DIR / f"qa_tables_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    child_env = {**os.environ, "PGPASSWORD": password}
    print(f"Dumping {len(QA_TABLES)} QA tables from {schema} @ {host}:{port}", flush=True)

    failed: list[str] = []
    total = 0
    for table in QA_TABLES:
        out_file = out_dir / f"{table}.dump"
        cmd = [
            str(PG_DUMP),
            "-h",
            host,
            "-p",
            port,
            "-U",
            user,
            "-d",
            name,
            "-F",
            "c",
            "-f",
            str(out_file),
            "--no-owner",
            "--no-acl",
            "-t",
            f"{schema}.{table}",
        ]
        result = subprocess.run(cmd, env=child_env, capture_output=True, text=True)
        if result.returncode != 0:
            failed.append(table)
            print(f"  FAIL {schema}.{table}: {(result.stderr or '').strip()[:200]}", flush=True)
            out_file.unlink(missing_ok=True)
            continue
        size = out_file.stat().st_size
        total += size
        print(f"  OK   {schema}.{table} ({size / 1024:.1f} KB)", flush=True)

    manifest = out_dir / "MANIFEST.txt"
    manifest.write_text(
        "\n".join(
            [
                f"QA table backup {stamp} UTC",
                f"host={host} db={name} schema={schema}",
                f"tables={len(QA_TABLES) - len(failed)} ok, {len(failed)} failed",
                "",
                *[f"OK {t}" for t in QA_TABLES if t not in failed],
                *[f"FAIL {t}" for t in failed],
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"OK: {out_dir} ({total / (1024 * 1024):.2f} MB total)", flush=True)
    if failed:
        print(f"Failed: {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
