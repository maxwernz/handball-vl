/** Lower case without accents, so "muller" finds "Müller". */
export function fold(text: string) {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

/** A test for whether a text contains every word of the query. */
export function matcher(query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return words.length ? (text: string) => words.every((w) => fold(text).includes(w)) : null;
}
