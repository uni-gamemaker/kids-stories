// PDF assembly with pdf-lib (pure JS, serverless-safe). Images are fetched transiently into memory
// to build the PDF and are never written to disk or stored: only the page image URLs live in the DB.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { StoryView } from "./engine";

const W = 800, IMG_H = 600, TEXT_H = 200; // 4:3 illustration above a text band
export type Fetcher = (url: string) => Promise<Uint8Array>;

export const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Image download failed (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
};

// Standard PDF fonts only cover WinAnsi (Latin). Replace anything else so building never crashes.
const winAnsi = (s: string, font: PDFFont) => {
  let out = "";
  for (const ch of s.replace(/\u2019/g, "'")) { try { font.encodeText(ch); out += ch; } catch { out += "?"; } }
  return out;
};

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = []; let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

async function embed(pdf: PDFDocument, bytes: Uint8Array) {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isPng) return pdf.embedPng(bytes);
  if (isJpg) return pdf.embedJpg(bytes);
  throw new Error("Unsupported image format (use png or jpeg output).");
}

export async function buildStoryPdf(story: StoryView, fetcher: Fetcher = defaultFetcher): Promise<Uint8Array> {
  if (story.pages.some((p) => !p.image_url)) throw new Error("Not all illustrations are ready yet.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(story.title);
  pdf.setAuthor("Kids Stories Studio");
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const cream = rgb(1, 0.98, 0.93), ink = rgb(0.16, 0.14, 0.2);

  for (const pg of story.pages) {
    const img = await embed(pdf, await fetcher(pg.image_url!));
    if (pg.page_no === 0) {
      // Cover: illustration on top, big title below.
      const page = pdf.addPage([W, IMG_H + TEXT_H]);
      page.drawRectangle({ x: 0, y: 0, width: W, height: IMG_H + TEXT_H, color: cream });
      page.drawImage(img, { x: 0, y: TEXT_H, width: W, height: IMG_H });
      const lines = wrap(winAnsi(story.title, bold), bold, 40, W - 80);
      let y = TEXT_H - 20 - 40 * (lines.length > 1 ? 0.4 : 1);
      for (const l of lines) { page.drawText(l, { x: (W - bold.widthOfTextAtSize(l, 40)) / 2, y: y - 10, size: 40, font: bold, color: ink }); y -= 46; }
      const sub = winAnsi(pg.text, body);
      page.drawText(sub, { x: (W - body.widthOfTextAtSize(sub, 20)) / 2, y: 22, size: 20, font: body, color: ink });
      continue;
    }
    const page = pdf.addPage([W, IMG_H + TEXT_H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: IMG_H + TEXT_H, color: cream });
    page.drawImage(img, { x: 0, y: TEXT_H, width: W, height: IMG_H });
    const size = 24;
    const lines = wrap(winAnsi(pg.text, body), body, size, W - 100);
    const block = lines.length * (size + 8);
    let y = TEXT_H - (TEXT_H - block) / 2 - size;
    for (const l of lines) { page.drawText(l, { x: (W - body.widthOfTextAtSize(l, size)) / 2, y, size, font: body, color: ink }); y -= size + 8; }
    page.drawText(String(pg.page_no), { x: W - 40, y: 14, size: 12, font: body, color: ink });
  }
  return pdf.save();
}
