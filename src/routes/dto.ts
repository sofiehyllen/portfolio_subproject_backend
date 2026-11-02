import { Title } from '../data/titles.js';

const API_BASE = '/api';

export const uri = {
  title: (tconst: string) => `${API_BASE}/titles/${tconst}`,
  person: (nconst: string) => `${API_BASE}/persons/${nconst}`,
};

export interface TitleDto {
  url: string;
  titleType: string;
  primaryTitle: string;
  originalTitle: string;
  isAdult: boolean;
  startYear: number;
  endYear: number;
  runtimeMinutes: number;
  awards: string;
  posterUrl: string;
  plot: string;
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