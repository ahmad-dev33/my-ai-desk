export function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function pagination(query) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0);
  return { limit, offset };
}
