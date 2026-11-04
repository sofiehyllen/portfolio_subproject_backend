/**
 * Data Transfer Objects (DTOs) — the shapes sent to clients in API responses.
 */
import { Title, TitleSummary } from '../data/titles.js';

const API_BASE = '/api';

export const uri = {
  title: (tconst: string) => `${API_BASE}/titles/${tconst}`,
  person: (nconst: string) => `${API_BASE}/persons/${nconst}`,
};

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