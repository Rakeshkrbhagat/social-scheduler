// node scripts/testParser.js
const assert = require('assert');
const { extractResponses, instagramFinalText, facebookFinalText } = require('../parser');

const ai = (n) => `<h2 data-path-to-node="1">Video ${n}</h2>
<h3 data-path-to-node="10">2. INSTAGRAM REELS</h3>
<h3 data-path-to-node="20">Caption</h3><p data-path-to-node="21">दिवाली में मां लक्ष्मी की पूजा &amp; आरती ${n} 🪔</p>
<h3 data-path-to-node="22">Hashtags</h3><p data-path-to-node="23">#Diwali #लक्ष्मी</p>
<h3 data-path-to-node="24">On-Screen Text</h3><p>शुभ दीपावली</p>
<h3 data-path-to-node="30">3. FACEBOOK REELS</h3>
<h3>Description</h3><p>इस दिवाली पूजा करें। <a href="https://x.com">https://x.com</a></p>
<h3>Hashtags</h3><p>#Puja #FB${n}</p>
<h3>4. Thumbnail</h3><p>ignore me</p>`;

const data = { chat: [
    { user: 'PROMPT: Caption - Write 2-3 concise lines. Hashtags - add 10.', ai: '<p>Okay, send the videos.</p>' },
    { user: 'video 1', ai: ai(1) },
    { user: 'video 2', ai: ai(2) },
] };

const r = extractResponses(data);
assert.strictEqual(r.length, 2);
assert.strictEqual(r[0].index, 1);
assert.strictEqual(r[1].index, 2);
assert.strictEqual(r[0].instagram.caption, instagramFinalText({ caption: 'दिवाली में मां लक्ष्मी की पूजा & आरती 1 🪔' }));
assert.strictEqual(r[0].instagram.hashtags, '#Diwali #लक्ष्मी');
assert.strictEqual(r[1].facebook.description, 'इस दिवाली पूजा करें।');
assert.strictEqual(r[1].facebook.hashtags, '#Puja #FB2');
assert(!/Write 2-3|ignore me|https?:/.test(JSON.stringify(r)), 'prompt/URL leaked');
assert.strictEqual(instagramFinalText(r[0].instagram), 'दिवाली में मां लक्ष्मी की पूजा & आरती 1 🪔\n\n#Diwali #लक्ष्मी');
assert.strictEqual(facebookFinalText(null), '');
console.log('ALL PARSER TESTS PASSED');

