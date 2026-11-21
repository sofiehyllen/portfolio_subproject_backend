/**
 * Data Transfer Objects (DTOs): the shapes sent to clients, and mappers from stored rows.
 *
 * URL builders:
 * - `uri` — builders for every resource URL used in responses.
 *
 * Titles:
 * - `TitleDto` / `toTitleDto` — a title as listed.
 * - `TitleSummaryDto` / `toTitleSummaryDto` — compact title in search results.
 * - `CreditDto` — one credit of a title; used inside `TitleDetailDto`.
 * - `TitleDetailDto` / `toTitleDetailDto` — a title in full, with genres and credits.
 * - `ActorDto` / `toActorDto` — an actor of a title.
 * - `SimilarMovieDto` / `toSimilarMovieDto` — a movie sharing genres with a title.
 *
 * Persons:
 * - `PersonDto` / `toPersonDto` — a person as listed.
 * - `PersonDetailDto` / `toPersonDetailDto` — a person in full, with roles and known-for titles.
 * - `PersonTitleDto` / `toPersonTitleDto` — one title credit of a person.
 * - `CoPlayerDto` / `toCoPlayerDto` — a person who shares titles with another.
 * - `PersonWordDto` / `toPersonWordDto` — a word associated with a person's titles.
 *
 * Users:
 * - `UserDto` / `toUserDto` — a user's public profile (no password hash).
 *
 * Ratings:
 * - `UserRatingDto` / `toUserRatingDto` — a user's active rating of a title.
 * - `RatingHistoryDto` / `toRatingHistoryDto` — one entry in a user's rating history.
 *
 * Bookmarks:
 * - `UserBookmarkTitleDto` / `toUserBookmarkTitleDto` — a bookmarked title.
 * - `UserBookmarkPersonDto` / `toUserBookmarkPersonDto` — a bookmarked person.
 *
 * Search history:
 * - `UserSearchHistoryDto` / `toUserSearchHistoryDto` — one entry in a user's search history.
 */
import { RatingHistoryEntry, UserRating } from '../data/ratings.js';
import { Actor, SimilarMovie, Title, TitleDetail, TitleSummary } from '../data/titles.js';
import { User } from '../data/users.js';
import { BookmarkTitle, BookmarkPerson } from '../data/bookmarks.js';
import { UserSearchHistory } from '../data/search_history.js';
import { PersonDetail, Person, PersonTitle, CoPlayer, PersonWord } from '../data/persons.js';


// ── URL builders ──────────────────────────────────────────────────────────────

/** Builders for the API URLs sent to clients, so every response links to a resource the same way. */
export const uri = {
  title: (tconst: string) => `/api/titles/${tconst}`,
  person: (nconst: string) => `/api/persons/${nconst}`,
  user: (uconst: string | number) => `/api/users/${uconst}`,
  rating: (uconst: string | number, tconst: string) => `/api/users/${uconst}/ratings/${tconst}`,
  bookmarkTitle: (uconst: number, tconst: string) => `/api/users/${uconst}/bookmarks/titles/${tconst}`,
  bookmarkPerson: (uconst: number, nconst: string) => `/api/users/${uconst}/bookmarks/persons/${nconst}`,
  searchEntry: (uconst: string | number, sconst: string | number) => `/api/users/${uconst}/search-history/${sconst}`,
};


// ── Titles ────────────────────────────────────────────────────────────────────

/**
 * A title as sent to clients: the {@link Title} fields, with `url` in place of `tconst`.
 * @property url - URL of the title.
 */
export interface TitleDto {
  url:            string;
  titleType:      string;
  primaryTitle:   string;
  originalTitle:  string | null;
  isAdult:        boolean;
  startYear:      number | null;
  endYear:        number | null;
  runtimeMinutes: number | null;
  awards:         string | null;
  posterUrl:      string | null;
  plot:           string | null;
  rating:         { average: number; votes: number } | null;
}

/**
 * Maps a title row to the shape sent to clients.
 * @param title - The title row.
 * @returns The title with its URL.
 */
export function toTitleDto(title: Title): TitleDto {
  return {
    url:            uri.title(title.tconst),
    titleType:      title.titleType,
    primaryTitle:   title.primaryTitle,
    originalTitle:  title.originalTitle,
    isAdult:        title.isAdult,
    startYear:      title.startYear,
    endYear:        title.endYear,
    runtimeMinutes: title.runtimeMinutes,
    awards:         title.awards,
    posterUrl:      title.posterUrl,
    plot:           title.plot,
    rating:         title.rating,
  };
}

/**
 * A title in a search result as sent to clients.
 * @property url          - URL of the title.
 * @property primaryTitle - The title's main name.
 * @property startYear    - Release year, or `null`.
 */
export interface TitleSummaryDto {
  url:          string;
  primaryTitle: string;
  startYear:    number | null;
}

/**
 * Maps a search result row to the shape sent to clients.
 * @param title - The search result row.
 * @returns The summary with the title's URL.
 */
export function toTitleSummaryDto(title: TitleSummary): TitleSummaryDto {
  return {
    url:          uri.title(title.tconst),
    primaryTitle: title.primaryTitle,
    startYear:    title.startYear,
  };
}

/**
 * One credit of a title as sent to clients.
 * @property person     - URL and name of the credited person.
 * @property category   - Credit category, e.g. `actor` or `director`.
 * @property job        - Job description, or `null`.
 * @property characters - Characters played; empty when none.
 */
export interface CreditDto {
  person:     { url: string; name: string };
  category:   string;
  job:        string | null;
  characters: string[];
}

/**
 * One title in full as sent to clients: the list fields plus genres and credits.
 * @property genres  - Genre names, alphabetical.
 * @property credits - Credits in billing order, each linking to the person.
 */
export interface TitleDetailDto extends TitleDto {
  genres:  string[];
  credits: CreditDto[];
}

/**
 * Maps a title with genres and credits to the shape sent to clients.
 * @param title - The title with genres and credits.
 * @returns The title, with URLs for the title and every credited person.
 */
export function toTitleDetailDto(title: TitleDetail): TitleDetailDto {
  return {
    ...toTitleDto(title),
    genres:  title.genres,
    credits: title.credits.map(credit => ({
      person:     { url: uri.person(credit.nconst), name: credit.name },
      category:   credit.category,
      job:        credit.job,
      characters: credit.characters,
    })),
  };
}

/**
 * An actor of a title as sent to clients.
 * @property url        - URL of the person.
 * @property name       - The actor's name.
 * @property nameRating - The actor's name rating, or `null`.
 */
export interface ActorDto {
  url:        string;
  name:       string;
  nameRating: number | null;
}

/**
 * Maps an actor row to the shape sent to clients.
 * @param actor - The actor row.
 * @returns The actor with the person's URL.
 */
export function toActorDto(actor: Actor): ActorDto {
  return {
    url:        uri.person(actor.nconst),
    name:       actor.name,
    nameRating: actor.nameRating,
  };
}

/**
 * A similar movie as sent to clients.
 * @property url             - URL of the movie.
 * @property primaryTitle    - Name of the movie.
 * @property similarityScore - Higher means more shared genres.
 * @property commonGenres    - The shared genre names.
 */
export interface SimilarMovieDto {
  url:             string;
  primaryTitle:    string;
  similarityScore: number;
  commonGenres:    string[];
}

/**
 * Maps a similar-movie row to the shape sent to clients.
 * @param movie - The similar-movie row.
 * @returns The movie with its URL.
 */
export function toSimilarMovieDto(movie: SimilarMovie): SimilarMovieDto {
  return {
    url:             uri.title(movie.tconst),
    primaryTitle:    movie.primaryTitle,
    similarityScore: movie.similarityScore,
    commonGenres:    movie.commonGenres,
  };
}


// ── Persons ───────────────────────────────────────────────────────────────────

/**
 * A person as sent to clients: the {@link Person} fields, with `url` in place of `nconst`.
 * @property url - URL of the person.
 */
export interface PersonDto {
  url:           string;
  primaryName:   string;
  birthYear:     number | null;
  deathYear:     number | null;
  avgNameRating: number | null;
  professions:   string[];
}

/**
 * Maps a person row to the shape sent to clients.
 * @param item - The person row.
 * @returns The person with their URL.
 */
export function toPersonDto(item: Person): PersonDto {
  return {
    url:           uri.person(item.nconst),
    primaryName:   item.primaryName,
    birthYear:     item.birthYear,
    deathYear:     item.deathYear,
    avgNameRating: item.avgNameRating,
    professions:   item.professions,
  };
}

/**
 * One person in full as sent to clients: the list fields plus roles and known-for titles.
 * @property roles    - Distinct credit categories, alphabetical.
 * @property knownFor - Titles the person is known for, each with its URL and name.
 */
export interface PersonDetailDto extends PersonDto {
  roles:    string[];
  knownFor: { url: string; primaryTitle: string }[];
}

/**
 * Maps a person with roles and known-for titles to the shape sent to clients.
 * @param item - The person with details.
 * @returns The person, with URLs for the person and every known-for title.
 */
export function toPersonDetailDto(item: PersonDetail): PersonDetailDto {
  return {
    ...toPersonDto(item),
    roles:    item.roles,
    knownFor: item.knownFor.map(i => ({
      url:          uri.title(i.tconst),
      primaryTitle: i.primaryTitle,
    })),
  };
}

/**
 * One title credit of a person as sent to clients.
 * @property url          - URL of the title.
 * @property person       - URL of the person.
 * @property primaryTitle - Name of the title.
 * @property category     - Credit category, e.g. `actor` or `director`.
 * @property job          - Job description, or `null`.
 * @property characters   - Characters played; empty when none.
 */
export interface PersonTitleDto {
  url:          string;
  person:       string;
  primaryTitle: string;
  category:     string;
  job:          string | null;
  characters:   string[];
}

/**
 * Maps a title credit row to the shape sent to clients.
 * @param item - The title credit row.
 * @returns The credit with the title's and the person's URL.
 */
export function toPersonTitleDto(item: PersonTitle): PersonTitleDto {
  return {
    url:          uri.title(item.tconst),
    person:       uri.person(item.nconst),
    primaryTitle: item.primaryTitle,
    category:     item.category,
    job:          item.job,
    characters:   item.characters,
  };
}

/**
 * A co-player as sent to clients.
 * @property url         - URL of the co-player.
 * @property primaryName - The co-player's name.
 * @property frequency   - How often the two appear together.
 */
export interface CoPlayerDto {
  url:         string;
  primaryName: string;
  frequency:   number;
}

/**
 * Maps a co-player row to the shape sent to clients.
 * @param item - The co-player row.
 * @returns The co-player with their URL.
 */
export function toCoPlayerDto(item: CoPlayer): CoPlayerDto {
  return {
    url:         uri.person(item.nconst),
    primaryName: item.primaryName,
    frequency:   item.frequency,
  };
}

/**
 * A word associated with a person's titles, as sent to clients.
 * @property word      - The word.
 * @property frequency - How often the word occurs.
 */
export interface PersonWordDto {
  word:      string;
  frequency: number;
}

/**
 * Maps a person-word row to the shape sent to clients.
 * @param item - The person-word row.
 * @returns The word and its frequency.
 */
export function toPersonWordDto(item: PersonWord): PersonWordDto {
  return {
    word:      item.word,
    frequency: item.frequency,
  };
}


// ── Users ─────────────────────────────────────────────────────────────────────

/**
 * A user's public profile. The password hash is never sent.
 * @property url - URL of the user.
 */
export interface UserDto {
  url:       string;
  firstName: string;
  lastName:  string;
  username:  string;
  email:     string;
  createdAt: Date;
}

/**
 * Maps a stored user to the profile sent to clients, leaving out the password hash.
 * @param user - The stored user.
 * @returns The public profile.
 */
export function toUserDto(user: User): UserDto {
  return {
    url:       uri.user(user.uconst),
    firstName: user.firstName,
    lastName:  user.lastName,
    username:  user.username,
    email:     user.email,
    createdAt: user.createdAt,
  };
}


// ── Ratings ───────────────────────────────────────────────────────────────────

/**
 * A user's rating of one title as sent to clients.
 * @property url       - URL of the rating itself.
 * @property title     - URL of the rated title.
 * @property rating    - The rating, 1–10.
 * @property createdAt - When the rating was first given.
 * @property updatedAt - When the rating last changed.
 */
export interface UserRatingDto {
  url:       string;
  title:     string;
  rating:    number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Maps a stored rating to the shape sent to clients, leaving out `deletedAt`.
 * @param rating - The stored rating.
 * @returns The rating with its own URL and the title's URL.
 */
export function toUserRatingDto(rating: UserRating): UserRatingDto {
  return {
    url:       uri.rating(rating.uconst, rating.tconst),
    title:     uri.title(rating.tconst),
    rating:    rating.rating,
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt,
  };
}

/**
 * One item in a user's rating history as sent to clients.
 * @property url          - URL of the rating itself.
 * @property title        - URL of the rated title.
 * @property primaryTitle - Name of the title.
 * @property rating       - The rating, 1–10.
 * @property lastChange   - When the rating last changed.
 */
export interface RatingHistoryDto {
  url:          string;
  title:        string;
  primaryTitle: string;
  rating:       number;
  lastChange:   Date;
}

/**
 * Maps a rating history entry to the shape sent to clients.
 * @param uconst - Id of the user who owns the history.
 * @param entry  - The history entry.
 * @returns The entry with the rating's URL and the title's URL.
 */
export function toRatingHistoryDto(uconst: number, entry: RatingHistoryEntry): RatingHistoryDto {
  return {
    url:          uri.rating(uconst, entry.tconst),
    title:        uri.title(entry.tconst),
    primaryTitle: entry.primaryTitle,
    rating:       entry.rating,
    lastChange:   entry.lastChange,
  };
}


// ── Bookmarks ─────────────────────────────────────────────────────────────────

/**
 * A title bookmark as sent to clients.
 * @property url          - URL of the bookmark itself (use it to delete it).
 * @property title        - URL of the bookmarked title.
 * @property primaryTitle - Name of the title.
 * @property createdAt    - When the bookmark was created.
 */
export interface UserBookmarkTitleDto {
  url:          string;
  title:        string;
  primaryTitle: string;
  createdAt:    Date;
}

/**
 * Maps a title bookmark row to the shape sent to clients.
 * @param uconst   - Id of the user who owns the bookmark.
 * @param bookmark - The bookmark row.
 * @returns The bookmark with its own URL and the title's URL.
 */
export function toUserBookmarkTitleDto(uconst: number, bookmark: BookmarkTitle): UserBookmarkTitleDto {
  return {
    url:          uri.bookmarkTitle(uconst, bookmark.tconst),
    title:        uri.title(bookmark.tconst),
    primaryTitle: bookmark.title,
    createdAt:    bookmark.createdAt,
  };
}

/**
 * A person bookmark as sent to clients.
 * @property url         - URL of the bookmark itself (use it to delete it).
 * @property person      - URL of the bookmarked person.
 * @property primaryName - Name of the person.
 * @property createdAt   - When the bookmark was created.
 */
export interface UserBookmarkPersonDto {
  url:         string;
  person:      string;
  primaryName: string;
  createdAt:   Date;
}

/**
 * Maps a person bookmark row to the shape sent to clients.
 * @param uconst   - Id of the user who owns the bookmark.
 * @param bookmark - The bookmark row.
 * @returns The bookmark with its own URL and the person's URL.
 */
export function toUserBookmarkPersonDto(uconst: number, bookmark: BookmarkPerson): UserBookmarkPersonDto {
  return {
    url:         uri.bookmarkPerson(uconst, bookmark.nconst),
    person:      uri.person(bookmark.nconst),
    primaryName: bookmark.person,
    createdAt:   bookmark.createdAt,
  };
}


// ── Search history ────────────────────────────────────────────────────────────

/**
 * One search history entry as sent to clients.
 * @property url          - URL of the entry (use it to delete it).
 * @property searchString - The search as it was logged.
 * @property createdAt    - When the search was made.
 */
export interface UserSearchHistoryDto {
  url:          string;
  searchString: string;
  createdAt:    Date;
}

/**
 * Maps a list of search history entries to the shape sent to clients.
 * Unlike the other mappers, it takes and returns a whole list.
 * @param items  - The history entries.
 * @param uconst - Id of the user who owns the history.
 * @returns The entries, each with its own URL.
 */
export function toUserSearchHistoryDto(items: UserSearchHistory[], uconst: number): UserSearchHistoryDto[] {
  return items.map(sh => ({
    url:          uri.searchEntry(uconst, sh.sconst),
    searchString: sh.searchString,
    createdAt:    sh.createdAt,
  }));
}
