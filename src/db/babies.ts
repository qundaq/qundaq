import { newId } from '../domain/ids';
import { BABY_NAME_MAX, ValidationError, isOpen, validateBabyName } from '../domain/rules';
import type { Baby, Id } from '../domain/types';
import type { TrackerDb } from './db';
import { stoppedAt } from './events';

export { BABY_NAME_MAX };

export interface NewBaby {
  name: string;
  color: string;
  birthDate?: string;
}

function cleanName(name: string): string {
  const cleaned = name.trim().slice(0, BABY_NAME_MAX);
  const violations = validateBabyName(cleaned);
  if (violations.length > 0) throw new ValidationError(violations);
  return cleaned;
}

export async function addBaby(db: TrackerDb, input: NewBaby, now = Date.now()): Promise<Baby> {
  const baby: Baby = {
    id: newId(),
    name: cleanName(input.name),
    color: input.color,
    ...(input.birthDate ? { birthDate: input.birthDate } : {}),
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.babies.add(baby);
  return baby;
}

export async function listBabies(db: TrackerDb): Promise<Baby[]> {
  const all = await db.babies.orderBy('createdAt').toArray();
  return all.filter((baby) => baby.deletedAt === undefined && !baby.archived);
}

/** Edits a baby. A deleted baby cannot be edited. */
export async function updateBaby(
  db: TrackerDb,
  id: Id,
  patch: Partial<Pick<Baby, 'name' | 'color' | 'birthDate'>>,
  now = Date.now(),
): Promise<void> {
  const changes = {
    ...patch,
    ...(patch.name === undefined ? {} : { name: cleanName(patch.name) }),
    updatedAt: now,
  };
  await db.transaction('rw', db.babies, async () => {
    const baby = await db.babies.get(id);
    if (!baby || baby.deletedAt !== undefined) throw new Error(`Baby ${id} not found`);
    await db.babies.update(id, changes);
  });
}

/**
 * Soft-deletes a baby after stopping its running timers at `now`, so nothing keeps counting for a
 * baby who is no longer shown. Deleting an already deleted baby keeps the original deletion time.
 */
export async function deleteBaby(db: TrackerDb, id: Id, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.babies, db.events, async () => {
    const baby = await db.babies.get(id);
    if (!baby) throw new Error(`Baby ${id} not found`);
    if (baby.deletedAt !== undefined) return;
    const running = await db.events
      .where('babyId')
      .equals(id)
      .filter((event) => event.deletedAt === undefined && isOpen(event))
      .toArray();
    await db.events.bulkPut(running.map((event) => stoppedAt(event, now)));
    await db.babies.update(id, { deletedAt: now, updatedAt: now });
  });
}
