/**
 * Data Transfer Objects (DTOs) — the shapes sent to clients in API responses.
 */
import { RatingHistoryEntry, UserRating } from "../data/ratings.js";
import { Title, TitleSummary } from '../data/titles.js';
import { User } from '../data/users.js';

const API_BASE = '/api';

export const uri = {
  title: (tconst: string) => `${API_BASE}/titles/${tconst}`,
  person: (nconst: string) => `${API_BASE}/persons/${nconst}`,
  user: (uconst: string | number) => `${API_BASE}/users/${uconst}`,
  rating: (uconst: string | number, tconst: string) => `${API_BASE}/users/${uconst}/ratings/${tconst}`,
};

// The public profile. The password hash is never sent to the client.
export interface UserDto {
  url: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
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