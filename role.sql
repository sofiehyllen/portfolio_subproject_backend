-- This file creates the role the backend connects with, movie_app, and
-- grants it only the privileges the API needs (2-A.4):
--   - IMDB data:       read-only (SELECT)
--   - Framework data:  per table, only the operations the API performs
--                      (see section 4)
--
-- Run script:
-- psql -U postgres -d imdb -v app_password='...' -f role.sql
------------------------------------------------------------------------

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- 1. The login role
--    Created on the first run; later runs only reset its attributes and
--    password. The attributes are the defaults, but they are stated
--    explicitly so the script documents what the role cannot do.
SELECT format(
    '%s ROLE movie_app LOGIN PASSWORD %L '
    'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'movie_app')
        THEN 'ALTER' ELSE 'CREATE' END,
    :'app_password')
\gexec

BEGIN;

-- ---------------------------------------------------------------------
-- 2. Start from a clean slate, so a rerun never leaves old grants behind
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM movie_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM movie_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM movie_app;

-- The role may look up objects in the schema, but not create any.
-- (PUBLIC has no CREATE on public from PostgreSQL 15; the REVOKE makes
-- older versions behave the same.)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO movie_app;

-- ---------------------------------------------------------------------
-- 3. IMDB data (B2, D): read-only, since the API must not change it (2-A.1).
--    Only the tables and views the backend and the D functions read.
--    title_episodes and alt_titles are not used, so they are not granted.
GRANT SELECT ON
    titles, genres, genre_titles, ratings,
    persons, professions, person_professions, person_known_for,
    title_persons, title_person_characters, word_index,
    weighted_word_index, actor_title_credits
TO movie_app;

-- ---------------------------------------------------------------------
-- 4. Framework data (C2)
--    The API offers CRUD on framework data (2-A.1), but movie_app only
--    gets the privileges each table needs for the operations the API
--    actually performs. Rows deleted by ON DELETE CASCADE need no
--    DELETE privilege, since PostgreSQL runs the cascade as the owner
--    of the referencing table.

-- users: register (create_user), read, update profile and password
-- (update_user, update_user_password, and SELECT ... FOR UPDATE when
-- locking the row), delete account (delete_user)
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO movie_app;

-- user_title_ratings: written only through rate() and remove_rating(),
-- which run as their owner (section 5). movie_app reads the ratings and
-- locks a rating with SELECT ... FOR UPDATE before rating again, which
-- PostgreSQL only allows with UPDATE privilege. It gets no INSERT or
-- DELETE: delete_user() soft-deletes through remove_rating(), and the
-- rows themselves go with the user by ON DELETE CASCADE.
GRANT SELECT, UPDATE ON user_title_ratings TO movie_app;

-- search_history: logged by the search functions (log_search), listed,
-- and deleted one entry at a time or all at once. Never updated.
GRANT SELECT, INSERT, DELETE ON search_history TO movie_app;

-- Bookmarks: added (INSERT ... ON CONFLICT DO NOTHING, which needs no
-- UPDATE), listed and removed. Never updated.
GRANT SELECT, INSERT, DELETE ON bookmark_title, bookmark_person TO movie_app;

-- The SERIAL columns draw their values from these sequences
GRANT USAGE ON SEQUENCE users_uconst_seq, search_history_sconst_seq TO movie_app;

-- ---------------------------------------------------------------------
-- 5. Functions that write IMDB data
--    rate() and remove_rating() update ratings, and through
--    name_rating(varchar) also persons. Instead of giving movie_app write
--    access to those tables, the two functions run with the rights of
--    their owner (SECURITY DEFINER). movie_app can then change ratings
--    only in the way these functions do, never with its own UPDATE
--    statements. search_path is fixed, so a caller cannot make the
--    functions use objects of its own instead of the real tables.
ALTER FUNCTION rate(integer, varchar, integer)
    SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION remove_rating(integer, varchar)
    SECURITY DEFINER SET search_path = public, pg_temp;

-- PUBLIC may execute every function by default, so the definer
-- functions must be restricted explicitly.
REVOKE EXECUTE ON FUNCTION
    rate(integer, varchar, integer), remove_rating(integer, varchar)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    rate(integer, varchar, integer), remove_rating(integer, varchar)
TO movie_app;

-- name_rating() recomputes every person's name rating (run once by
-- D_functions.sql), and name_rating(varchar) recomputes the persons of
-- one title (called by rate() and remove_rating()). Neither is called
-- by the backend, so no one but the owner may execute them. (They are
-- SECURITY INVOKER, so movie_app could not update persons through them
-- anyway; the REVOKE states the intent.)
REVOKE EXECUTE ON FUNCTION name_rating(), name_rating(varchar) FROM PUBLIC;

-- All other functions are SECURITY INVOKER: they run with movie_app's
-- own rights and can do no more than the table grants above allow, so
-- the default EXECUTE for PUBLIC is kept.

COMMIT;