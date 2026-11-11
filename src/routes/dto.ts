/**
 * Data Transfer Objects (DTOs) — the shapes sent to clients in API responses.
 */
import { RatingHistoryEntry, UserRating } from "../data/ratings.js";
import { Actor, SimilarMovie, Title, TitleDetail, TitleSummary } from '../data/titles.js';
import { User } from '../data/users.js';
import { UserSearchHistory } from "../data/search_history.js";
import { PersonDetail, Person } from "../data/persons.js";
const API_BASE = '/api';

export const uri = {
  title: (tconst: string) => `${API_BASE}/titles/${tconst}`,
  person: (nconst: string) => `${API_BASE}/persons/${nconst}`,
  user: (uconst: string | number) => `${API_BASE}/users/${uconst}`,
  rating: (uconst: string | number, tconst: string) => `${API_BASE}/users/${uconst}/ratings/${tconst}`,
  searchEntry: (uconst: string | number, sconst: string | number) => `${API_BASE}/users/${uconst}/search-history/${sconst}`,
  persons: () => `${API_BASE}/person/`,
};

// The public profile. The password hash is never sent to the client.
export interface UserDto {
  url: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: Date;
}

export function toUserDto(user: User): UserDto {
  return {
    url: uri.user(user.uconst),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export interface TitleDto {
  url: string;
  titleType: string;
  primaryTitle: string;
  originalTitle: string | null;
  isAdult: boolean;
  startYear: number | null;
  endYear: number | null;
  runtimeMinutes: number | null;
  awards: string | null;
  posterUrl: string | null;
  plot: string | null;
  rating: { average: number; votes: number } | null;
}

export function toTitleDto(title: Title): TitleDto {
  return {
    url: uri.title(title.tconst),
    titleType: title.titleType,
    primaryTitle: title.primaryTitle,
    originalTitle: title.originalTitle,
    isAdult: title.isAdult,
    startYear: title.startYear,
    endYear: title.endYear,
    runtimeMinutes: title.runtimeMinutes,
    awards: title.awards,
    posterUrl: title.posterUrl,
    plot: title.plot,
    rating: title.rating,
  };
}

export interface CreditDto {
  person: { url: string; name: string };
  category: string;
  job: string | null;
  characters: string[];
}

export interface ActorDto {
  url: string;
  name: string;
  nameRating: number | null;
}

export function toActorDto(actor: Actor): ActorDto {
  return {
    url: uri.person(actor.nconst),
    name: actor.name,
    nameRating: actor.nameRating,
  };
}

// One title in full: the list fields plus genres and credits.
export interface TitleDetailDto extends TitleDto {
  genres: string[];
  credits: CreditDto[];
}

export function toTitleDetailDto(title: TitleDetail): TitleDetailDto {
  return {
    ...toTitleDto(title),
    genres: title.genres,
    credits: title.credits.map(credit => ({
      person: { url: uri.person(credit.nconst), name: credit.name },
      category: credit.category,
      job: credit.job,
      characters: credit.characters,
    })),
  };
}

export interface TitleSummaryDto {
  url: string;
  primaryTitle: string;
  startYear: number | null;
}

export function toTitleSummaryDto(title: TitleSummary): TitleSummaryDto {
  return {
    url: uri.title(title.tconst),
    primaryTitle: title.primaryTitle,
    startYear: title.startYear,
  };
}

export interface SimilarMovieDto {
  url: string;
  primaryTitle: string;
  similarityScore: number;
  commonGenres: string[];
}

export function toSimilarMovieDto(movie: SimilarMovie): SimilarMovieDto {
  return {
    url: uri.title(movie.tconst),
    primaryTitle: movie.primaryTitle,
    similarityScore: movie.similarityScore,
    commonGenres: movie.commonGenres,
  };
}

export interface UserRatingDto {
  url: string;
  title: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserRatingDto(rating: UserRating): UserRatingDto {
  return {
    url: uri.rating(rating.uconst, rating.tconst),
    title: uri.title(rating.tconst),
    rating: rating.rating,
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt,
  };
}

export interface RatingHistoryDto {
  url: string;
  title: string;
  primaryTitle: string;
  rating: number;
  lastChange: Date;
}

export function toRatingHistoryDto(uconst: number, entry: RatingHistoryEntry): RatingHistoryDto {
  return {
    url: uri.rating(uconst, entry.tconst),
    title: uri.title(entry.tconst),
    primaryTitle: entry.primaryTitle,
    rating: entry.rating,
    lastChange: entry.lastChange
  }
}

export interface UserSearchHistoryDto {
  url: string;
  searchString: string;
  createdAt: Date
}

export function toUserSearchHistoryDto(items: UserSearchHistory[], uconst: number): UserSearchHistoryDto[] {
  return items.map(sh => ({
    url: uri.searchEntry(uconst, sh.sconst),
    searchString: sh.searchString,
    createdAt: sh.createdAt
  }));
} 

export interface PersonDto {
  url: string;
  primaryName: string;
  birthYear: number     | null;
  deathYear: number     | null;
  avgNameRating: number | null;
  professions: string[];
}

export function toPersonDto(item: Person): PersonDto {
  return {
    url: uri.person(item.nconst),
    primaryName: item.primaryName,
    birthYear: item.birthYear,
    deathYear: item.deathYear,
    avgNameRating: item.avgNameRating,
    professions: item.professions
  };
}

export interface PersonDetailDto extends PersonDto {
  roles: string[],
  knownFor: {url: string, primaryTitle: string}[]
}

export function toPersonDetailDto(item: PersonDetail): PersonDetailDto {
  return {
    ...toPersonDto(item),
    roles:    item.roles,
    knownFor:       item.knownFor.map(i => ({
      url:          uri.title(i.tconst),
      primaryTitle: i.primaryTitle
    }))
  };
}

