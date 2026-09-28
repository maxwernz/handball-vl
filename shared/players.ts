/** Stable id of a player within a season: team id plus a slug of the name. */
export function playerKey(teamId: number, name: string) {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${teamId}-${slug}`;
}
