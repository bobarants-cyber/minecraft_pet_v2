// Fills a presentation template (a .pptx, e.g. a Canva template downloaded from your account) with your own pages:
// each page's title goes in the slide's biggest-font text box, the rest in its largest other text box, keeping the
// template's fonts, colours, pictures and layout. Slides are reused or repeated so every page gets one.
// No Electron imports, so it can be tested with plain Node.
import JSZip from 'jszip';

const SLIDE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const EMU_PT = 12700;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (xml, name) => xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** The text boxes of a slide: [{ xml, text, area, w, h, y, size }] (size = biggest font in hundredths of a point). */
function textBoxes(slideXml) {
  const boxes = [];
  for (const m of slideXml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)) {
    const xml = m[0];
    const body = xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0];
    if (!body) continue;
    const text = [...body.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('').trim();
    if (!text) continue;
    const ext = xml.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    const off = xml.match(/<a:off\b[^>]*\by="(-?\d+)"/);
    const w = ext ? Number(ext[1]) : 0;
    const h = ext ? Number(ext[2]) : 0;
    const sizes = [...body.matchAll(/\bsz="(\d+)"/g)].map((s) => Number(s[1]));
    boxes.push({ xml, text, w, h, area: w * h, y: off ? Number(off[1]) : 0, size: sizes.length ? Math.max(...sizes) : 1800 });
  }
  return boxes;
}

/** How many lines `lines` take in a box `w` wide at font size `sz` (rough: average letter ≈ half the font size). */
function wrappedLines(lines, w, sz) {
  const perLine = Math.max(8, (w / EMU_PT) / ((sz / 100) * 0.52));
  return lines.reduce((n, l) => n + Math.max(1, Math.ceil([...l].length / perLine)), 0);
}

/** Replaces a text box's words with `lines`, keeping its look; shrinks the font if they wouldn't fit. */
function setText(box, lines, { minSize = 1000 } = {}) {
  const body = box.xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)[0];
  const bodyPr = body.match(/<a:bodyPr\b[^>]*\/>|<a:bodyPr\b[^>]*>[\s\S]*?<\/a:bodyPr>/)?.[0] ?? '<a:bodyPr/>';
  const lstStyle = body.match(/<a:lstStyle\s*\/>|<a:lstStyle>[\s\S]*?<\/a:lstStyle>/)?.[0] ?? '<a:lstStyle/>';
  const firstP = body.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/)?.[0] ?? '';
  const pPr = firstP.match(/<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/)?.[0] ?? '';
  let rPr = firstP.match(/<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/)?.[0] ?? firstP.match(/<a:endParaRPr\b[^>]*\/>/)?.[0]?.replace('a:endParaRPr', 'a:rPr') ?? '<a:rPr lang="en-US"/>';
  // Fit: shrink the font until the lines fit the box height (with 1.2 line spacing).
  let sz = Number(attr(rPr, 'sz') ?? box.size ?? 1800);
  if (box.h && box.w && lines.length) {
    while (sz > minSize && wrappedLines(lines, box.w, sz) * (sz / 100) * 1.22 > box.h / EMU_PT) sz -= 100;
  }
  rPr = /\bsz="/.test(rPr) ? rPr.replace(/\bsz="\d+"/, `sz="${sz}"`) : rPr.replace(/^<a:rPr\b/, `<a:rPr sz="${sz}"`);
  const paras = (lines.length ? lines : ['']).map((l) => `<a:p>${pPr}${l ? `<a:r>${rPr}<a:t>${esc(l)}</a:t></a:r>` : ''}</a:p>`).join('');
  // Canva/PowerPoint "shrink text on overflow" as a safety net.
  const fitPr = /normAutofit|spAutoFit/.test(bodyPr) || bodyPr.endsWith('/>') === false ? bodyPr : bodyPr.replace(/\/>$/, '><a:normAutofit/></a:bodyPr>');
  return box.xml.replace(body, `<p:txBody>${fitPr}${lstStyle}${paras}</p:txBody>`);
}

/** Puts one page (title + text) into a slide's XML. */
export function fillSlide(slideXml, page) {
  const boxes = textBoxes(slideXml);
  if (!boxes.length) return { xml: slideXml, used: false };
  const bodyLines = String(page.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  // Title: the biggest font (the higher one if tied). Body: the largest other box.
  const title = [...boxes].sort((a, b) => b.size - a.size || a.y - b.y)[0];
  const rest = boxes.filter((b) => b !== title);
  const main = [...rest].sort((a, b) => b.area - a.area)[0];
  let xml = slideXml;
  if (!main) {
    xml = xml.replace(title.xml, setText(title, bodyLines.length ? [page.title, ...bodyLines] : [page.title]));
    return { xml, used: true };
  }
  xml = xml.replace(title.xml, setText(title, [page.title]));
  xml = xml.replace(main.xml, setText(main, bodyLines));
  // Other template words ("Add a subheading", "Lorem ipsum"…) are cleared; page numbers stay.
  for (const b of rest) if (b !== main && !/^\d{1,3}$/.test(b.text)) xml = xml.replace(b.xml, setText(b, []));
  return { xml, used: true };
}

/**
 * Fills a .pptx template (Buffer) with `pages` ([{ title, text }]) and returns the new .pptx (Buffer).
 * The first slide gets the cover page, the last the last page (thanks); the slides in between are used in order
 * and repeated if there are more pages than slides.
 */
export async function fillTemplate(pptx, pages) {
  const zip = await JSZip.loadAsync(pptx);
  const presPath = 'ppt/presentation.xml';
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  let pres = await zip.file(presPath).async('string');
  let rels = await zip.file(relsPath).async('string');
  let types = await zip.file('[Content_Types].xml').async('string');

  // The template's slides, in order.
  const relTarget = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const ids = [...pres.matchAll(/<p:sldId\b[^>]*\/>/g)].map((m) => attr(m[0], 'r:id'));
  const slides = [];
  for (const rid of ids) {
    const p = `ppt/${relTarget[rid].replace(/^\/?ppt\//, '').replace(/^\.\//, '')}`;
    const name = p.split('/').pop();
    const relFile = `ppt/slides/_rels/${name}.rels`;
    slides.push({ rid, path: p, xml: await zip.file(p).async('string'), rels: zip.file(relFile) ? await zip.file(relFile).async('string') : null });
  }
  if (!slides.length) throw new Error('That template has no slides');

  // Which template slide each page uses.
  const withText = (s) => textBoxes(s.xml).length > 0;
  const middle = slides.length > 2 ? slides.slice(1, -1) : slides;
  const contentSlides = middle.filter(withText).length ? middle.filter(withText) : middle;
  // Long pages (tables, steps) go on slides with a big text box; short ones (section titles) on the others.
  const room = (sl) => {
    const boxes = textBoxes(sl.xml);
    const title = [...boxes].sort((x, y) => y.size - x.size || x.y - y.y)[0];
    return Math.max(0, ...boxes.filter((b) => b !== title).map((b) => b.area));
  };
  const most = Math.max(...contentSlides.map(room));
  const roomy = contentSlides.filter((sl) => room(sl) >= most * 0.6);
  const short = contentSlides.filter((sl) => !roomy.includes(sl));
  const turn = { long: 0, short: 0 };
  const plan = pages.map((pg, i) => {
    if (i === 0) return slides[0];
    if (i === pages.length - 1 && slides.length > 1 && withText(slides.at(-1))) return slides.at(-1);
    const lines = String(pg.text ?? '').split('\n').filter((l) => l.trim()).length;
    const pool = lines <= 2 && short.length ? short : roomy;
    const key = pool === short ? 'short' : 'long';
    return pool[turn[key]++ % pool.length];
  });

  // Remove the old slide list, then add one new slide per page.
  for (const s of slides) {
    zip.remove(s.path);
    zip.remove(`ppt/slides/_rels/${s.path.split('/').pop()}.rels`);
    rels = rels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${s.rid}"[^>]*/>`), '');
    types = types.replace(new RegExp(`<Override\\b[^>]*PartName="/${s.path}"[^>]*/>`), '');
  }
  let newRels = '';
  let newIds = '';
  let newTypes = '';
  plan.forEach((tpl, i) => {
    const name = `bbk${i + 1}.xml`;
    const rid = `rIdBbk${i + 1}`;
    zip.file(`ppt/slides/${name}`, fillSlide(tpl.xml, pages[i]).xml);
    // Same layout, pictures and so on; not the speaker notes (those belong to one slide only).
    if (tpl.rels) zip.file(`ppt/slides/_rels/${name}.rels`, tpl.rels.replace(/<Relationship\b[^>]*notesSlide[^>]*\/>/g, ''));
    newRels += `<Relationship Id="${rid}" Type="${SLIDE_TYPE}" Target="slides/${name}"/>`;
    newIds += `<p:sldId id="${300 + i}" r:id="${rid}"/>`;
    newTypes += `<Override PartName="/ppt/slides/${name}" ContentType="${SLIDE_CT}"/>`;
  });
  // Old notes pages pointed at removed slides; drop them.
  for (const f of Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\//.test(f))) {
    zip.remove(f);
    if (!f.includes('_rels')) types = types.replace(new RegExp(`<Override\\b[^>]*PartName="/${f}"[^>]*/>`), '');
  }
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${newIds}</p:sldIdLst>`);
  rels = rels.replace('</Relationships>', `${newRels}</Relationships>`);
  types = types.replace('</Types>', `${newTypes}</Types>`);
  zip.file(presPath, pres);
  zip.file(relsPath, rels);
  zip.file('[Content_Types].xml', types);
  const appXml = await zip.file('docProps/app.xml')?.async('string');
  if (appXml) zip.file('docProps/app.xml', appXml.replace(/<Slides>\d+<\/Slides>/, `<Slides>${plan.length}</Slides>`).replace(/<Notes>\d+<\/Notes>/, '<Notes>0</Notes>'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
