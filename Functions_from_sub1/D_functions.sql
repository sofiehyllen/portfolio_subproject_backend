-- This files contain all functionality (1-D) for the Movie Data 
-- Model (B2) and the Framework Model (C2).
--
-- Prerequisites: B2_build_movie_db.sql and C2_build_framework_db.sql
-- have been run.
--
-- Run script:
-- psql -U postgres -d imdb -f D_functions.sql
--
-- Disclaimer:
-- The order of the functions in this file does not match the order in 
-- the project description. The order is instead determined by the
-- order in which the functions are called.
-- ---------------------------------------------------------------------
-- FUNCTION OVERVIEW
--
-- 0. Shared objects
--   actor_title_credits (view)
--       One row per actor/actress credit, with title and person name.
--       Used by co_players (1-D.6).
--   log_search(uconst, search)
--       Logs a search in search_history. The search is trimmed; an
--       empty or NULL search, or a NULL uconst, is not logged. Used by
--       string_search, structured_string_search, name_search,
--       actor_search, exact_match_search, best_match_querying and
--       weighted_search.
--
-- 1-D.1 Framework: users
--   create_user(first_name, last_name, username, email, password_hash) -> uconst
--       Creates a user and returns the new id.
--   get_user_by_username(username)
--       Returns the user with the given username, including
--       password_hash and created_at.
--   update_user(uconst, first_name, last_name, username, email)
--       Updates a user's profile. NULL parameters keep the current value.
--   delete_user(uconst) -> boolean
--       Deletes the user. Ratings, bookmarks and search history are
--       deleted with the user (ON DELETE CASCADE). Removes each of the
--       user's active title ratings with remove_rating, so the votes
--       are taken out of the title averages and the name ratings are
--       recomputed. Returns false if the user does not exist.
--
-- 1-D.1 Framework: bookmarks
--   add_title_bookmark(uconst, tconst)
--       Bookmarks a title for a user. Bookmarking again is ignored.
--   remove_title_bookmark(uconst, tconst) -> boolean
--       Removes a user's bookmark of a title. Returns false if the user
--       has no bookmark of the title.
--   get_title_bookmarks(uconst) -> (tconst, title_name, created_at)
--       Lists a user's bookmarked titles, newest bookmark first.
--   add_person_bookmark(uconst, nconst)
--       Bookmarks a person for a user. Bookmarking again is ignored.
--   remove_person_bookmark(uconst, nconst) -> boolean
--       Removes a user's bookmark of a person. Returns false if the user
--       has no bookmark of the person.
--   get_person_bookmarks(uconst) -> (nconst, person_name, created_at)
--       Lists a user's bookmarked persons, newest bookmark first.
--
-- 1-D.1 Framework: search history
--   get_search_history(uconst) -> (sconst, created_at, search_string)
--       Lists a user's searches, newest first.
--   clear_search_history(uconst) -> boolean
--       Deletes a user's entire search history. Returns false if the
--       history was already empty.
--   clear_search_history_entry(uconst, sconst) -> boolean
--       Deletes one search, only if it belongs to the user. Returns
--       false if the user has no such search.
--
-- 1-D.1 Framework: rating
--   get_users_title_rating_history(uconst) -> (tconst, title_name, rating, last_change)
--       Lists a user's active (not soft-deleted) title ratings with the
--       time of the latest change, newest first.
--   remove_rating(uconst, tconst) -> boolean
--       Soft-deletes the user's active rating of a title (sets
--       deleted_at and updated_at) and removes the vote from the
--       title's average in ratings, kept between 1 and 10. If it was
--       the title's last vote, the ratings row is deleted. Then
--       recomputes all name ratings with name_rating(). Returns
--       false if the user has no active rating of the title.
--
-- 1-D.2 Simple search
--   string_search(uconst, search) -> (tconst, primarytitle)
--       Finds titles whose primary title, original title or plot
--       contains the search string (case-insensitive). The trimmed
--       search is logged. An empty search returns nothing and is not
--       logged. No ordering.
--
-- 1-D.3 Title rating
--   rate(uconst, tconst, rating)
--       Registers a user's rating (1-10) of a title in
--       user_title_ratings (the rating history) and updates the
--       title's average and vote count in ratings:
--         A. First rating: adds a vote. Creates the ratings row if the
--            title has no votes.
--         B. Changed active rating: replaces the user's old vote. The
--            vote count is unchanged.
--         C. Rating after a soft-deletion: reactivates the row and adds
--            a new vote.
--       Then recomputes all name ratings with name_rating(). Rating
--       with the same value again changes nothing. Raises an exception
--       if the rating is out of range, or the title or user does not
--       exist.
--
-- 1-D.4 Structured string search
--   structured_string_search(uconst, title, plot, characters, names) -> (tconst, primary_title)
--       Finds titles where every non-empty parameter is a substring
--       (case-insensitive) of its field: primary title, plot, a
--       character name on the title and a person name on the title.
--       Empty strings ('') are ignored. Logs the search as the four
--       parameters separated by ', '.
--
-- 1-D.5 Finding names
--   name_search(uconst, name) -> (nconst, primary_name)
--       Finds all persons whose name contains the trimmed search
--       string (case-insensitive), ordered by name. Logs the search.
--       An empty search returns nothing and is not logged.
--   actor_search(uconst, name) -> (nconst, primary_name)
--       As name_search, but only persons with at least one actor or
--       actress credit.
--
-- 1-D.6 Finding co-players
--   actor_title_credits (view)
--       One row per actor/actress credit, with title and person name.
--   co_players(actor_name) -> (nconst, primary_name, frequency, movies)
--       Lists the actors who have acted in titles together with the
--       actor(s) whose name matches actor_name. The trimmed name is
--       used as an ILIKE pattern, so without wildcards it is an exact,
--       case-insensitive match, and persons sharing the name are
--       combined. frequency is the number of shared titles, and movies
--       lists their names, comma-separated and sorted. Most frequent
--       first, then by name. Uses the view actor_title_credits.
--
-- 1-D.7 Name rating
--   name_rating() -> integer
--       Computes and stores (persons.avg_name_rating) the name rating of
--       every person: the average rating of the titles they are
--       credited on, weighted by num_votes. Returns the number of
--       persons updated. Run once at the end of this section.
--
-- 1-D.8 Popular actors
--   popular_actors(tconst) -> (tconst, movie_title, nconst, actor_name, name_rating)
--       Lists the actors/actresses of the given title with their name
--       rating (persons.avg_name_rating), highest first, then by name.
--       Actors without a name rating are listed last.
--
-- 1-D.9 Similar movies
--   similar_movies(tconst) -> (tconst, movie_title, similarity_score, common_genres)
--       Lists titles of the same kind as the given title that share at
--       least one genre with it: movies (movie, tvMovie), series (tvSeries,
--       tvMiniSeries) or video games (videoGame). similarity_score is the
--       number of shared genres and common_genres lists them,
--       comma-separated. Ordered by score, highest first, then by title.
--       Returns nothing for any other title type. No row limit.
--
-- 1-D.10 Frequent person words
--   person_words(name, length DEFAULT NULL) -> (word, frequency)
--       Lists the most frequent words across all titles the person(s)
--       matching the ILIKE name pattern are credited on. Frequency is
--       the number of those titles the word is indexed for. length
--       limits the number of rows (NULL = 10, must be > 0).
--
-- 1-D.11 Exact-match querying
--   exact_match_search(uconst, VARIADIC keywords) -> (tconst, primary_title)
--       Finds titles indexed in word_index by all the keywords
--       (case-insensitive, trimmed). Logs the search. No ordering.
--
-- 1-D.12 Best-match querying
--   best_match_querying(uconst, VARIADIC keywords) -> (tconst, primary_title, word_count)
--       Finds titles indexed in word_index by at least one of the
--       keywords. word_count (the rank) is the number of distinct
--       keywords the title matches. Ordered by word_count, highest
--       first, then tconst. Keywords are cleaned as in
--       exact_match_search. Logs the keywords separated by spaces
--       directly in search_history. A blank search returns nothing and
--       is not logged. No row limit.
--
-- 1-D.13 Word-to-words querying
--   word_to_word_querying(VARIADIC words) -> (t_word, t_count)
--       Finds the titles indexed by all the words, then returns the 10
--       words indexed for most of those titles, excluding the search
--       words. t_count is the number of matched titles the word is
--       indexed for. Ties are not ordered. Words are used as given (not
--       trimmed, lowercased or deduplicated). Not logged.
--
-- 1-D.14 Weighted querying
--   weighted_querying(uconst, VARIADIC keywords) -> (tconst, primary_title, score)
--       Finds titles indexed by at least one of the keywords and ranks
--       them by relevance. Each (title, keyword) pair gets a TF-IDF
--       weight, computed per search in temporary tables:
--         TF  = n(d,t) / n(d)     fields the keyword occurs in for the
--                                 title / word_index rows of the title
--         IDF = log(N / n(t))     base 10; N = number of titles,
--                                 n(t) = titles indexed by the keyword
--       score is the sum of the title's keyword weights. Ordered by
--       score, highest first, then tconst. Keywords are cleaned as in
--       exact_match_search. Logs the keywords separated by spaces
--       directly in search_history. A blank search returns nothing and
--       is not logged. No row limit.
-- =====================================================================

\set ON_ERROR_STOP on
 
BEGIN;
 
-- ---------------------------------------------------------------------
-- 0. Wipe out of previous runs
--    Drops every overload of the functions defined in this file.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              -- 0.2 Helpers
              'log_search',
              -- 1-D.1
              'create_user', 'get_user_by_username', 'get_user_by_id', 'update_user', 'update_user_password', 'delete_user',
              'add_title_bookmark', 'remove_title_bookmark', 'get_title_bookmarks',
              'add_person_bookmark', 'remove_person_bookmark', 'get_person_bookmarks',
              'get_search_history', 'clear_search_history', 'clear_search_history_entry',
              'get_users_title_rating_history', 'remove_rating',
              -- 1-D.2 - 1-D.11
              'string_search', 'rate', 'structured_string_search',
              'name_search', 'actor_search', 'co_players', 'name_rating',
              'popular_actors', 'similar_movies', 'person_words',
              'exact_match_search', 'best_match_querying', 'word_to_word_querying',
              'weighted_querying', 'weighted_search')
    LOOP
        EXECUTE 'DROP FUNCTION ' || f.signature || ' CASCADE';
    END LOOP;
END;
$$;
 
-- ---------------------------------------------------------------------
-- 0.1 View: actor_title_credits
-- One row per actor credit, with title and name in the same virtual 
-- table. Used by co_players (1-D.6).
CREATE OR REPLACE VIEW actor_title_credits AS
SELECT DISTINCT
    tp.tconst,
    t.primary_title,
    t.title_type,
    tp.nconst,
    p.primary_name,
    tp.category
FROM title_persons tp
JOIN titles t ON t.tconst = tp.tconst
JOIN persons p ON p.nconst = tp.nconst
WHERE tp.category IN ('actor', 'actress', 'self');

-- ---------------------------------------------------------------------
-- 0.2 Helper: log_search
-- Logs a user's search in search_history. The search is trimmed; an
-- empty or NULL search is not logged.
CREATE OR REPLACE FUNCTION public.log_search(
    p_uconst INTEGER,
    p_search TEXT
)
RETURNS VOID
LANGUAGE sql
VOLATILE
AS $$
    INSERT INTO search_history (uconst, search_string)
    SELECT p_uconst, TRIM(p_search)
    WHERE NULLIF(TRIM(p_search), '') IS NOT NULL AND p_uconst IS NOT NULL;
$$;


-- =====================================================================
-- 1-D.7 Name rating
-- Computes the name rating of every person and stores it in
-- persons.avg_name_rating: the weighted average of the ratings of all
-- titles the person is credited on (all credits, not only actors),
-- with num_votes as weight:
--   sum(average_rating * num_votes) / sum(num_votes)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.name_rating()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE persons p
	SET avg_name_rating = w.name_rating
    FROM (
        SELECT tp.nconst,
                SUM(r.average_rating * r.num_votes) / NULLIF(SUM(r.num_votes), 0) AS name_rating
        FROM (
                SELECT DISTINCT tconst, nconst 
                FROM title_persons
                ) tp
        LEFT JOIN ratings r ON r.tconst = tp.tconst
        GROUP BY tp.nconst
    ) w
    WHERE p.nconst = w.nconst
      AND p.avg_name_rating IS DISTINCT FROM ROUND(w.name_rating, 2);
 
    GET DIAGNOSTICS v_count = ROW_COUNT;
 
    RETURN v_count;
END;
$$;

SELECT name_rating();


-- Name rating for all persons on a specific title
CREATE OR REPLACE FUNCTION public.name_rating(p_tconst VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Only persons credited on the rated title can get a new name rating
    UPDATE persons p
    SET avg_name_rating = w.name_rating
    FROM (
        SELECT tp.nconst,
               SUM(r.average_rating * r.num_votes) / NULLIF(SUM(r.num_votes), 0) AS name_rating
        FROM (
            SELECT DISTINCT tconst, nconst
            FROM title_persons
            WHERE nconst IN (SELECT nconst FROM title_persons WHERE tconst = p_tconst)
        ) tp
        LEFT JOIN ratings r ON r.tconst = tp.tconst
        GROUP BY tp.nconst
    ) w
    WHERE p.nconst = w.nconst
      AND p.avg_name_rating IS DISTINCT FROM ROUND(w.name_rating, 2);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- =====================================================================
-- 1-D.1 Basic framework functionality
-- =====================================================================
 
-- ---------------------------------------------------------------------
-- Users
-- Creates a user and returns the new id.
CREATE OR REPLACE FUNCTION public.create_user(
    p_first_name    VARCHAR,
    p_last_name     VARCHAR,
    p_username      VARCHAR,
    p_email         VARCHAR,
    p_password_hash TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    v_uconst INTEGER;
BEGIN
    INSERT INTO users (first_name, last_name, username, email, password_hash)
    VALUES (p_first_name, p_last_name, p_username, p_email, p_password_hash)
    RETURNING uconst INTO v_uconst;
 
    RETURN v_uconst;
END;
$$;
	
-- Returns the user with the given username, including password_hash.
CREATE OR REPLACE FUNCTION public.get_user_by_username(
    p_username VARCHAR
)
RETURNS TABLE (
    uconst        INTEGER,
    first_name    VARCHAR,
    last_name     VARCHAR,
    username      VARCHAR,
    email         VARCHAR,
    password_hash TEXT,
    created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.uconst,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.password_hash,
        u.created_at
    FROM users u
    WHERE u.username = p_username;
END;
$$;

-- Returns the user with the given id, including password_hash.
CREATE OR REPLACE FUNCTION public.get_user_by_id (
  p_id INTEGER
)
RETURNS TABLE(
  uconst        INTEGER,
  first_name    VARCHAR(50),
  last_name     VARCHAR(50),
  username      VARCHAR(50),
  email         VARCHAR(256),
  password_hash TEXT,
  created_at    TIMESTAMPTZ
)
AS $BODY$BEGIN

  RETURN QUERY
  SELECT u.uconst, u.first_name, u.last_name, u.username,
         u.email, u.password_hash, u.created_at
  FROM users u
  WHERE u.uconst = p_id;

END
$BODY$
  LANGUAGE plpgsql;
;


-- Updates a user's profile. NULL parameters keep the current value.
CREATE OR REPLACE FUNCTION public.update_user(
    p_uconst     INTEGER,
    p_first_name VARCHAR,
    p_last_name  VARCHAR,
    p_username   VARCHAR,
    p_email      VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    UPDATE users
    SET first_name = COALESCE(p_first_name, first_name),
        last_name  = COALESCE(p_last_name, last_name),
        username   = COALESCE(p_username, username),
        email      = COALESCE(p_email, email)
    WHERE uconst = p_uconst;
END;
$$;

-- replaces a user's password hash
CREATE OR REPLACE FUNCTION "public"."update_user_password"("p_uconst" int4, "p_password_hash" text)
  RETURNS "pg_catalog"."void" AS $BODY$
BEGIN
    UPDATE users
    SET password_hash = p_password_hash
    WHERE uconst = p_uconst;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE;

-- Deletes a user. Ratings, bookmarks and search history follow via
-- ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.delete_user(p_uconst INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tconst FROM user_title_ratings
             WHERE uconst = p_uconst AND deleted_at IS NULL
    LOOP
        PERFORM remove_rating(p_uconst, r.tconst);
    END LOOP;

    DELETE FROM users WHERE uconst = p_uconst;
    RETURN FOUND;
END;
$$;

	
-- ---------------------------------------------------------------------
-- Bookmarks
-- Bookmarks a title for a user. Bookmarking again is ignored.
CREATE OR REPLACE FUNCTION public.add_title_bookmark(
    p_uconst INTEGER,
    p_tconst VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    INSERT INTO bookmark_title (uconst, tconst)
    VALUES (p_uconst, p_tconst)
    ON CONFLICT (uconst, tconst) DO NOTHING;
END;
$$;
	
-- Removes a user's bookmark of a title.
CREATE OR REPLACE FUNCTION public.remove_title_bookmark(
    p_uconst INTEGER,
    p_tconst VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    DELETE FROM bookmark_title
    WHERE uconst = p_uconst AND tconst = p_tconst;
    RETURN FOUND;
END;
$$;
	
-- Lists a user's bookmarked titles, newest bookmark first.
CREATE OR REPLACE FUNCTION public.get_title_bookmarks(
    p_uconst INTEGER
)
RETURNS TABLE (
    tconst     VARCHAR,
    title_name TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    RETURN QUERY
    SELECT b.tconst, t.primary_title, b.created_at
    FROM bookmark_title b
    JOIN titles t ON t.tconst = b.tconst
    WHERE b.uconst = p_uconst
    ORDER BY b.created_at DESC;
END;
$$;
	
-- Bookmarks a person for a user. Bookmarking again is ignored.
CREATE OR REPLACE FUNCTION public.add_person_bookmark(
    p_uconst INTEGER,
    p_nconst VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    INSERT INTO bookmark_person (uconst, nconst)
    VALUES (p_uconst, p_nconst)
    ON CONFLICT (uconst, nconst) DO NOTHING;
END;
$$;
	
-- Removes a user's bookmark of a person.
CREATE OR REPLACE FUNCTION public.remove_person_bookmark(
    p_uconst INTEGER,
    p_nconst VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    DELETE FROM bookmark_person
    WHERE uconst = p_uconst AND nconst = p_nconst;
    RETURN FOUND;
END;
$$;
	
-- Lists a user's bookmarked persons, newest bookmark first.
CREATE OR REPLACE FUNCTION public.get_person_bookmarks(
    p_uconst INTEGER
)
RETURNS TABLE (
    nconst      VARCHAR,
    person_name TEXT,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    RETURN QUERY
    SELECT b.nconst, p.primary_name, b.created_at
    FROM bookmark_person b
    JOIN persons p ON p.nconst = b.nconst
    WHERE b.uconst = p_uconst
    ORDER BY b.created_at DESC;
END;
$$;

-- ---------------------------------------------------------------------
-- Search history
-- Lists a user's searches, newest first.
CREATE OR REPLACE FUNCTION public.get_search_history(
    p_uconst INTEGER
)
RETURNS TABLE (
    sconst        INTEGER,
    created_at    TIMESTAMPTZ,
    search_string TEXT
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    RETURN QUERY
    SELECT s.sconst, s.created_at, s.search_string
    FROM search_history s
    WHERE s.uconst = p_uconst
    ORDER BY s.created_at DESC;
END;
$$;
	
-- Deletes a user's entire search history.
CREATE OR REPLACE FUNCTION public.clear_search_history(
    p_uconst INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    DELETE FROM search_history
    WHERE uconst = p_uconst;
    RETURN FOUND;
END;
$$;
	
-- Deletes one search, only if it belongs to the user.
CREATE OR REPLACE FUNCTION public.clear_search_history_entry(
    p_uconst INTEGER,
    p_sconst INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    DELETE FROM search_history
    WHERE sconst = p_sconst AND uconst = p_uconst;
    RETURN FOUND;
END;
$$;
	
-- ---------------------------------------------------------------------
-- Rating
-- Lists a user's active title ratings with the time of the latest change, newest first.
CREATE OR REPLACE FUNCTION public.get_users_title_rating_history(
    p_uconst INTEGER
)
RETURNS TABLE (
    tconst      VARCHAR,
    title_name  TEXT,
    rating      INTEGER,
    last_change TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.tconst,
        t.primary_title,
        u.rating,
        GREATEST(u.created_at, u.updated_at) AS last_change
    FROM user_title_ratings u
    JOIN titles t ON t.tconst = u.tconst
    WHERE u.uconst = p_uconst AND u.deleted_at IS NULL
    ORDER BY GREATEST(u.created_at, u.updated_at) DESC;
END;
$$;

-- Removes a users rating
CREATE OR REPLACE FUNCTION public.remove_rating(
    p_uconst INTEGER,
    p_tconst VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    v_old_rating INTEGER;
BEGIN
    -- 1. Soft-delete the active rating and keep its value
    UPDATE user_title_ratings
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE uconst = p_uconst
      AND tconst = p_tconst
      AND deleted_at IS NULL
    RETURNING rating INTO v_old_rating;

    -- No active rating: nothing to remove
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 2. Last vote: delete the title's ratings row
    DELETE FROM ratings
    WHERE tconst = p_tconst
      AND num_votes = 1;

    -- 3. Otherwise remove the vote from the average
    IF NOT FOUND THEN
        UPDATE ratings
        SET average_rating = LEAST(GREATEST((average_rating * num_votes - v_old_rating) / (num_votes - 1), 1), 10),
            num_votes      = num_votes - 1
        WHERE tconst = p_tconst;
    END IF;

    PERFORM name_rating(p_tconst);
    RETURN TRUE;
END;
$$;
        
-- =====================================================================
-- 1-D.2 Simple search
-- Case-insensitive substring of the primary title, original title or
-- plot (original_title is included so Danish titles like "Jagten" are
-- found). The trimmed search is logged in search_history. An empty
-- search returns nothing and is not logged. Results are not ordered.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.string_search(
    p_uconst INTEGER,
    s        TEXT
)
RETURNS TABLE (
    tconst       VARCHAR,
    primarytitle TEXT
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    s := TRIM(s);
 
    IF s IS NULL OR s = '' THEN
        RETURN;
    END IF;
 
    PERFORM log_search(p_uconst, s);
 
    RETURN QUERY
    SELECT t.tconst, t.primary_title
    FROM titles t
    WHERE t.primary_title ILIKE '%' || s || '%'
       OR t.plot ILIKE '%' || s || '%'
       OR t.original_title ILIKE '%' || s || '%';
END;
$$;
	
	
-- =====================================================================
-- 1-D.3 Title rating
-- ratings.average_rating is kept up to date incrementally:
--   new vote:     (avg * n + new) / (n + 1)
--   changed vote: (avg * n - old + new) / n
-- If the user's rating is soft-deleted (deleted_at is set), rating
-- again reuses the row and counts as a new vote.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rate(
    p_uconst INTEGER,
    p_tconst VARCHAR,
    p_rating INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    v_old_rating     INTEGER;
    v_old_deleted_at TIMESTAMPTZ;
BEGIN
    -- 1. Validate rating, title and user
    IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Rating must be between 1 and 10, given: %', p_rating;
    END IF;
 
    IF NOT EXISTS (SELECT 1 FROM titles WHERE tconst = p_tconst) THEN
        RAISE EXCEPTION 'Title with tconst % does not exist', p_tconst;
    END IF;
 
    IF NOT EXISTS (SELECT 1 FROM users WHERE uconst = p_uconst) THEN
        RAISE EXCEPTION 'User with uconst % does not exist', p_uconst;
    END IF;
 
    -- 2. Fetch the user's existing rating of the title, if any
    SELECT rating, deleted_at INTO v_old_rating, v_old_deleted_at
    FROM user_title_ratings
    WHERE uconst = p_uconst AND tconst = p_tconst;
 
    -- 3. A: First rating of the title by the user
    IF NOT FOUND THEN
        INSERT INTO user_title_ratings (uconst, tconst, rating)
        VALUES (p_uconst, p_tconst, p_rating);
 
        -- One more vote: (avg * num_votes + new rating) / (num_votes + 1)
        UPDATE ratings
        SET average_rating = (average_rating * num_votes + p_rating) / (num_votes + 1),
            num_votes      = num_votes + 1
        WHERE tconst = p_tconst;
 
        -- Title had no votes yet, so the new rating is its average
        IF NOT FOUND THEN
            INSERT INTO ratings (tconst, average_rating, num_votes)
            VALUES (p_tconst, p_rating, 1);
        END IF;
 
    -- 4. B: User changes an active rating
    ELSIF v_old_deleted_at IS NULL THEN
        -- Same rating as before, nothing to change
        IF p_rating = v_old_rating THEN
            RETURN;
        END IF;
 
        UPDATE user_title_ratings
        SET rating     = p_rating
        WHERE uconst = p_uconst AND tconst = p_tconst;
 
        -- Same number of votes: swap the old rating for the new one
        UPDATE ratings
        SET average_rating = (average_rating * num_votes - v_old_rating + p_rating) / num_votes
        WHERE tconst = p_tconst;
 
    -- 5. C: User rates again after their rating was soft-deleted
    ELSE
        UPDATE user_title_ratings
        SET rating     = p_rating,
            deleted_at = NULL
        WHERE uconst = p_uconst AND tconst = p_tconst;
        -- New vote. remove_rating() deletes the ratings row when the
        -- last vote is removed, so the row may be gone.
        UPDATE ratings
        SET average_rating = (average_rating * num_votes + p_rating) / (num_votes + 1),
            num_votes      = num_votes + 1
        WHERE tconst = p_tconst;
        IF NOT FOUND THEN
            INSERT INTO ratings (tconst, average_rating, num_votes)
            VALUES (p_tconst, p_rating, 1);
        END IF;
    END IF;
    PERFORM name_rating(p_tconst);
END;
$$;
-- =====================================================================
-- 1-D.4 Structured string search
-- Each non-empty parameter must be a substring (case-insensitive) of
-- its field: primary title, plot, a character name on the title and a
-- person name on the title. Empty strings ('') are ignored. The
-- character and the person do not have to belong to the same credit.
-- The search is logged as the four parameters separated by ', '.
-- =====================================================================
CREATE OR REPLACE FUNCTION "public".structured_string_search (
    p_uconst INTEGER, 
    p_title TEXT, 
    p_plot TEXT, 
    p_characters TEXT, 
    p_names TEXT)
RETURNS table (tconst varchar(10), primary_title text)
AS $BODY$
BEGIN
	IF p_title = '' AND p_plot = '' AND p_characters = '' AND p_names = '' THEN
		RAISE EXCEPTION 'At least one search parameter must be non-empty';
	END IF;

	PERFORM log_search(p_uconst, p_title || ', ' || p_plot || ', ' || p_characters || ', ' || p_names);

	RETURN QUERY
	SELECT DISTINCT t.tconst, t.primary_title
	FROM titles t
	LEFT JOIN title_person_characters tpc ON tpc.tconst = t.tconst
	LEFT JOIN title_persons tp ON tp.tconst = t.tconst
	LEFT JOIN persons p ON p.nconst = tp.nconst
	WHERE (p_title = ''      OR t.primary_title    ILIKE '%' || p_title || '%'
	                         OR t.original_title   ILIKE '%' || p_title || '%')
	  AND (p_plot = ''       OR t.plot             ILIKE '%' || p_plot || '%')
	  AND (p_characters = '' OR tpc.character_name ILIKE '%' || p_characters || '%')
	  AND (p_names = ''      OR p.primary_name     ILIKE '%' || p_names || '%');
END $BODY$ LANGUAGE'plpgsql';

-- =====================================================================
-- 1-D.5 Finding names
-- Finds persons whose name contains the trimmed search string,
-- case-insensitively, ordered by name. actor_search only returns
-- persons with at least one actor or actress credit. The trimmed
-- search is logged in search_history. An empty search returns nothing
-- and is not logged.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.name_search(
    p_uconst INTEGER,
    p_name   TEXT
)
RETURNS TABLE (
    nconst       VARCHAR,
    primary_name TEXT
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    p_name := TRIM(p_name);

    IF p_name IS NULL OR p_name = '' THEN
        RETURN;
    END IF;

    PERFORM log_search(p_uconst, p_name);

    RETURN QUERY
    SELECT p.nconst, p.primary_name
    FROM persons p
    WHERE p.primary_name ILIKE '%' || p_name || '%'
    ORDER BY p.primary_name;
END;
$$;

-- As name_search, but only persons with at least one actor or actress credit.
CREATE OR REPLACE FUNCTION public.actor_search(
    p_uconst INTEGER,
    p_name   TEXT
)
RETURNS TABLE (
    nconst       VARCHAR,
    primary_name TEXT
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    p_name := TRIM(p_name);

    IF p_name IS NULL OR p_name = '' THEN
        RETURN;
    END IF;

    PERFORM log_search(p_uconst, p_name);

    RETURN QUERY
    SELECT DISTINCT p.nconst, p.primary_name
    FROM persons p
    JOIN title_persons tp ON tp.nconst = p.nconst
    WHERE tp.category IN ('actor', 'actress', 'self')
      AND p.primary_name ILIKE '%' || p_name || '%'
    ORDER BY p.primary_name;
END;
$$;

-- =====================================================================
-- 1-D.6 Finding co-players
--
-- The co_players(p_actor_name) function lists actors who have acted
-- in titles with the actor whose name matches p_actor_name
-- (case-insensitive). For each co-player, it returns their nconst,
-- name, the number of titles they share with the specified actor,
-- and a list of the shared titles.
--
-- The results are ordered by decreasing frequency and then
-- alphabetically by actor name.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.co_players(
    p_actor_name text
) 
RETURNS TABLE (
    nconst VARCHAR(10),
    primary_name TEXT,
    frequency BIGINT,
    movies TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        b.nconst,
        b.primary_name,
        COUNT(DISTINCT b.tconst) AS frequency,
        STRING_AGG(
            DISTINCT b.primary_title,
            ', ' ORDER BY b.primary_title
        ) AS movies
    FROM actor_title_credits a
    JOIN actor_title_credits b
        ON a.tconst = b.tconst
       AND a.nconst <> b.nconst
    WHERE a.primary_name ILIKE TRIM(p_actor_name)
    GROUP BY
        b.nconst,
        b.primary_name
    ORDER BY
        frequency DESC,
        b.primary_name;
$$;

-- =====================================================================
-- 1-D.8 Popular actors
--
-- The popular_actors(p_tconst) function returns the actors,
-- actresses and people appearing as themselves (category 'self')
-- in the title identified by p_tconst, together with their name
-- rating (persons.avg_name_rating).
-- The results are ordered by name rating, highest first, followed
-- by actor name and tconst. Actors without a name rating are listed
-- last.
--
-- =====================================================================
CREATE OR REPLACE FUNCTION public.popular_actors(
    p_tconst VARCHAR
)
RETURNS TABLE (
    tconst      VARCHAR,
    movie_title TEXT,
    nconst      VARCHAR,
    actor_name  TEXT,
    name_rating NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    SELECT DISTINCT
        t.tconst,
        t.primary_title AS movie_title,
        p.nconst,
        p.primary_name AS actor_name,
        p.avg_name_rating AS name_rating
    FROM titles t
    JOIN title_persons tp ON tp.tconst = t.tconst
    JOIN persons p ON p.nconst = tp.nconst
    WHERE t.tconst = p_tconst
      AND tp.category IN ('actor', 'actress', 'self')
    ORDER BY
        name_rating DESC NULLS LAST,
        actor_name,
        tconst;
$$;


-- =====================================================================
-- 1-D.9 Similar movies
-- The similar_movies(p_tconst) function returns a list of titles that are
-- similar to a given movie, series or video game. Similarity is defined based
-- on the number of genres shared between the input title and other titles.
-- The more genres two titles have in common, the higher the similarity score.

-- Movies (movie, tvMovie) are only matched with movies, series
-- (tvSeries, tvMiniSeries) are only matched with series, and video games
-- (videoGame) are only matched with video games. Any other title type gives
-- no results. The input title itself is excluded from the results.
-- The results are ordered by decreasing similarity score and then alphabetically
-- by title. The function name and the movie_title column are kept for
-- compatibility, even though the results can also be series or video games.
-- =====================================================================
CREATE OR REPLACE FUNCTION similar_movies(
    p_tconst VARCHAR
)
RETURNS TABLE (
    tconst VARCHAR,
    movie_title TEXT,
    similarity_score BIGINT,
    common_genres TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        t2.tconst,
        t2.primary_title AS movie_title,
        COUNT(*) AS similarity_score,
        STRING_AGG(
            g.genre_name,
            ', ' ORDER BY g.genre_name
        ) AS common_genres
    FROM titles t1
    JOIN genre_titles gt1
        ON gt1.tconst = t1.tconst
    JOIN genre_titles gt2
        ON gt2.gconst = gt1.gconst
    JOIN genres g
        ON g.gconst = gt1.gconst
    JOIN titles t2
        ON t2.tconst = gt2.tconst
    WHERE t1.tconst = p_tconst
      AND t2.tconst <> t1.tconst
      AND (
            (t1.title_type IN ('movie', 'tvMovie')
             AND t2.title_type IN ('movie', 'tvMovie'))
        OR (t1.title_type IN ('tvSeries', 'tvMiniSeries')
             AND t2.title_type IN ('tvSeries', 'tvMiniSeries'))
        OR (t1.title_type = 'videoGame'
             AND t2.title_type = 'videoGame')
      )
    GROUP BY t2.tconst, t2.primary_title
    ORDER BY similarity_score DESC, movie_title;
$$;
	
-- =====================================================================
-- 1-D.10 Frequent person words
-- The most frequent words from word_index across all titles the
-- person(s) matching p_name (ILIKE pattern) are credited on. Frequency
-- is the number of those titles the word is indexed for. Ordered by
-- frequency, then word. p_lenght limits the number of rows
-- (NULL = 10, must be > 0).
-- =====================================================================

CREATE OR REPLACE FUNCTION "public"."person_words"("p_name" text, "p_lenght" int4=NULL::integer)
  RETURNS TABLE("word" text, "frequency" int8) AS $BODY$BEGIN
  
  if p_lenght <= 0 THEN
    raise EXCEPTION 'Lenght is expected to be greater than zero %', p_lenght;
  end if;
  
  if p_lenght is null THEN
    p_lenght := 10;
  end if;
  
  
  return query
  select w.word, count(distinct w.tconst) as frequency
  from persons p
  join title_persons t on p.nconst = t.nconst
  join word_index w on w.tconst = t.tconst
  where p.primary_name ilike p_name
  GROUP BY w.word 
  order by count(distinct w.tconst) desc, w.word
  limit p_lenght;

END
$BODY$
  LANGUAGE plpgsql STABLE
  COST 100
  ROWS 1000;
	
-- =====================================================================
-- 1-D.11 Exact-match querying
-- Titles indexed in word_index by ALL keywords. Keywords are trimmed,
-- lowercased and deduplicated; empty keywords are dropped. The search
-- is logged as the keywords separated by spaces. Results are not
-- ordered. Implemented as GROUP BY/HAVING instead of INTERSECT, so the
-- query is the same for any number of keywords.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.exact_match_search(
    p_uconst            INTEGER,
    VARIADIC p_keywords TEXT[]
)
RETURNS TABLE (
    tconst        VARCHAR,
    primary_title TEXT
)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM unnest(p_keywords) AS k WHERE trim(k) <> '') THEN
        RETURN;
    END IF;

    PERFORM log_search(p_uconst, ARRAY_TO_STRING(p_keywords, ' '));
 
    RETURN QUERY
    WITH kw AS (
        SELECT DISTINCT LOWER(TRIM(k)) AS word
        FROM UNNEST(p_keywords) k
        WHERE TRIM(k) <> ''
    )
    SELECT t.tconst, t.primary_title
    FROM word_index w
    JOIN kw ON kw.word = w.word
    JOIN titles t ON t.tconst = w.tconst
    GROUP BY t.tconst, t.primary_title
    HAVING COUNT(DISTINCT w.word) = (SELECT COUNT(*) FROM kw);
END;
$$;
	
-- =====================================================================
-- 1-D.12 Best-match querying
-- =====================================================================

CREATE OR REPLACE FUNCTION "public"."best_match_querying"(IN "p_uconst" int4, VARIADIC "p_keywords" _text)
  RETURNS TABLE("tconst" varchar, "primary_title" text, "word_count" int8) AS $BODY$BEGIN

  -- blank search: return nothing, log nothing
  IF NOT EXISTS (SELECT 1 FROM unnest(p_keywords) AS k WHERE trim(k) <> '') THEN
    RETURN;
  END IF;

  PERFORM log_search(p_uconst, array_to_string(p_keywords, ' '));

  RETURN QUERY
  WITH kw AS (
      SELECT DISTINCT lower(trim(k)) AS word
      FROM unnest(p_keywords) AS k
      WHERE trim(k) <> ''
  )
  
  SELECT t.tconst, t.primary_title, count(distinct w.word) 
  FROM word_index w
  JOIN kw        ON kw.word = w.word
  JOIN titles t  ON t.tconst = w.tconst
  GROUP BY t.tconst, t.primary_title
  ORDER BY count(distinct w.word) desc, t.tconst;

END
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100
  ROWS 1000;

-- =====================================================================
-- 1-D.13 Word-to-words querying
-- =====================================================================
CREATE or replace FUNCTION "public".word_to_word_querying (
    variadic p_words text[]
)
  RETURNS table (t_word text, t_count bigint)
  AS $BODY$
  BEGIN
   return query

--  step 0: normalize keywords the same way as exact_match_search
--  (lowercase, trim, drop blanks, remove duplicates like 'Space'/'space')
   with kw as (
    select distinct lower(trim(k)) as word
    from unnest(p_words) as k
    where trim(k) <> ''
   ),

--  step 1: titles that contain every normalized keyword
   matched as (
    select w.tconst
    from word_index w
    join kw on kw.word = w.word
    group by w.tconst
    having count(distinct w.word) = (select count(*) from kw)
   )

--  step 2: count in how many matched titles each word appears
   select w.word, count(distinct w.tconst)
   from word_index w
   join matched m on m.tconst = w.tconst
   where w.word not in (select word from kw)
   group by w.word

--  step 3: top 10
   order by count(distinct w.tconst) DESC
   limit 10;

  END
$BODY$
  LANGUAGE plpgsql;

-- =====================================================================
-- 1-D.14 Weighted querying
-- A weighted inverted index built from word_index, with a relevance
-- weight per (word, title). The weight is a TF-IDF variant where TF is
-- the BM25 term frequency:
--   TF(d,t)  = n(d,t) * (k1 + 1)
--              / (n(d,t) + k1 * (1 - b + b * n(d) / avg n(d)))
--   IDF(t)   = ln(N / n(t))
--   weight   = TF(d,t) * IDF(t)
-- with k1 = 1.2 and b = 0.75 (standard BM25 values).
--
-- Plain TF = n(d,t) / n(d) was rejected: document lengths in word_index
-- range from a few words (titles without plot or persons) to several
-- hundred (titles with long casts). Short documents then dominated the
-- ranking. BM25 still favours short documents, but the TF is capped at
-- k1 + 1.
--
-- IMDb data is read-only, so IDF is constant and the weights are
-- computed once here instead of on every search. Common words get an
-- IDF close to 0, so no stop word list is needed.
-- =====================================================================

DROP TABLE IF EXISTS weighted_word_index;

CREATE TABLE weighted_word_index (
    word   text,
    tconst varchar(10) REFERENCES titles ON DELETE CASCADE,
    tf     double precision NOT NULL,  -- stored to make weights explainable
    idf    double precision NOT NULL,  -- (used in tests and the report)
    weight double precision NOT NULL,  -- tf * idf
    -- word first, so the primary key index supports lookups by keyword
    PRIMARY KEY (word, tconst)
);

INSERT INTO weighted_word_index (word, tconst, tf, idf, weight)
-- n(d,t): number of fields (t, p, c, n) the word occurs in for the title.
-- word_index stores one row per (title, word, field), so this is 1-4.
WITH n_dt AS (
    SELECT tconst, word, count(*)::float8 AS n_dt
    FROM word_index
    GROUP BY tconst, word
),
-- n(d): length of the title in the index (sum of its n(d,t))
n_d AS (
    SELECT tconst, sum(n_dt) AS n_d
    FROM n_dt
    GROUP BY tconst
),
-- n(t): number of titles the word occurs in
n_t AS (
    SELECT word, count(*)::float8 AS n_t
    FROM n_dt
    GROUP BY word
),
-- N: number of indexed titles (not all titles, so N and n(t) count the
-- same set of documents), and the average document length for BM25
stats AS (
    SELECT count(*)::float8 AS n, avg(n_d) AS avg_n_d
    FROM n_d
),
-- TF (BM25) and IDF per (word, title)
scored AS (
    SELECT dt.word,
           dt.tconst,
           dt.n_dt * (1.2 + 1)
             / (dt.n_dt + 1.2 * (1 - 0.75 + 0.75 * d.n_d / s.avg_n_d)) AS tf,
           ln(s.n / t.n_t)                                             AS idf
    FROM n_dt dt
    JOIN n_d d ON d.tconst = dt.tconst
    JOIN n_t t ON t.word   = dt.word
    CROSS JOIN stats s
)
SELECT word, tconst, tf, idf, tf * idf
FROM scored;

-- Update planner statistics for the newly filled table
ANALYZE weighted_word_index;


-- ---------------------------------------------------------------------
-- weighted_search(uconst, VARIADIC keywords)
--     -> (tconst, primary_title, score, matched_keywords)
-- Finds titles indexed by at least one keyword. Ranked by:
--   1. number of matching keywords (as best-match, 1-D.12)
--   2. score = sum of the matching keywords' weights
--   3. num_votes, so well-known titles come first on equal scores
-- Ranking on score alone let a single strong match in a short document
-- outrank titles matching all keywords, so the number of matches
-- decides first. Logs the search.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION weighted_search(p_uconst integer, VARIADIC p_keywords text[])
RETURNS TABLE (tconst varchar, primary_title text,
               score double precision, matched_keywords bigint)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM log_search(p_uconst, array_to_string(p_keywords, ' '));

    RETURN QUERY
    -- Keywords normalised as in exact_match_search: trimmed, lowercased,
    -- deduplicated, empty ones removed
    WITH kw AS (
        SELECT DISTINCT lower(trim(k)) AS word
        FROM unnest(p_keywords) AS k
        WHERE trim(k) <> ''
    )
    -- (word, tconst) is unique in the index and kw has no duplicates,
    -- so count(*) is the number of distinct matching keywords
    SELECT t.tconst, t.primary_title, sum(w.weight), count(*)
    FROM weighted_word_index w
    JOIN kw        ON kw.word  = w.word
    JOIN titles t  ON t.tconst = w.tconst
    LEFT JOIN ratings r ON r.tconst = t.tconst
    GROUP BY t.tconst, t.primary_title, r.num_votes
    -- Aggregates instead of the output names: in PL/pgSQL the RETURNS
    -- TABLE columns are also variables, so "score" would be ambiguous
    ORDER BY count(*) DESC,
             sum(w.weight) DESC,
             r.num_votes DESC NULLS LAST,
             t.tconst;
END;
$$;

COMMIT;