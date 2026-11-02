// Data model of the internal team statistics (/intern/). One StatGame per uploaded
// game, built from the three HTML exports of the statistics app (score, game, players).

/** Shot zones as the statistics app names them. */
export const ZONES = ['6m', '9m', 'Flügel', 'Durchbruch', 'Gegenstoß', '7m'] as const;
export type Zone = (typeof ZONES)[number];

export type EventKind =
  | 'goal' // own goal ("Tor 6m")
  | 'miss' // own missed shot ("Fehlwurf 9m")
  | 'conceded' // goal against, logged for our goalkeeper ("Gegentor Flügel")
  | 'save' // goalkeeper save ("Parade 7m")
  | 'assist'
  | 'steal' // "Ballgewinn"
  | 'forcedSteal' // "Ballgewinn erzwungen"
  | 'turnover' // "Ballverlust"
  | 'foul' // "Stopfoul"
  | 'sevenWon' // "7m geholt"
  | 'sevenCaused' // "7m verursacht"
  | 'twoMin'
  | 'yellow'
  | 'red'
  | 'other';

export interface StatEvent {
  /** Game time in seconds. */
  t: number;
  no: string;
  name: string;
  /** Original action text, e.g. "Fehlwurf Durchbruch". */
  action: string;
  kind: EventKind;
  zone?: Zone;
  /** Score after the event, from our point of view. */
  for: number;
  against: number;
}

/** Made/attempted per zone. */
export type ZoneCounts = Partial<Record<Zone, [number, number]>>;

/** One player's row from players.html (field and goalkeeper table merged). */
export interface PlayerLine {
  name: string;
  no: string;
  goals: number;
  shots: number;
  zones: ZoneCounts;
  sevenWon: number;
  sevenCaused: number;
  assists: number;
  steals: number;
  forcedSteals: number;
  turnovers: number;
  twoMin: number;
  red: number;
  yellow: number;
  fouls: number;
  /** Present when the player was listed as goalkeeper. */
  keeper?: { saves: number; faced: number; zones: ZoneCounts };
}

export interface StatGame {
  /** h4a game id when matched, otherwise "x-<date>-<opponent>". */
  id: string;
  h4a?: { gameId: number; no: string; leagueId: number; seasonId: number; league: string };
  /** Local kickoff "YYYY-MM-DDTHH:MM" (time may be 00:00 when unknown). */
  date: string;
  opponent: string;
  home: boolean | null;
  /** Label of our team in the export header. */
  ownLabel: string;
  goalsFor: number;
  goalsAgainst: number;
  htFor: number;
  htAgainst: number;
  /** Optional free text, e.g. "Pokal" or "Testspiel". */
  note?: string;
  players: PlayerLine[];
  events: StatEvent[];
  warnings: string[];
  uploadedAt: string;
}

/** What the browser decrypts on /intern/. */
export interface TeamBundle {
  version: 1;
  team: string;
  builtAt: string;
  games: StatGame[];
  /** Spelling variants → canonical player name. */
  aliases: Record<string, string>;
}

/** What the upload page sends through the workflow (encrypted). */
export type UploadPayload =
  | {
      action: 'upload';
      files: { score: string; game: string; players: string };
      meta: Pick<StatGame, 'id' | 'h4a' | 'date' | 'opponent' | 'home' | 'note'>;
    }
  | { action: 'delete'; id: string }
  | { action: 'aliases'; aliases: Record<string, string> };
