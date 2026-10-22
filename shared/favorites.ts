/** Keep favorites across seasons and promotions without conflating men's and women's teams. */
export function teamFavoriteKey(name: string, leagueShort: string) {
  return `${leagueShort.startsWith('F-') ? 'F' : 'M'}:${name}`;
}

export function hasTeamFavorite(favorites: string[], name: string, leagueShort: string) {
  return favorites.includes(teamFavoriteKey(name, leagueShort)) ||
    // Original releases only contained men's leagues; keep those saved selections.
    (!leagueShort.startsWith('F-') && favorites.includes(name));
}
