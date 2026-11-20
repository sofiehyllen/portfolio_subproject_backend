/**
 * Bookmark operations that need more than one data-layer call.
 * 
 * Each checks that the title or person exists before bookmarking it, so an unknown id is reported as `404`.
 * 
 * - `bookmarkTitle(uconst, tconst)`    - bookmarks a title
 * - `bookmarkPerson(uconst, nconst)`   - bookmarks a person
 */
import { addPersonBookmark, addTitleBookmark } from "../data/bookmarks.js";
import { checkPersonExists } from "../data/persons.js";
import { checkTitleExists } from "../data/titles.js";
import { NotFound } from "../middleware/errors.js";

/**
 * Bookmarks a title for a user
 * @param uconst - ID of the user
 * @param tconst - ID of the title to bookmark
 * @throws {NotFound} When no title with this `tconst` exists
 */
export async function bookmarkTitle(uconst: number, tconst: string): Promise<void> {
  if (!(await checkTitleExists(tconst))) { 
    throw new NotFound('Title not found');
  }

  await addTitleBookmark(uconst, tconst);
}

/**
 * Bookmarks a person for a user
 * @param uconst - ID of the user
 * @param nconst - ID of the person to bookmark
 * @throws {NotFound} When no person with this `nconst` exists
 */
export async function bookmarkPerson(uconst: number, nconst: string): Promise<void> {
  if (!(await checkPersonExists(nconst))) {
    throw new NotFound('Person not found');
  }
  await addPersonBookmark(uconst, nconst);
}