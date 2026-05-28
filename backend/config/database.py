import json
import os
import subprocess

import psycopg2
from psycopg2.extras import RealDictCursor


DB_NAME = os.getenv("POSTGRES_DB", "supermercado_db")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "tu_password")
DB_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_CONTAINER = os.getenv("POSTGRES_CONTAINER", "supermercado-postgres")


def get_db():
    # Recuerda cambiar estos datos por los de tu base de datos local
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=10,
        options="-c client_encoding=UTF8",
        cursor_factory=RealDictCursor
    )


def _query_with_psycopg2(sql, one=False):
    db = get_db()
    try:
        with db.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchone() if one else cursor.fetchall()
    finally:
        db.close()


def _query_with_docker_psql(sql, one=False):
    json_sql = (
        f"SELECT COALESCE(row_to_json(t), 'null'::json) FROM ({sql} LIMIT 1) t;"
        if one
        else f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t;"
    )

    command = [
        "docker",
        "exec",
        "-e",
        f"PGPASSWORD={DB_PASSWORD}",
        DB_CONTAINER,
        "psql",
        "-U",
        DB_USER,
        "-d",
        DB_NAME,
        "-t",
        "-A",
        "-c",
        json_sql,
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "No se pudo consultar PostgreSQL con docker exec psql")

    raw_json = result.stdout.strip()
    return json.loads(raw_json) if raw_json else (None if one else [])


def query_all(sql):
    try:
        return _query_with_psycopg2(sql, one=False)
    except Exception as exc:
        print(f"[DB] psycopg2 fallo; usando docker exec psql. Detalle: {type(exc).__name__}: {exc}")
        return _query_with_docker_psql(sql, one=False)


def query_one(sql):
    try:
        return _query_with_psycopg2(sql, one=True)
    except Exception as exc:
        print(f"[DB] psycopg2 fallo; usando docker exec psql. Detalle: {type(exc).__name__}: {exc}")
        return _query_with_docker_psql(sql, one=True)
