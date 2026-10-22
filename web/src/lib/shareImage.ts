// Draws a finished game as a square picture (logos, score, best scorers) to
// share in a chat or story. Everything is drawn on a canvas in the browser.

import type { Game, PlayerLine, Report } from '../../../shared/types.ts';
import { initials, tone } from '../components/TeamLogo.tsx';
import { formatLongDay } from './format.ts';

const SIZE = 1080;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export interface ShareData {
  game: Game;
  league: string;
  /** Full team names where known. */
  home: string;
  guest: string;
  logos: { home: string | null; guest: string | null };
  colors: { home: string; guest: string };
  report: Pick<Report, 'home' | 'guest'> | null;
}

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Breaks a text into at most `maxLines` lines that fit `width`; the last one is cut with an ellipsis. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`;
  return shown.map((l) => {
    while (ctx.measureText(l).width > width && l.length > 2) l = `${l.slice(0, -2).trimEnd()}…`;
    return l;
  });
}

function topScorers(lines: PlayerLine[]) {
  return [...lines].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 3);
}

async function draw(data: ShareData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const { game } = data;
  // A canvas knows no CSS variables; the neutral stand-in becomes a gray that reads on the dark picture.
  const paint = (color: string) => (color.startsWith('var(') ? '#9aa7bb' : color);
  const colors = { home: paint(data.colors.home), guest: paint(data.colors.guest) };
  const [homeLogo, guestLogo] = await Promise.all([loadImage(data.logos.home), loadImage(data.logos.guest)]);

  ctx.fillStyle = '#0f1b2d';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = colors.home;
  ctx.fillRect(0, 0, SIZE / 2, 18);
  ctx.fillStyle = colors.guest;
  ctx.fillRect(SIZE / 2, 0, SIZE / 2, 18);

  const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  text(data.league, SIZE / 2, 110, `600 38px ${FONT}`, 'rgba(255,255,255,0.75)');
  text(formatLongDay(game.date), SIZE / 2, 162, `30px ${FONT}`, 'rgba(255,255,255,0.55)');

  const logo = (img: HTMLImageElement | null, name: string, cx: number) => {
    const box = 230;
    const [x, y] = [cx - box / 2, 225];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, box, box, 36);
    ctx.fill();
    if (img) {
      const scale = Math.min((box - 40) / img.width, (box - 40) / img.height);
      ctx.drawImage(img, cx - (img.width * scale) / 2, y + box / 2 - (img.height * scale) / 2, img.width * scale, img.height * scale);
    } else {
      ctx.fillStyle = tone(name);
      ctx.beginPath();
      ctx.arc(cx, y + box / 2, 85, 0, Math.PI * 2);
      ctx.fill();
      ctx.textBaseline = 'middle';
      text(initials(name), cx, y + box / 2 + 4, `700 64px ${FONT}`, '#ffffff');
      ctx.textBaseline = 'alphabetic';
    }
    ctx.font = `700 40px ${FONT}`;
    wrap(ctx, name, 400, 2).forEach((line, i) => text(line, cx, 520 + i * 50, `700 40px ${FONT}`, '#ffffff'));
  };
  logo(homeLogo, data.home, 215);
  logo(guestLogo, data.guest, SIZE - 215);

  text(`${game.homeGoals ?? 0}:${game.guestGoals ?? 0}`, SIZE / 2, 385, `800 150px ${FONT}`, '#ffffff');
  if (game.status === 'finished' && game.homeGoalsHt !== null) text(`Halbzeit ${game.homeGoalsHt}:${game.guestGoalsHt}`, SIZE / 2, 445, `34px ${FONT}`, 'rgba(255,255,255,0.6)');
  if (game.status === 'live') text('Zwischenstand', SIZE / 2, 445, `600 34px ${FONT}`, '#ff5552');

  const scorers = data.report && { home: topScorers(data.report.home.players), guest: topScorers(data.report.guest.players) };
  if (scorers && (scorers.home.length || scorers.guest.length)) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(90, 655, SIZE - 180, 2);
    text('Beste Torschützen', SIZE / 2, 720, `600 32px ${FONT}`, 'rgba(255,255,255,0.6)');
    const column = (players: PlayerLine[], x: number, align: CanvasTextAlign, color: string) =>
      players.forEach((p, i) => {
        const y = 795 + i * 66;
        ctx.font = `40px ${FONT}`;
        const [name] = wrap(ctx, p.name, 350, 1);
        const goals = String(p.goals);
        ctx.font = `800 40px ${FONT}`;
        const offset = ctx.measureText(goals).width + 18;
        text(goals, x, y, `800 40px ${FONT}`, color, align);
        text(name, align === 'left' ? x + offset : x - offset, y, `40px ${FONT}`, '#ffffff', align);
      });
    column(scorers.home, 90, 'left', colors.home);
    column(scorers.guest, SIZE - 90, 'right', colors.guest);
  }
  text('Handball BW', SIZE / 2, 1030, `600 30px ${FONT}`, 'rgba(255,255,255,0.45)');
  return canvas;
}

/** Shares the picture through the system share sheet, or downloads it where that is not possible. */
export async function shareGameImage(data: ShareData) {
  const canvas = await draw(data);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Bild konnte nicht erstellt werden');
  const file = new File([blob], `${data.game.home}-${data.game.guest}.png`.replace(/[^\wäöüÄÖÜß.-]+/g, '-'), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${data.home} – ${data.guest}` });
    } catch {
      /* cancelled */
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
