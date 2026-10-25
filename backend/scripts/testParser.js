// node scripts/testParser.js  -> verifies prompt text is ignored and Response content is parsed.
const assert = require('assert');
const { extractResponses, instagramFinalText, facebookFinalText } = require('../parser');

const prompt = `Prompt: Create content for each video.
2. INSTAGRAM REELS
Caption
Write 2-3 concise lines in Hinglish.
Hashtags
Add 10 relevant hashtags.
On-Screen Text
...
3. FACEBOOK REELS
Description
Write a short description.
Hashtags
Add 5 hashtags.
4. Notes
26/10/2026, 10:15 AM
`;
const response1 = `Response:
Video 1
2. INSTAGRAM REELS
Caption
दिवाली में मां लक्ष्मी की पूजा कैसे करें 🪔
10:16 AM
Hashtags
#Diwali #LakshmiPuja
On-Screen Text
शुभ दीपावली
3. FACEBOOK REELS
Description
इस दिवाली मां लक्ष्मी की पूजा सही विधि से करें।
Hashtags
#Diwali2026 #Puja
4. Thumbnail
`;
const response2 = `Response: { "instagram": { "caption": "Video 2 caption", "hashtags": "#two" },
"facebook": { "description": "Video 2 desc", "hashtags": ["#fb2"] } }`;

const r = extractResponses(prompt + response1 + response2);
assert.strictEqual(r.length, 2);
assert.strictEqual(r[0].instagram.caption, 'दिवाली में मां लक्ष्मी की पूजा कैसे करें 🪔');
assert.strictEqual(r[0].instagram.hashtags, '#Diwali #LakshmiPuja');
assert.strictEqual(r[0].facebook.description, 'इस दिवाली मां लक्ष्मी की पूजा सही विधि से करें।');
assert.strictEqual(r[0].facebook.hashtags, '#Diwali2026 #Puja');
assert.strictEqual(r[1].facebook.hashtags, '#fb2');
const all = JSON.stringify(r);
assert(!/Write 2-3|Add 10|10:1\d/.test(all), 'prompt/metadata leaked');
assert.strictEqual(instagramFinalText(r[0].instagram), 'दिवाली में मां लक्ष्मी की पूजा कैसे करें 🪔\n\n#Diwali #LakshmiPuja');
assert.strictEqual(facebookFinalText(r[1].facebook), 'Video 2 desc\n\n#fb2');
assert.strictEqual(instagramFinalText(null), '');
console.log('ALL PARSER TESTS PASSED');

