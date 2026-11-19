# API design (Subproject 2)

---

## 1. Resources

| Resource | What it is | Why it earns a place in the API |
|---|---|---|
| Title | Any IMDb title (e.g. a film, series, episode or video game), with plot, genres, rating and credits. Its actors and similar titles are sub-collections. | The centre of the application that users search for and browse; most searches end at a title |
| Person | An actor, director, writer etc., with name rating, professions, roles and known-for titles. Their credited titles, co-players and frequent words are sub-collections. | Browsing people and following them to their titles; the target of person searches |
| User | A registered account, which owns its title ratings, bookmarks (on titles and persons) and search history | Owner of all personal data; register, view, update, delete |
| Token | Proof of a successful login | The API is stateless, so login creates a credential stored in an HttpOnly cookie that the browser sends automatically on later requests |

**IMDb data** (titles, persons and everything derived from them) is read-only: no `POST`, `PUT`, `PATCH` or `DELETE`. IMDb data only changes indirectly, through a user's ratings: rating a title (`rate()`), removing a rating (`remove_rating()`) or deleting a user (`delete_user()`, which removes all the user's ratings) updates the title's average rating and vote count, and recalculates the name ratings.
**Framework data** (users, ratings, bookmarks, search history) supports CRUD (create, read, update and delete) where the operation makes sense (bookmarks and history entries have nothing to update). Search history entries are not created directly by the client, but as a side effect of a title or person search made with a token. Only the first page of a search is logged, so paging through the results does not log it again.

**Related words** (`/api/related-words`) is not a stored resource but a computed collection: up to 10 words most associated with the titles matching all the given words.

**Not exposed:** `word_index` and `weighted_word_index`. They are the machinery behind keyword search, related words and a person's frequent words. Clients get results, never index rows, and exposing them would tie the contract to an implementation detail.


## 2. Paths

| Path | What it identifies |
|---|---|
| `/api/titles` | The collection of titles, narrowed by search parameters, or filtered (`genre`, `titleType`) and sorted (`sort`, `order`) when not searching |
| `/api/titles/{tconst}` | One specific title |
| `/api/titles/{tconst}/actors` | The actors of a title, including people appearing as themselves (ranked by name rating) |
| `/api/titles/{tconst}/similar` | Titles of the same kind as the given title (movies, series or video games), ranked by the number of genres they share with it |
| `/api/persons` | The collection of persons, narrowed by `name` and `actorsOnly`, and sorted (`sort`, `order`) |
| `/api/persons/{nconst}` | One specific person |
| `/api/persons/{nconst}/titles` | The titles a person has been credited on, each with their role |
| `/api/persons/{nconst}/co-players` | Actors who have co-acted with this person (ranked by frequency) |
| `/api/persons/{nconst}/words` | The 10 most frequent words across this person's titles |
| `/api/related-words` | The 10 words most associated with the titles that match all the given words |
| `/api/users` | The collection of users (only `POST` is offered, to register) |
| `/api/users/{uconst}` | One specific user (profile) |
| `/api/users/{uconst}/password` | The user’s password (write-only: it can be replaced but never read)|
| `/api/auth/token` | The session token (POST to log in, DELETE to log out) |
| `/api/users/{uconst}/ratings` | A user's list of active ratings (rating history) |
| `/api/users/{uconst}/ratings/{tconst}` | A user's rating of one specific title |
| `/api/users/{uconst}/bookmarks/titles` | A user's list of bookmarked titles |
| `/api/users/{uconst}/bookmarks/titles/{tconst}` | One specific title bookmark |
| `/api/users/{uconst}/bookmarks/persons` | A user's list of bookmarked persons |
| `/api/users/{uconst}/bookmarks/persons/{nconst}` | One specific person bookmark |
| `/api/users/{uconst}/search-history` | A user's list of search history |
| `/api/users/{uconst}/search-history/{sconst}` | One specific search-history entry |

**Ownership** is expressed as a sub-resource (`/api/users/{uconst}/ratings`): a rating only exists in the context of a user.
**Narrowing** is expressed as a query parameter (`/api/titles?keywords=space`): a search does not identify a new thing, it narrows a collection.

## 3. Operations
**Authentication rules, stated once.**
Everything under `/api/titles` and `/api/persons`, `GET /api/related-words`, `POST /api/users`, `POST /api/auth/token` and `DELETE /api/auth/token` is public.
Every other path requires a valid JWT cookie (set at login), and the user in the token must be the `{uconst}` in the path.
Searches on `/api/titles` and `/api/persons` accept an optional token cookie. When one is present, the search is logged in the user's history. A token that is present but invalid is rejected with 401, not ignored.

**Failure codes used everywhere:**<br>
`400` the request is malformed or a parameter fails validation (the server cannot process it as sent). This includes an unknown query parameter on `GET /api/titles` or `GET /api/persons`, a body that is not valid JSON, and a path identifier in the wrong format:

* `nconst`: must start with `nm` followed by 7-8 digits;
* `tconst`: must start with `tt` followed by 7-8 digits;
* `uconst`/`sconst`: must be a positive integer without a sign or leading zeros, at most 2147483647;

`401` no valid token (the caller is not identified), or wrong username or password at login;<br>
`403` the caller is identified but not allowed: the token belongs to another user, or the current password given when changing the password is wrong;<br>
`404` the resource does not exist: an unknown endpoint, or a user, title, person, rating, bookmark or search-history entry that is not found (also for a deleted rating);<br>
`409` the request conflicts with existing data: a duplicate username (at registration) or email (at registration or profile update);<br>
`413` the request body is too large;<br>
`415` the request body has an unsupported encoding;<br>
`500` an unexpected error. The response never reveals stack traces, SQL text or database identifiers.

### Accounts

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `POST /api/users` | Registers a user and returns the new profile. Body: `firstName`, `lastName`, `username`, `email`, `password`. The password is hashed before storage | 201, `Location` header | `400` missing or invalid field; `409` username or email already taken |
| `POST /api/auth/token` | Logs in. Body: `username`, `password`. Sets an HttpOnly JWT cookie valid for 12 hours and returns the user's URI. The token is not in the body | 200 | `400` missing field; `401` wrong username or password (one message for both) |
| `DELETE /api/auth/token` | Logs out. Clears the JWT cookie. Public and idempotent: logging out without being logged in also succeeds | 204 | — |
| `GET /api/users/{uconst}` | Returns the user's profile (never the password hash) | 200 | `400` invalid uconst; `401`; `403`; `404` |
| `PATCH /api/users/{uconst}` | Updates the fields sent: `firstName`, `lastName`, `email` (username cannot be changed) | 200 | `400` invalid field or uconst, or username or password sent; `401`; `403`; `404`; `409` email taken |
| `PUT /api/users/{uconst}/password` | Replaces the password. Body: `currentPassword`, `newPassword` | 204 | `400` missing field or new password fails the rules or invalid uconst; `401` no valid token; `403` token belongs to another user, or the current password is wrong; `404` unknown user |
| `DELETE /api/users/{uconst}` | Deletes the user and all their ratings, bookmarks and history | 204 | `400` invalid uconst; `401`; `403`; `404`|

### IMDb data (read-only, public)

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `GET /api/titles` | Paged list of titles, either browsed (sorted and filtered by genre and title type) or narrowed by one search mode | 200 | `400` invalid search, sort or filter parameter, unknown query parameter, or modes mixed; `401` invalid token |
| `GET /api/titles/{tconst}` | One title with genres, rating and credits | 200 | `400` invalid tconst; `404` unknown title |
| `GET /api/titles/{tconst}/actors` | Paged actors of the title, including people appearing as themselves, highest name rating first | 200 | `400` invalid tconst; `404` unknown title |
| `GET /api/titles/{tconst}/similar` | Paged titles of the same kind sharing genres with the title, most shared genres first: `movie` and `tvMovie` match each other, `tvSeries` and `tvMiniSeries` match each other, and `videoGame` matches `videoGame`. Any other type (for example `tvEpisode` or `short`) gives an empty list | 200 | `400` invalid tconst; `404` unknown title |
| `GET /api/persons` | Paged list of persons, optionally filtered by `name` and `actorsOnly`, and sorted by name or rating | 200 | `400` invalid search or sort parameter, or unknown query parameter; `401` invalid token |
| `GET /api/persons/{nconst}` | One person with name rating, professions and known-for titles | 200 | `400` invalid nconst; `404` unknown person |
| `GET /api/persons/{nconst}/titles` | Paged titles the person has been credited on, each with their role (category, job, characters)| 200 | `400` invalid nconst; `404` unknown person |
| `GET /api/persons/{nconst}/co-players` | Paged actors who share titles with the person, most frequent first | 200 | `400` invalid nconst; `404` unknown person |
| `GET /api/persons/{nconst}/words` | Paged most frequent words across the person's titles, at most 10 in all | 200 | `400` invalid nconst; `404` unknown person |
| `GET /api/related-words?words=a,b` | Paged words most associated with titles matching all the given words, at most 10 in all. Not logged in the search history | 200 | `400` missing or invalid `words` |

### Personal data (token required, owner only)

| Method and path | Does what | Success | Failure |
|---|---|---|---|
| `GET /api/users/{uconst}/ratings` | Paged rating history, newest change first | 200 | `400` invalid uconst; `401`; `403`; `404` unknown user |
| `GET /api/users/{uconst}/ratings/{tconst}` | The user's rating of one title | 200 |  `400` invalid tconst or uconst; `401`; `403`; `404` unknown user or no active rating |
| `PUT /api/users/{uconst}/ratings/{tconst}` | Creates or changes the rating. Body: `{ "rating": 8 }`. Rating again after removing it counts as new | 201 new rating, 200 changed or unchanged | `400` rating not an integer 1-10 or invalid tconst/uconst; `401`; `403`; `404` unknown user or title |
| `DELETE /api/users/{uconst}/ratings/{tconst}` | Removes the user's rating (soft delete) | 204 | `400` invalid tconst or uconst; `401`; `403`; `404` unknown user or no active rating |
| `GET /api/users/{uconst}/bookmarks/titles` | Paged title bookmarks, newest first | 200 | `400` invalid uconst; `401`; `403`; `404` unknown user |
| `PUT /api/users/{uconst}/bookmarks/titles/{tconst}` | Bookmarks a title. Repeating it changes nothing | 204 | `400` invalid tconst or uconst; `401`; `403`; `404` unknown user or title |
| `DELETE /api/users/{uconst}/bookmarks/titles/{tconst}` | Removes a title bookmark | 204 | `400` invalid tconst or uconst; `401`; `403`; `404` unknown user or no such bookmark |
| `GET /api/users/{uconst}/bookmarks/persons` | Paged person bookmarks, newest first | 200 | `400` invalid uconst; `401`; `403`; `404` unknown user |
| `PUT /api/users/{uconst}/bookmarks/persons/{nconst}` | Bookmarks a person. Repeating it changes nothing | 204 | `400` invalid nconst or uconst; `401`; `403`; `404` unknown user or person |
| `DELETE /api/users/{uconst}/bookmarks/persons/{nconst}` | Removes a person bookmark | 204 | `400` invalid nconst or uconst; `401`; `403`; `404` unknown user or no such bookmark |
| `GET /api/users/{uconst}/search-history` | Paged search history, newest first | 200 | `400` invalid uconst; `401`; `403`; `404` unknown user |
| `DELETE /api/users/{uconst}/search-history/{sconst}` | Deletes one history entry | 204 | `400` invalid uconst or sconst; `401`; `403`; `404` unknown user or no such entry for this user |
| `DELETE /api/users/{uconst}/search-history` | Clears the whole history | 204 | `400` invalid uconst; `401`; `403`; `404` unknown user |

**POST** is used where the server assigns the address. **PUT** is used for ratings, bookmarks and the password because the client knows the full address and the call replaces the whole value, so repeating it has the same effect. **PATCH** is used for the profile because only some fields are sent. Success codes follow one rule: **201** when a resource is created, **200** when the response has a body, **204** when it has none. 

## 4. Filtering, sorting and paging

**Paging.** Every list accepts the same two parameters. The default page size is 20 and the maximum is 100.

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `limit` | integer | 20 | Number of items per page, from 1 to 100. A missing, non-integer or out-of-range value is replaced by the default of 20 |
| `offset` | integer | 0 | Number of items to skip before the page starts, at least 0. A missing, non-integer or negative value is replaced by 0 |

Every list response has the same structure: `total` (the number of items in the whole list), `limit`, `offset`, `items`, and `links` with `prev` and `next`. Each link is the URI of the same request at the neighbouring page, with all other query parameters kept, and is `null` when that page does not exist.

**Sorting.** Every list has a deterministic order, so pages never overlap or skip rows. Two lists let the client choose it: the browsing list of titles (`GET /api/titles` without a search) and the list of persons (`GET /api/persons`). Every other list has a fixed order, with the id as the last tie-breaker (for the word lists, the word itself):

| List | Order |
|---|---|
| Title search, `match=any` or `weighted` | By rank, highest first |
| Title search, substring, structured or `match=all` | By id |
| Actors of a title | Name rating, highest first (actors without one last), then name |
| Similar titles | Number of shared genres, highest first, then title |
| Credited titles of a person | Start year, newest first (titles without one last) |
| Co-players | Frequency, highest first, then name |
| Person words, related words | Frequency, highest first, then word |
| Bookmarks, search history | Newest first |
| Rating history | Newest change first |

**Browsing titles.** Without a search, `GET /api/titles` accepts these parameters. Titles without a value for the sort field (for example no rating) come last in both directions, and the id breaks ties. An unknown `sort` or `order` gives status code 400. An unknown genre or title type is not an error; it gives an empty list.

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `sort` | string | `title` | `title` (primary title), `year` (start year), `rating` (average rating), `votes` (number of votes) or `runtime` (minutes) |
| `order` | string | `asc` | `asc` or `desc` |
| `genre` | string | none | Only titles with this genre, for example `Drama` (1-100 characters, case-insensitive) |
| `titleType` | string | none | Only titles of this type, for example `movie` or `tvSeries` (1-100 characters, case-insensitive) |

**Browsing persons.** `GET /api/persons` accepts these parameters, also when it is narrowed by `name`. Persons without a name rating come last in both directions, and name, then id, breaks ties. An unknown `sort` or `order` gives status code 400.

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `sort` | string | `name` | `name` (primary name) or `rating` (average name rating) |
| `order` | string | `asc` | `asc` or `desc` |

**Filtering titles.** `GET /api/titles` accepts one search mode per request. Mixing modes, or combining a search with the browsing parameters above, gives status code 400.

| Mode | Parameters | Meaning |
|---|---|---|
| Substring | `text` (1-100 characters) | Title, original title or plot contains the text |
| Keywords | `keywords` (comma separated, 1-10 words, each 1-50 characters), `match` = `all`, `any` or `weighted` (default `weighted`) | `all`: every keyword; `any`: at least one, ranked by how many; `weighted`: ranked by relevance |
| Structured | any of `title`, `plot`, `character`, `person` (each 1-100 characters) | Every given field must match; at least one is required |

**Unknown parameters.** `GET /api/titles` and `GET /api/persons` accept only the parameters listed in this section for them (titles: paging, browsing and search; persons: paging, `name`, `actorsOnly`, `sort` and `order`). Any other query parameter, for example a typo like `?sortt=year`, gives status code 400 instead of being silently ignored, so the client finds out that the parameter had no effect. The check is made before anything else (for titles in both browsing and search mode), and the message names every unknown parameter, comma separated inside the quotes:

```
GET /api/titles?text=love&sortt=year
```

```
400 Bad Request
Content-Type: application/json

{ "status": 400, "error": "Bad Request", "message": "unknown query parameter 'sortt'" }
```

**Filtering persons.** `GET /api/persons` accepts `name` (substring, case-insensitive, 1-100 characters) and `actorsOnly=true`, which is only allowed together with `name` (otherwise status code 400).

```
GET /api/titles?sort=rating&order=desc&genre=Drama&titleType=movie
GET /api/titles?keywords=space,war&match=weighted&limit=20&offset=0
GET /api/titles?title=alien&person=weaver
GET /api/persons?name=hanks&actorsOnly=true
GET /api/related-words?words=space,war
GET /api/users/5/ratings?limit=10&offset=10
```

## 5. One request and one response, in full

A paged list of titles (example data), with a small page size so the paging links show up.

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
      "url": "/api/titles/tt0068646",
      "titleType": "movie",
      "primaryTitle": "The Godfather",
      "originalTitle": "The Godfather",
      "isAdult": false,
      "startYear": 1972,
      "endYear": null,
      "runtimeMinutes": 175,
      "awards": null,
      "posterUrl": null,
      "plot": "The aging patriarch of an organized crime dynasty transfers control to his reluctant son.",
      "rating": { "average": 9.2, "votes": 2000000 }
    },
    {
      "url": "/api/titles/tt0111161",
      "titleType": "movie",
      "primaryTitle": "The Shawshank Redemption",
      "originalTitle": "The Shawshank Redemption",
      "isAdult": false,
      "startYear": 1994,
      "endYear": null,
      "runtimeMinutes": 142,
      "awards": null,
      "posterUrl": null,
      "plot": "Two imprisoned men bond over a number of years, finding solace and eventual redemption.",
      "rating": { "average": 9.3, "votes": 3000000 }
    }
  ],
  "links": {
    "prev": null,
    "next": "/api/titles?limit=2&offset=2"
  }
}
```

Every item has a `url`, so the client can follow it without building any address itself.
`url` and the paging links are paths relative to the API host (no scheme or host).
`prev` is `null` because this is the first page. Fields with no data in the database are `null`, and so is `rating` for a title without votes.

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

## 6. Cross-origin policy

The frontend (Subproject 3) is served from another origin than the API, so the browser only lets it read responses when the API allows that origin. The policy is set with the `cors` middleware in `app.ts`.

| Setting | Value | Why |
|---|---|---|
| Allowed origin | Exactly one, from `CORS_ORIGIN` (default `http://localhost:5173`) | Only our own frontend may read responses. |
| Credentials | Allowed (`Access-Control-Allow-Credentials: true`) | The token travels in the `jwt` cookie; without this the browser neither sends the cookie nor sets it at login. The frontend must call `fetch(url, { credentials: 'include' })` |
| Methods | `GET`, `PUT`, `PATCH`, `POST`, `DELETE` | The methods the API offers (section 3) |
| Exposed headers | `Location` | So the frontend can read the URI of a new user after `POST /api/users` |

The middleware runs first in the chain, so preflight (`OPTIONS`) requests are answered before any other middleware, and error responses (400, 401, 404, 500) also carry the headers, so the frontend can read the error body.
