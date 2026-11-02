# Task 1 – Design a Web API for departments and instructors

Fill this file in. Nothing is programmed here: the result is a specification
you could hand to someone else to implement. In Tasks 2 to 5 you implement
the instructors part of it yourself.

Work from the university database: departments (name, building, budget) and
instructors (id, name, department, salary).

---

## 1. Resources

| Resource | What it is | Why it earns a place in the API |
|---|---|---|
| Title | A film, series or episode from IMDb, with plot, genres, rating and credits | The centre of the application: every search ends at a title |
| Person | An actor, director, writer etc., with a name rating | Browsing people, co-players, bookmarking persons |
| User | A registered account | Owner of all personal data; register, view, update, delete |
<!-- | Token **** | Proof of a successful login | The API is stateless, so login creates a credential the client sends on later requests | -->

**IMDb data** (titles, persons and everything derived from them) is read-only: no `POST`, `PUT`, `PATCH` or `DELETE`.
**Framework data** (users, ratings, bookmarks, search history) supports CRUD (create, read, update and delete) where the operation makes sense (bookmarks and history entries have nothing to update).

**Not exposed:** `word_index` and `weighted_word_index`. They are the machinery
behind keyword search. Clients get search results, never index rows, and
exposing them would tie the contract to an implementation detail.


## 2. Paths

Write the paths. Plural nouns, no verbs, and a path identifies while a query
parameter narrows.

| Path | What it identifies |
|---|---|
| `/…` |  |
| `/…/{…}` |  |
| `/…/{…}/…` |  |

## 3. Operations

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `GET /…` |  | 200 |  |
| `GET /…/{id}` |  | 200 | 404 |
| `POST /…` |  | 201 | 400 |
| `PUT /…/{id}` |  |  |  |
| `DELETE /…/{id}` |  |  |  |

For each failure, say which status code and why that one.

## 4. Filtering, sorting and paging

Which query parameters does the collection accept? Give the default page size
and the maximum you will allow.

```
GET /…?…
```

## 5. One request and one response, in full

```
GET /…
Accept: application/json
```

```
200 OK
Content-Type: application/json

[ … ]
```

Use the DTO shape from the JSON exercises: the API does not send the salary.

## 6. Three questions to answer in a sentence each

1. Why is `/instructors?dept=Physics` better than `/departments/Physics/instructors`
   as the *only* way to get them? Or is it, and when?
2. A client asks for an instructor that does not exist. What is the status
   code, and what is in the body?
3. Someone proposes `POST /instructors/22222/raise-salary`. What is wrong
   with it in REST terms, and what would you write instead?
