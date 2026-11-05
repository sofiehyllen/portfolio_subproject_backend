import { Title } from '../data/titles.js';
import { User } from '../data/users.js';

const API_BASE = '/api';

export const uri = {
  title: (tconst: string) => `${API_BASE}/titles/${tconst}`,
  person: (nconst: string) => `${API_BASE}/persons/${nconst}`,
  user: (uconst: string | number) => `${API_BASE}/users/${uconst}`,
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