// Parses a Gemini chat export (Chat_*.json): { chat: [ { user, ai }, ... ] }.
// chat[0] is the initial prompt; every following item is one video (index 1, 2, 3...).
// The "ai" property is HTML, e.g.
//   <h3 data-path-to-node="20">Caption</h3><p data-path-to-node="21">...</p>
// HTML is converted to clean lines (tags stripped, entities decoded) so Devanagari text is
// preserved exactly, then the Caption / Description / Hashtags sections are read by heading.

const str = (v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')).trim();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

// HTML -> array of non-empty text lines (one per block element / <br>)
function htmlToLines(html) {
    return decode(String(html || '')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(h[1-6]|p|div|li|ul|ol|tr|table|blockquote|pre|section|hr)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ''))
        .split('\n')
        .map((l) => l.replace(/[ \t\u00A0]+/g, ' ').trim())
        .filter(Boolean);
}

// Normalized heading key, e.g. "2. INSTAGRAM REELS" -> "instagram reels", "Caption:" -> "caption"
const key = (l) => l.toLowerCase().replace(/^[\d.)\s#*-]+/, '').replace(/[:*\s]+$/, '').trim();
const isPlatformHeading = (l) => /^(?:[\d.)\s#*-]*)(instagram|facebook|youtube|tiktok|x|twitter|linkedin)\b/i.test(l) && l.length < 60;
const FIELD_KEYS = new Set(['caption', 'description', 'hashtags', 'hashtag', 'on-screen text', 'on screen text',
    'title', 'thumbnail', 'thumbnail text', 'hook', 'cta', 'call to action', 'audio', 'music', 'script', 'notes']);
const isHeading = (l) => /^\d+\.\s/.test(l) || isPlatformHeading(l) || FIELD_KEYS.has(key(l));
const stripUrls = (s) => s.replace(/https?:\/\/\S+/g, '').replace(/[ \t]+/g, ' ').trim();

// Lines of one platform section (from its heading to the next platform heading)
function platformSection(lines, platformRe) {
    const start = lines.findIndex((l) => isPlatformHeading(l) && platformRe.test(l));
    if (start < 0) return [];
    let end = lines.findIndex((l, i) => i > start && isPlatformHeading(l) && !platformRe.test(l));
    if (end < 0) end = lines.length;
    return lines.slice(start + 1, end);
}

// Text under a field heading ("Caption", "Hashtags", ...) until the next heading.
// Also supports inline form "Caption: text".
function field(section, name) {
    for (let i = 0; i < section.length; i++) {
        const l = section[i];
        const inline = l.match(new RegExp(`^(?:[*#\\s-]*)${name}s?\\s*:\\s*(.+)$`, 'i'));
        if (inline) return stripUrls(inline[1]);
        if (key(l) === name || key(l) === `${name}s`) {
            const out = [];
            for (let j = i + 1; j < section.length && !isHeading(section[j]); j++) out.push(section[j]);
            return stripUrls(out.join('\n'));
        }
    }
    return '';
}

// Hashtags: prefer the "Hashtags" field; otherwise collect #tags from the section.
function hashtags(section) {
    const f = field(section, 'hashtag');
    if (f) return f;
    const tags = section.join(' ').match(/#[\p{L}\p{M}\p{N}_]+/gu) || [];
    return Array.from(new Set(tags)).join(' ');
}

// Strict JSON answer inside the ai block: { instagram: {...}, facebook: {...} }
function tryJson(lines) {
    const text = lines.join(' ');
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
        const d = JSON.parse(text.slice(s, e + 1));
        if (!d?.instagram || !d?.facebook) return null;
        return {
            instagram: { caption: str(d.instagram.caption), hashtags: str(d.instagram.hashtags) },
            facebook: { description: str(d.facebook.description), hashtags: str(d.facebook.hashtags) },
        };
    } catch { return null; }
}

function parseAiHtml(html) {
    const lines = htmlToLines(html);
    const json = tryJson(lines);
    if (json) return json;
    const ig = platformSection(lines, /instagram/i);
    const fb = platformSection(lines, /facebook/i);
    if (!ig.length && !fb.length) return null;
    return {
        instagram: { caption: field(ig, 'caption'), hashtags: hashtags(ig) },
        facebook: { description: field(fb, 'description'), hashtags: hashtags(fb) },
    };
}

const aiHtmlOf = (item) => {
    if (typeof item === 'string') return item;
    const ai = item?.ai ?? item?.model ?? item?.response;
    if (Array.isArray(ai)) return ai.map((a) => (typeof a === 'string' ? a : a?.html ?? a?.text ?? '')).join('\n');
    return typeof ai === 'string' ? ai : (ai?.html ?? ai?.text ?? '');
};

// data: parsed Gemini export ({ chat: [...] }) or the chat array itself.
function extractResponses(data) {
    const chat = Array.isArray(data) ? data : data?.chat;
    if (!Array.isArray(chat)) return [];
    const results = [];
    chat.slice(1).forEach((item, i) => { // skip chat[0] (initial prompt)
        const parsed = parseAiHtml(aiHtmlOf(item));
        if (parsed) results.push({ index: i + 1, ...parsed }); // chat[i+1] -> R-NEW-(i+1).mp4
    });
    return results;
}

const instagramFinalText = (obj) => (obj ? `${str(obj.caption)}\n\n${str(obj.hashtags)}`.trim() : '');
const facebookFinalText = (obj) => (obj ? `${str(obj.description)}\n\n${str(obj.hashtags)}`.trim() : '');

module.exports = { extractResponses, instagramFinalText, facebookFinalText };