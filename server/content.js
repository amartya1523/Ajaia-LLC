import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Only the structure our editor can represent survives. Everything else
 * (scripts, inline event handlers, images, arbitrary styles) is dropped.
 */
const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'br', 'hr', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'], p: ['style'], h1: ['style'], h2: ['style'], h3: ['style'] },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Collapse deeper headings into the three levels the editor supports.
    h4: 'h3', h5: 'h3', h6: 'h3', b: 'strong', i: 'em',
  },
};

export function sanitizeContent(html) {
  return sanitizeHtml(String(html ?? ''), SANITIZE_OPTIONS);
}

export class UnsupportedFileError extends Error {}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(text) {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Converts an uploaded file into sanitized editor HTML.
 * Returns { title, html } where title is derived from the filename.
 */
export async function fileToHtml(originalName, buffer) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new UnsupportedFileError(`Unsupported file type "${ext || 'unknown'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }

  let html;
  if (ext === '.docx') {
    try {
      ({ value: html } = await mammoth.convertToHtml({ buffer }));
    } catch {
      throw new UnsupportedFileError('That .docx file could not be read. Is it a valid Word document?');
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) throw new UnsupportedFileError('File looks binary, not text.');
    html = ext === '.txt' ? textToHtml(text) : marked.parse(text, { gfm: true });
  }

  const title = path.basename(originalName, ext).trim().slice(0, 200) || 'Imported document';
  return { title, html: sanitizeContent(html) };
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
turndown.addRule('underline', { filter: ['u'], replacement: (c) => `<u>${c}</u>` });

export function htmlToMarkdown(html) {
  return turndown.turndown(html || '');
}
