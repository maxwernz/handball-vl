import type { StatGame, UploadPayload } from './model.ts';
import { parseFiles } from './parse.ts';

type UploadMeta = Extract<UploadPayload, { action: 'upload' }>['meta'];

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Id for a game that has no h4a counterpart (friendly, cup …). */
export const customId = (date: string, opponent: string) => `x-${date.slice(0, 10)}-${slug(opponent) || 'gegner'}`;

export function buildGame(files: { score: string; game: string; players: string }, meta: UploadMeta, uploadedAt: string): StatGame {
  const p = parseFiles(files);
  return {
    id: meta.id,
    ...(meta.h4a ? { h4a: meta.h4a } : {}),
    date: meta.date,
    opponent: meta.opponent || p.opponent,
    home: meta.home,
    ownLabel: p.ownLabel,
    goalsFor: p.goalsFor,
    goalsAgainst: p.goalsAgainst,
    htFor: p.htFor,
    htAgainst: p.htAgainst,
    ...(meta.note ? { note: meta.note } : {}),
    players: p.players,
    events: p.events,
    warnings: p.warnings,
    uploadedAt,
  };
}
