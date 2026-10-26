import psycopg
import pytest

ROLE = "jobfit_rls_test"


def as_user(conn: psycopg.Connection, user_id: str | None) -> None:
    conn.execute(f"SET LOCAL ROLE {ROLE}")
    if user_id is not None:
        conn.execute("SELECT set_config('app.user_id', %s, true)", (user_id,))


def test_rls_isolates_users(db: psycopg.Connection) -> None:
    # A non-superuser role: superusers bypass RLS, the app's database role doesn't.
    with db.transaction():
        db.execute(
            f"DO $$ BEGIN CREATE ROLE {ROLE} NOLOGIN;"
            " EXCEPTION WHEN duplicate_object THEN NULL; END $$"
        )
        db.execute(f'GRANT SELECT, INSERT ON "User", "Evidence" TO {ROLE}')

    with db.transaction():  # rolled back at the end, leaving no rows behind
        as_user(db, "u1")
        db.execute("""INSERT INTO "User" (id, email) VALUES ('u1', 'u1@test')""")
        db.execute(
            """INSERT INTO "Evidence" (id, "userId", kind, text)
               VALUES ('e1', 'u1', 'BULLET', 'x')"""
        )
        assert db.execute('SELECT count(*) FROM "Evidence"').fetchone() == (1,)

        as_user(db, "u2")
        assert db.execute('SELECT count(*) FROM "Evidence"').fetchone() == (0,)
        assert db.execute('SELECT count(*) FROM "User"').fetchone() == (0,)
        with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
            db.execute(
                """INSERT INTO "Evidence" (id, "userId", kind, text)
                   VALUES ('e2', 'u1', 'BULLET', 'planted')"""
            )

        db.execute("RESET app.user_id")
        assert db.execute('SELECT count(*) FROM "Evidence"').fetchone() == (0,)
        raise psycopg.Rollback
