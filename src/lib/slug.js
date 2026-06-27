import { db } from '../db.js';

export function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (combining diacritics)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Produce a slug that is unique across businesses. */
export function uniqueSlug(name) {
  const base = slugify(name) || 'negocio';
  let slug = base;
  let n = 1;
  const exists = db.prepare('SELECT 1 FROM businesses WHERE slug = ?');
  while (exists.get(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}
