import { newId } from '../domain/ids';
import { ValidationError, validateMixName } from '../domain/rules';
import { validMixLayers } from '../domain/sounds';
import type { Id, Mix, MixLayer } from '../domain/types';
import type { TrackerDb } from './db';

function cleanName(name: string): string {
  const violations = validateMixName(name);
  if (violations.length > 0) throw new ValidationError(violations);
  return name.trim();
}

/** Saves the current layers under a name (1–40 characters, trimmed; duplicates allowed). */
export async function saveMix(
  db: TrackerDb,
  name: string,
  layers: readonly MixLayer[],
  now = Date.now(),
): Promise<Mix> {
  if (!validMixLayers(layers)) throw new ValidationError(['mix-layers-invalid']);
  const mix: Mix = {
    id: newId(),
    name: cleanName(name),
    layers: layers.map((layer) => ({ soundId: layer.soundId, gain: layer.gain })),
    createdAt: now,
    updatedAt: now,
  };
  await db.mixes.add(mix);
  return mix;
}

/** Live mixes, oldest first. Sorted in memory: a row outside the index must still be listed. */
export async function listMixes(db: TrackerDb): Promise<Mix[]> {
  const all = await db.mixes.toArray();
  return all
    .filter((mix) => mix.deletedAt === undefined)
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

/** Renames a live mix with the same name check as saving. */
export async function renameMix(
  db: TrackerDb,
  id: Id,
  name: string,
  now = Date.now(),
): Promise<void> {
  const cleaned = cleanName(name);
  await db.transaction('rw', db.mixes, async () => {
    const mix = await db.mixes.get(id);
    if (!mix || mix.deletedAt !== undefined) throw new Error(`Mix ${id} not found`);
    await db.mixes.update(id, { name: cleaned, updatedAt: now });
  });
}

/** Soft-deletes a mix; deleting it again keeps the original deletion time. */
export async function deleteMix(db: TrackerDb, id: Id, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.mixes, async () => {
    const mix = await db.mixes.get(id);
    if (!mix) throw new Error(`Mix ${id} not found`);
    if (mix.deletedAt !== undefined) return;
    await db.mixes.update(id, { deletedAt: now, updatedAt: now });
  });
}
