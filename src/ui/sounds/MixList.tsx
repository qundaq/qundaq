import { useEffect, useState } from 'react';
import { db } from '../../db/instance';
import { deleteMix, listMixes } from '../../db/mixes';
import type { Id, Mix } from '../../domain/types';
import { useReportError, useReportLoadError } from '../shared/ErrorBanner';
import { DELETE_CONFIRM_MAX_MS, deleteTap } from '../history/confirm';
import { useT } from '../app/I18nProvider';
import { useLiveQuery } from '../shared/useLiveQuery';
import { mixLayerNames } from './text';

interface Props {
  /** A tap on a mix: the engine loads its layers and plays (R7). */
  onPlay: (mix: Mix) => void;
  onRename: (mix: Mix) => void;
}

/** The saved mixes, oldest first: tap to play, "Yeniden adlandır", and a two-step "Sil" (R18). */
export function MixList({ onPlay, onRename }: Props) {
  const t = useT();
  const report = useReportError();
  const mixes = useLiveQuery(() => listMixes(db), [], useReportLoadError());
  // The mix whose "Sil" was tapped once, and when; a second tap within the window deletes it.
  const [armed, setArmed] = useState<{ id: Id; at: number } | null>(null);

  useEffect(() => {
    if (armed === null) return;
    const handle = window.setTimeout(() => setArmed(null), DELETE_CONFIRM_MAX_MS);
    return () => window.clearTimeout(handle);
  }, [armed]);

  if (mixes === undefined || mixes.length === 0) return null;

  const tapDelete = (mix: Mix) => {
    const tap = deleteTap(armed?.id === mix.id ? armed.at : null, Date.now());
    setArmed(tap.armedAt === null ? null : { id: mix.id, at: tap.armedAt });
    if (tap.confirmed) deleteMix(db, mix.id).catch((error: unknown) => report(error));
  };

  return (
    <div className="card">
      <h2>{t('sounds.mixes')}</h2>
      <ul className="mix-list">
        {mixes.map((mix) => (
          <li key={mix.id}>
            <button
              type="button"
              className="mix-play"
              aria-label={t('sounds.mix.play', { name: mix.name })}
              onClick={() => onPlay(mix)}
            >
              <span className="mix-name">{mix.name}</span>
              <span className="muted small">{mixLayerNames(t, mix.layers)}</span>
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`${mix.name}: ${t('sounds.mix.rename')}`}
              onClick={() => onRename(mix)}
            >
              {t('sounds.mix.rename')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              data-armed={armed?.id === mix.id}
              aria-label={`${mix.name}: ${t(armed?.id === mix.id ? 'edit.deleteConfirm' : 'edit.delete')}`}
              onClick={() => tapDelete(mix)}
            >
              {t(armed?.id === mix.id ? 'edit.deleteConfirm' : 'edit.delete')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
