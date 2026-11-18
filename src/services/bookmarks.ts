import { addPersonBookmark, addTitleBookmark } from "../data/bookmarks.js";
import { checkPersonExists } from "../data/persons.js";
import { checkTitleExists } from "../data/titles.js";
import { NotFound } from "../middleware/errors.js";

export async function bookmarkTitle(uconst: number, tconst: string): Promise<void> {
  if (!(await checkTitleExists(tconst))) throw new NotFound('Title not found');
  await addTitleBookmark(uconst, tconst);
}

export async function bookmarkPerson(uconst: number, nconst: string): Promise<void> {
  if (!(await checkPersonExists(nconst))) throw new NotFound('Person not found');
  await addPersonBookmark(uconst, nconst);
}