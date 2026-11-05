# API design (Subproject 2)

---

## 1. Resources

| Resource | What it is | Why it earns a place in the API |
|---|---|---|
| Title | A film, series or episode from IMDb, with plot, genres, rating and credits. Its actors and similar titles are sub-collections. | The centre of the application that users search for and browse; most searches end at a title|
| Person | An actor, director, writer etc., with name rating, professions and known-for titles. Their co-players and frequent words are sub-collections | Browsing people and following them to their titles; the target of person searches |
| User | A registered account, which owns its title ratings, bookmarks (on titles and persons) and search history | Owner of all personal data; register, view, update, delete |
| Token | Proof of a successful login | The API is stateless, so login creates a credential the client sends on later requests |

**IMDb data** (titles, persons and everything derived from them) is read-only: no `POST`, `PUT`, `PATCH` or `DELETE`.
**Framework data** (users, ratings, bookmarks, search history) supports CRUD (create, read, update and delete) where the operation makes sense (bookmarks and history entries have nothing to update).

**Not exposed:** `word_index` and `weighted_word_index`. They are the machinery
behind keyword search. Clients get search results, never index rows, and
exposing them would tie the contract to an implementation detail.


## 2. Paths

| Path | What it identifies |
|---|---|
| `/api/titles` | The collection of titles (narrowed by search parameters) |
| `/api/titles/{tconst}` | One specific title |
| `/api/titles/{tconst}/actors` | The actors of a title (ranked by name rating) |
| `/api/titles/{tconst}/similar` | Movies similar to a title (based on shared genres) |
| `/api/persons` | The collection of persons (narrowed by `name`, `actorsOnly`) |
| `/api/persons/{nconst}` | One specific person |
| `/api/persons/{nconst}/titles` | The titles a person has been credited on, each with their role |
| `/api/persons/{nconst}/co-players` | Actors who have co-acted with this person (ranked by frequency) |
| `/api/persons/{nconst}/words` | The most frequent words across this person's titles |
| `/api/related-words` | Words associated with the titles that match given words |
| `/api/users` | The collection of users (only `POST` is offered, to register) |
| `/api/users/{uconst}` | One specific user (profile) |
| `/api/users/{uconst}/password` | The user’s password (write-only: it can be replaced but never read)|
| `/api/auth/tokens` | Tokens (only `POST` is offered, to log in) |
| `/api/users/{uconst}/ratings` | A user's list of active ratings (rating history) |
| `/api/users/{uconst}/ratings/{tconst}` | A user's rating of one specific title |
| `/api/users/{uconst}/bookmarks/titles` | A user's list of bookmarked titles |
| `/api/users/{uconst}/bookmarks/titles/{tconst}` | One specific title bookmark |
| `/api/users/{uconst}/bookmarks/persons` | A user's list of bookmarked persons |
| `/api/users/{uconst}/bookmarks/persons/{nconst}` | One specific person bookmark |
| `/api/users/{uconst}/search-history` | A user's list of search history |
| `/api/users/{uconst}/search-history/{sconst}` | One specific search-history entry |

Ownership is expressed as a sub-resource (`/api/users/{uconst}/ratings`): a rating only exists in the context of a user.
Narrowing is expressed as a query parameter (`/api/titles?keywords=space`): a search does not identify a new thing, it narrows a collection.

## 3. Operations
**Authentication rules, stated once.**
Everything under `/api/titles` and `/api/persons`, `GET /api/related-words`, `POST /api/users` and `POST /api/auth/tokens` is public.
Every other path needs `Authorization: Bearer <token>`, and the user in the token must be the `{uconst}` in the path.
Searches on `/api/titles` and `/api/persons` accept an optional token. When one is present, the search is logged in the user's history. A token that is present but invalid is rejected with 401, not ignored.

**Failure codes used everywhere:**
`400` the request is malformed or a parameter fails validation (the server cannot process it as sent);
`401` no valid token (the caller is not identified), or wrong username or password at login;
`403` the caller is identified but not allowed: the token belongs to another user, or the current password given when changing the password is wrong;
`404` the resource does not exist (also for a deleted rating);
`409` the request conflicts with existing data (duplicate username or email).

### Accounts

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `POST /api/users` | Registers a user and returns the new profile. Body: `firstName`, `lastName`, `username`, `email`, `password`. The password is hashed before storage | 201, `Location` header | 400 missing or invalid field; 409 username or email already taken |
| `POST /api/auth/tokens` | Logs in. Body: `username`, `password`. Returns a token and the user's URI | 201 | 400 missing field; 401 wrong username or password (one message for both) |
| `GET /api/users/{uconst}` | Returns the user's profile (never the password hash) | 200 | 401; 403; 404 |
| `PATCH /api/users/{uconst}` | Updates the fields sent: `firstName`, `lastName`, `email` (username cannot be changed) | 200 | 400 invalid field, or username or password sent; 401; 403; 404; 409 email taken |
| `PUT /api/users/{uconst}/password` | Replaces the password. Body: `currentPassword`, `newPassword` | 204 | 400 missing field or new password fails the rules; 401 no valid token; 403 token belongs to another user, or the current password is wrong; 404 unknown user |
| `DELETE /api/users/{uconst}` | Deletes the user and all their ratings, bookmarks and history | 204 | 401; 403; 404 |

### IMDb data (read-only, public)

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `GET /api/titles` | Paged list of titles, optionally narrowed by one search mode | 200 | 400 invalid search parameter, or modes mixed; 401 invalid token |
| `GET /api/titles/{tconst}` | One title with genres, rating and credits | 200 | 404 unknown title |
| `GET /api/titles/{tconst}/actors` | Paged actors of the title, highest name rating first | 200 | 404 unknown title |
| `GET /api/titles/{tconst}/similar` | Paged movies sharing genres with the title. A title that is not a movie or tvMovie gives an empty list | 200 | 404 unknown title |
| `GET /api/persons` | Paged list of persons, optionally filtered by `name` and `actorsOnly` | 200 | 400 invalid search parameter; 401 invalid token |
| `GET /api/persons/{nconst}` | One person with name rating, professions and known-for titles | 200 | 404 unknown person |
| `GET /api/persons/{nconst}/titles` | Paged titles the person has been credited on, each with their role (category, job, characters)| 200 | 404 unknown person |
| `GET /api/persons/{nconst}/co-players` | Paged actors who share titles with the person, most frequent first | 200 | 404 unknown person |
| `GET /api/persons/{nconst}/words` | Paged most frequent words across the person's titles | 200 | 404 unknown person |
| `GET /api/related-words?words=a,b` | Paged words most associated with titles matching all the given words. Not logged in the search history | 200 | 400 missing or invalid `words` |

### Personal data (token required, owner only)

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `GET /api/users/{uconst}/ratings` | Paged rating history, newest change first | 200 | 401; 403 |
| `GET /api/users/{uconst}/ratings/{tconst}` | The user's rating of one title | 200 | 401; 403; 404 no active rating |
| `PUT /api/users/{uconst}/ratings/{tconst}` | Creates or changes the rating. Body: `{ "rating": 8 }`. Rating again after removing it counts as new | 201 new rating, 200 changed or unchanged | 400 rating not an integer 1-10; 401; 403; 404 unknown title |
| `DELETE /api/users/{uconst}/ratings/{tconst}` | Removes the user's rating (soft delete) | 204 | 401; 403; 404 no active rating |
| `GET /api/users/{uconst}/bookmarks/titles` | Paged title bookmarks, newest first | 200 | 401; 403 |
| `PUT /api/users/{uconst}/bookmarks/titles/{tconst}` | Bookmarks a title. Repeating it changes nothing | 204 | 401; 403; 404 unknown title |
| `DELETE /api/users/{uconst}/bookmarks/titles/{tconst}` | Removes a title bookmark | 204 | 401; 403; 404 no such bookmark |
| `GET /api/users/{uconst}/bookmarks/persons` | Paged person bookmarks, newest first | 200 | 401; 403 |
| `PUT /api/users/{uconst}/bookmarks/persons/{nconst}` | Bookmarks a person. Repeating it changes nothing | 204 | 401; 403; 404 unknown person |
| `DELETE /api/users/{uconst}/bookmarks/persons/{nconst}` | Removes a person bookmark | 204 | 401; 403; 404 no such bookmark |
| `GET /api/users/{uconst}/search-history` | Paged search history, newest first | 200 | 401; 403 |
| `DELETE /api/users/{uconst}/search-history/{sconst}` | Deletes one history entry | 204 | 401; 403; 404 no such entry for this user |
| `DELETE /api/users/{uconst}/search-history` | Clears the whole history | 204 | 401; 403 |

**POST** is used where the server assigns the address. **PUT** is used for ratings, bookmarks and the password because the client knows the full address and the call replaces the whole value, so repeating it has the same effect. **PATCH** is used for the profile because only some fields are sent. Success codes follow one rule: **201** when a resource is created, **200** when the response has a body, **204** when it has none. 

## 4. Filtering, sorting and paging

**Paging.** Every list accepts the same two parameters. The default page size is 20 and the maximum is 100.

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `limit` | integer | 20 | Number of items per page, from 1 to 100. A missing, non-integer or out-of-range value is replaced by the default of 20 |
| `offset` | integer | 0 | Number of items to skip before the page starts, at least 0. A missing, non-integer or negative value is replaced by 0 |

Every list response has the same structure: `total` (the number of items in the whole list), `limit`, `offset`, `items`, and `links` with `prev` and `next`. Each link is the URI of the same request at the neighbouring page, with all other query parameters kept, and is `null` when that page does not exist.

**Sorting.** The client cannot choose the order. Every list has a fixed, deterministic order, so pages never overlap or skip rows: titles alphabetically by primary title (then id as tiebreaker), persons by id, ranked searches by their rank (then id), bookmarks and histories newest first.

**Filtering titles.** `GET /api/titles` accepts one search mode per request. Mixing modes gives status code 400.

| Mode | Parameters | Meaning |
|---|---|---|
| Substring | `text` (1-100 characters) | Title, original title or plot contains the text |
| Keywords | `keywords` (comma separated, 1-10 words, each 1-50 characters), `match` = `all`, `any` or `weighted` (default `weighted`) | `all`: every keyword; `any`: at least one, ranked by how many; `weighted`: ranked by relevance |
| Structured | any of `title`, `plot`, `character`, `person` (each 1-100 characters) | Every given field must match; at least one is required |

**Filtering persons.** `GET /api/persons` accepts `name` (substring, case-insensitive, 1-100 characters) and `actorsOnly=true`.

```
GET /api/titles?keywords=space,war&match=weighted&limit=20&offset=0
GET /api/titles?title=alien&person=weaver
GET /api/persons?name=hanks&actorsOnly=true
GET /api/users/5/ratings?limit=10&offset=10
```

## 5. One request and one response, in full

A paged list of titles, with a small page size so the paging links show up.

```
GET /api/titles?limit=2&offset=0
Accept: application/json
```

```
200 OK
Content-Type: application/json

{
  "total": 300,
  "limit": 2,
  "offset": 0,
  "items": [
    {
      "url": "http://localhost:3000/api/titles/tt0068646",
      "titleType": "movie",
      "primaryTitle": "The Godfather",
      "originalTitle": "The Godfather",
      "isAdult": false,
      "startYear": 1972,
      "endYear": null,
      "runtimeMinutes": 175,
      "awards": null,
      "posterUrl": null,
      "plot": "The aging patriarch of an organized crime dynasty transfers control to his reluctant son."
    },
    {
      "url": "http://localhost:3000/api/titles/tt0111161",
      "titleType": "movie",
      "primaryTitle": "The Shawshank Redemption",
      "originalTitle": "The Shawshank Redemption",
      "isAdult": false,
      "startYear": 1994,
      "endYear": null,
      "runtimeMinutes": 142,
      "awards": null,
      "posterUrl": null,
      "plot": "Two imprisoned men bond over a number of years, finding solace and eventual redemption."
    }
  ],
  "links": {
    "prev": null,
    "next": "http://localhost:3000/api/titles?limit=2&offset=2"
  }
}
```

Every item has a `url`, so the client can follow it without building any address itself.
`prev` is `null` because this is the first page. Fields with no data in the database are `null`.

Every error has the same shape, with no stack trace, SQL or database identifiers:

```
GET /api/titles/tt0000000
Accept: application/json
```

```
404 Not Found
Content-Type: application/json

{ "status": 404, "error": "Not Found", "message": "Title not found" }
```


