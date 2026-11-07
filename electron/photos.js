// Real photos for presentations from Pixabay (free to use under the Pixabay Content License). Fast: no AI involved.
// Photos are downloaded and put inside the presentation (Pixabay doesn't allow linking to their files permanently).
// No Electron imports, so it can be tested with plain Node.

const API = 'https://pixabay.com/api/';

async function search(key, query, { perPage = 6, orientation = 'horizontal' } = {}) {
  const url = new URL(API);
  url.search = new URLSearchParams({ key, q: String(query).slice(0, 90), image_type: 'photo', orientation, safesearch: 'true', per_page: String(Math.max(3, perPage)), order: 'popular' }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 400 && /key/i.test(await res.clone().text())) throw new Error('Pixabay didn’t accept the key');
  if (!res.ok) throw new Error(`Pixabay said ${res.status}`);
  return (await res.json()).hits ?? [];
}

/** Downloads one photo: { data: 'image/jpeg;base64,…' (PptxGenJS format), ar: width ÷ height }. */
async function download(hit, big = false) {
  const url = (big && hit.largeImageURL) || hit.webformatURL;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`photo download ${res.status}`);
  let type = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  if (!/^image\/(jpeg|png|gif)$/.test(type)) type = 'image/jpeg';
  const w = hit.imageWidth || hit.webformatWidth || 4;
  const h = hit.imageHeight || hit.webformatHeight || 3;
  return { data: `${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`, ar: w / h };
}

/**
 * Photos for a recipe presentation: { hero, gallery: [...], ingredients: { rice: photo, … }, credits } where each photo
 * is { data, ar }, or null if there's no key or Pixabay can't be reached. Never throws.
 */
export async function recipePhotos(key, { dish, ingredients = [], korean = false } = {}) {
  if (!key) return null;
  try {
    const q = dish.replace(/\b(my|recipe|math|project)\b/gi, '').trim() || 'food';
    let hits = await search(key, q, { perPage: 8 });
    if (hits.length < 3) hits = [...hits, ...(await search(key, korean ? 'korean food' : `${q.split(' ').pop()} food`, { perPage: 8 }))];
    const pics = hits.slice(0, 5);
    const [hero, ...gallery] = await Promise.all(pics.map((h, i) => download(h, i === 0).catch(() => null)));
    const ing = {};
    await Promise.all(
      ingredients.slice(0, 3).map(async (name) => {
        try {
          const found = await search(key, `${name} food`, { perPage: 3 });
          if (found[0]) ing[name] = await download(found[0]);
        } catch {}
      }),
    );
    const credits = [...new Set(pics.map((h) => h.user).filter(Boolean))].slice(0, 4);
    if (!hero && !gallery.some(Boolean)) return null;
    return { hero: hero ?? gallery.find(Boolean), gallery: gallery.filter(Boolean), ingredients: ing, credits };
  } catch {
    return null;
  }
}

/** Throws a friendly error if Pixabay doesn't accept this key. */
export async function testKey(key) {
  await search(key, 'food', { perPage: 3 });
}
