import { newId } from '../domain/ids';
import { ValidationError, validateBabyName } from '../domain/rules';
import type { Baby, Id } from '../domain/types';
import type { TrackerDb } from './db';

export const BABY_NAME_MAX = 40;

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

export async function updateBaby(
  db: TrackerDb,
  id: Id,
  patch: Partial<Pick<Baby, 'name' | 'color' | 'birthDate'>>,
  now = Date.now(),
): Promise<void> {
  const changes = { ...patch, ...(patch.name === undefined ? {} : { name: cleanName(patch.name) }), updatedAt: now };
  const updated = await db.babies.update(id, changes);
  if (updated === 0) throw new Error(`Baby ${id} not found`);
}

export async function deleteBaby(db: TrackerDb, id: Id, now = Date.now()): Promise<void> {
  await db.babies.update(id, { deletedAt: now, updatedAt: now });
}
