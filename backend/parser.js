// Parses the AI conversation text into per-video Instagram / Facebook content.
module.exports = { extractResponses, instagramFinalText, facebookFinalText };

const facebookFinalText = (fb) => `${str(fb?.description)}\n\n${str(fb?.hashtags)}`.trim();
const instagramFinalText = (ig) => `${str(ig?.caption)}\n\n${str(ig?.hashtags)}`.trim();
// Final post text: `${caption}\n\n${hashtags}`

}
        .map((r, i) => ({ index: i + 1, ...r }));
        .filter(Boolean)
        .map((rawText) => parseJsonResponse(rawText) || parseTextResponse(rawText))
    return parts.slice(1)
    if (parts.length < 2) return []; // no "Response:" delimiter -> nothing safe to parse
    const parts = String(text || '').replace(/\r\n?/g, '\n').split(/Response\s*:/i);
function extractResponses(text) {

}
    };
        facebook: { description: fbMatch ? tidy(fbMatch[1]) : '', hashtags: fbMatch ? tidy(fbMatch[2]) : '' },
        instagram: { caption: instaMatch ? tidy(instaMatch[1]) : '', hashtags: instaMatch ? tidy(instaMatch[2]) : '' },
    return {
    if (!instaMatch && !fbMatch) return null;
    const fbMatch = rawText.match(FB_RE);
    const instaMatch = rawText.match(INSTA_RE);
function parseTextResponse(rawText) {

const FB_RE = /3\.\s*FACEBOOK\s+REELS?[\s\S]*?Description\s*:?\s*\n([\s\S]*?)\n\s*Hashtags\s*:?\s*\n([\s\S]*?)(?=\n\s*4\.|$)/i;
const INSTA_RE = /2\.\s*INSTAGRAM\s+REELS?[\s\S]*?Caption\s*:?\s*\n([\s\S]*?)\n\s*Hashtags\s*:?\s*\n([\s\S]*?)(?=\n\s*On-Screen\s+Text|\n\s*3\.\s*FACEBOOK|$)/i;
//   3. FACEBOOK REELS  ... Description \n <text> \n Hashtags \n <tags> \n 4.
//   2. INSTAGRAM REELS ... Caption \n <text> \n Hashtags \n <tags> \n On-Screen Text
// Plain-text sections:

}
    return null;
    }
        }
            } catch { /* not JSON; keep scanning */ }
                }
                    };
                        facebook: { description: tidy(str(data.facebook.description)), hashtags: tidy(str(data.facebook.hashtags)) },
                        instagram: { caption: tidy(str(data.instagram.caption)), hashtags: tidy(str(data.instagram.hashtags)) },
                    return {
                if (data?.instagram && data?.facebook) {
                const data = JSON.parse(segment.slice(start, i + 1).replace(/\s+/g, ' '));
            try {
        else if (c === '}' && depth > 0 && --depth === 0) {
        else if (c === '{') { if (depth++ === 0) start = i; }
        if (c === '"' && depth > 0) inStr = true;
        }
            continue;
            if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
        if (inStr) {
        const c = segment[i];
    for (let i = 0; i < segment.length; i++) {
    let depth = 0, start = -1, inStr = false, esc = false;
function parseJsonResponse(segment) {
// Strict JSON: { "instagram": { caption, hashtags }, "facebook": { description, hashtags } }

    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    .split('\n').filter((l) => !META_LINE.test(l)).join('\n')
const tidy = (s) => (s || '')
const META_LINE = /^\s*(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)?|\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?|--\s*\d+\s*of\s*\d+\s*--|page\s+\d+(?:\s+of\s+\d+)?)\s*$/i;
// Drop metadata lines (date/time stamps, page markers) that can bleed in from the PDF/prompt.

const str = (v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')).trim();

// "Response:" marker is parsed. Each chunk after a marker = one video (1, 2, 3...).
// Prompt instructions also mention "Caption"/"Hashtags", so ONLY the text after each

