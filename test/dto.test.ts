// Unit tests for the mapping from rows to representations.
// The mappers are pure functions: each test builds a row by hand, 
// as the data layer would return it, and checks the DTO.

import { describe, it, expect } from 'vitest';
import { toTitleDto, toTitleDetailDto, toUserDto } from '../src/routes/dto.js';
import type { Title, TitleDetail } from '../src/data/titles.js';
import type { User } from '../src/data/users.js';

// A title row with every nullable column set.
const title: Title = {
  tconst: 'tt0111596',
  titleType: 'movie',
  primaryTitle: 'Example Movie',
  originalTitle: 'Example Movie (original)',
  isAdult: false,
  startYear: 1994,
  endYear: null,
  runtimeMinutes: 120,
  awards: 'Won 1 Oscar',
  posterUrl: 'https://example.com/poster.jpg',
  plot: 'Something happens.',
  rating: { average: 7.5, votes: 1234 },
};

// The same title as it comes back when the nullable columns are empty
// and the title has no ratings.
const unratedTitle: Title = {
  ...title,
  originalTitle: null,
  startYear: null,
  runtimeMinutes: null,
  awards: null,
  posterUrl: null,
  plot: null,
  rating: null,
};

describe('toTitleDto', () => {
  it('identifies the title by URI instead of by tconst', () => {
    const dto = toTitleDto(title);

    expect(dto.url).toBe('/api/titles/tt0111596');
    expect(dto).not.toHaveProperty('tconst');
  });

  it('copies the remaining fields unchanged', () => {
    expect(toTitleDto(title)).toEqual({
      url: '/api/titles/tt0111596',
      titleType: 'movie',
      primaryTitle: 'Example Movie',
      originalTitle: 'Example Movie (original)',
      isAdult: false,
      startYear: 1994,
      endYear: null,
      runtimeMinutes: 120,
      awards: 'Won 1 Oscar',
      posterUrl: 'https://example.com/poster.jpg',
      plot: 'Something happens.',
      rating: { average: 7.5, votes: 1234 },
    });
  });

  it('keeps empty columns as null fields, so the client always gets the same fields', () => {
    const dto = toTitleDto(unratedTitle);

    expect(dto.rating).toBeNull();
    expect(dto).toHaveProperty('plot', null);
    expect(dto).toHaveProperty('posterUrl', null);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(toTitleDto(title)).sort());
  });
});

describe('toTitleDetailDto', () => {
  const detail: TitleDetail = {
    ...title,
    genres: ['Drama', 'Crime'],
    credits: [
      { nconst: 'nm0000001', name: 'Some Actor', category: 'actor', job: null, characters: ['Hero'] },
      { nconst: 'nm0000002', name: 'Some Director', category: 'director', job: null, characters: [] },
    ],
  };

  it('nests each credited person as an object with a URI and a name', () => {
    const dto = toTitleDetailDto(detail);

    expect(dto.credits).toEqual([
      { person: { url: '/api/persons/nm0000001', name: 'Some Actor' }, category: 'actor', job: null, characters: ['Hero'] },
      { person: { url: '/api/persons/nm0000002', name: 'Some Director' }, category: 'director', job: null, characters: [] },
    ]);
    for (const credit of dto.credits) {
      expect(credit).not.toHaveProperty('nconst');
    }
  });

  it('includes the fields of the list representation and the genres', () => {
    const dto = toTitleDetailDto(detail);

    expect(dto).toMatchObject(toTitleDto(title));
    expect(dto.genres).toEqual(['Drama', 'Crime']);
  });
});

describe('toUserDto', () => {
  const user: User = {
    uconst: 42,
    firstName: 'Test',
    lastName: 'User',
    username: 'test_user',
    email: 'test@example.com',
    passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
    createdAt: new Date('2026-01-01T12:00:00Z'),
  };

  it('never includes the password hash (2-A.4)', () => {
    expect(toUserDto(user)).not.toHaveProperty('passwordHash');
  });

  it('identifies the user by URI instead of by uconst', () => {
    const dto = toUserDto(user);

    expect(dto.url).toBe('/api/users/42');
    expect(dto).not.toHaveProperty('uconst');
  });

  it('copies the profile fields', () => {
    expect(toUserDto(user)).toEqual({
      url: '/api/users/42',
      firstName: 'Test',
      lastName: 'User',
      username: 'test_user',
      email: 'test@example.com',
      createdAt: new Date('2026-01-01T12:00:00Z'),
    });
  });
});