# Subproject 2: Requirements (2-A.5)

User stories derived from the database functions in `D_functions.sql`.

## Actors

- **Visitor**: not logged in
- **User**: registered and logged in

## User stories

### Accounts

| ID | Story | Source |
|---|---|---|
| US-1 | As a visitor, I want to register an account so I want to save my activity. | `create_user` |
| US-2 | As a visitor, I want to log in with username and password so my requests are tied to me. | `get_user_by_username` plus hash check in code |
| US-3 | As a user, I want to view my profile. | `get_user_by_id` |
| US-4 | As a user, I want to update my profile. | `update_user` |
| US-5 | As a user, I want to change my password. | `update_user_password` |
| US-6 | As a user, I want to delete my account and all my data. | `delete_user` |

### Browsing

| ID | Story | Source |
|---|---|---|
| US-7 | As a visitor, I want to view a title's details (genres, cast, characters, plot, rating). | *query:* `titles`, `ratings`, `genre_titles`, `genres`, `title_persons`, `persons`, `title_person_characters` |
| US-8 | As a visitor, I want to view a person's details (name, name rating, professions, known-for titles). | *query:* `persons`, `person_professions`, `professions`, `person_known_for`, `titles` |
| US-8b | As a visitor, I want to see all the titles a person has been credited on, with their role. | *query:* `title_persons`, `titles`, `title_person_characters` |
| US-9 | As a visitor, I want to browse a list of titles. | *query:* `titles`, `ratings` |
| US-9b | As a visitor, I want to sort the list of titles by title, year, rating, number of votes or runtime, ascending or descending, so I can find e.g. the highest rated titles. | *query:* `titles`, `ratings` |
| US-9c | As a visitor, I want to filter the list of titles by genre and title type, so I only see e.g. drama movies. | *query:* `titles`, `genre_titles`, `genres` |

### Searching

| ID | Story | Source |
|---|---|---|
| US-10 | As a visitor, I want to search titles by a string in title or plot. | `string_search` |
| US-11 | As a visitor, I want to search by title, plot, character and person name together. | `structured_string_search` |
| US-12 | As a visitor, I want to search persons by name, or actors only. | `name_search`, `actor_search` |
| US-13 | As a visitor, I want to find titles matching all my keywords. | `exact_match_search` |
| US-14 | As a visitor, I want to find titles matching any keyword, ranked by how many match. | `best_match_querying` |
| US-15 | As a visitor, I want to get titles ranked by relevance. | `weighted_search` |
| US-16 | As a visitor, I want to see which words are most associated with the titles matching my words. | `word_to_word_querying` |

### Insight

| ID | Story | Source |
|---|---|---|
| US-17 | As a visitor, I want to see an actor's co-players and in which movies they've appered together. | `co_players` |
| US-18 | As a visitor, I want to see a title's actors ranked by name rating. | `popular_actors` |
| US-19 | As a visitor, I want to see movies similar to a given movie. | `similar_movies` |
| US-20 | As a visitor, I want to see the most frequent words for a person's titles. ******| `person_words` |

### Personal data

| ID | Story | Source |
|---|---|---|
| US-21 | As a user, I want to bookmark and unbookmark titles and list my bookmarks. | `add_title_bookmark`, `remove_title_bookmark`, `get_title_bookmarks`|
| US-22 | As a user, I want to bookmark and unbookmark persons and list my bookmarks. | `add_person_bookmark`, `remove_person_bookmark`, `get_person_bookmarks`|
| US-23 | As a user, I want to rate a title 1–10, change my rating, and remove it. | `rate`, `remove_rating` |
| US-24 | As a user, I want to see my rating history. | `get_title_rating_history` ******|
| US-25 | As a user, I want to view my search history, delete one entry, or clear it all. | `get_search_history`, `clear_search_history_entry`, `clear_search_history` |
