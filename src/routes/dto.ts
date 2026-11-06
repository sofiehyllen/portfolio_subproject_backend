/**
 * Data Transfer Objects (DTOs) — the shapes sent to clients in API responses.
 */
import { Title, TitleSummary } from '../data/titles.js';
import { User } from '../data/users.js';
import { BookmarkTitle, BookmarkPerson } from '../data/bookmarks.js';

const API_BASE = '/api';

export const uri = {
  title: (tconst: string) => `${API_BASE}/titles/${tconst}`,
  person: (nconst: string) => `${API_BASE}/persons/${nconst}`,
  user: (uconst: string | number) => `${API_BASE}/users/${uconst}`,
  bookmarkTitle: (uconst: string | number, tconst: string) => `${API_BASE}/users/${uconst}/bookmarks/title/${tconst}`,
  bookmarkPerson: (uconst: string | number, nconst: string) => `${API_BASE}/users/${uconst}/bookmarks/person/${nconst}`,
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

export interface TitleSummaryDto {
  url: string;
  primaryTitle: string;
  startYear: number | null;
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

export function toTitleSummaryDto(title: TitleSummary): TitleSummaryDto {
  return {
    url: uri.title(title.tconst),
    primaryTitle: title.primaryTitle,
    startYear: title.startYear,
  };
}

export interface UserBookmarkTitleDto {
  url: string;
  title: string;
  createdAt: Date;
}

export function toUserBookmarkTitleDto(bookmark: BookmarkTitle): UserBookmarkTitleDto {
  return {
    url: uri.bookmarkTitle(bookmark.uconst, bookmark.tconst),
    title: uri.title(bookmark.tconst),
    createdAt: bookmark.createdAt,
  };
}

export interface UserBookmarkPersonDto {
  url: string;
  person: string;
  createdAt: Date;
}

export function toUserBookmarkPersonDto(bookmark: BookmarkPerson): UserBookmarkPersonDto {
  return {
    url: uri.bookmarkPerson(bookmark.uconst, bookmark.nconst),
    person: uri.person(bookmark.nconst),
    createdAt: bookmark.createdAt,
  };
}