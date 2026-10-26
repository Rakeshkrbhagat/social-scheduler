// node scripts/testParser.js
const assert = require('assert');
const { extractResponses, facebookFinalText } = require('../parser');

// Other platform sections in the AI output must be ignored (Facebook-only publishing).
const ai = (n) => `<h2 data-path-to-node="1">Video ${n}</h2>
<h3 data-path-to-node="10">2. YOUTUBE SHORTS</h3>
<h3 data-path-to-node="20">Caption</h3><p data-path-to-node="21">ignore other platform</p>
<h3 data-path-to-node="30">3. FACEBOOK REELS</h3>
<h3>Description</h3><p>दिवाली में मां लक्ष्मी की पूजा &amp; आरती ${n} 🪔 <a href="https://x.com">https://x.com</a></p>
<h3>Hashtags</h3><p>#Puja #लक्ष्मी #FB${n}</p>
<h3>4. Thumbnail</h3><p>ignore me</p>`;

const r = extractResponses({ chat: [{ user: 'video 1', ai: ai(1) }, { user: 'video 2', ai: ai(2) }] });
assert.strictEqual(r.length, 2);
assert.strictEqual(r[0].index, 1);
assert.strictEqual(r[1].index, 2);
assert.deepStrictEqual(Object.keys(r[0]).sort(), ['facebook', 'index']);
assert.strictEqual(r[1].facebook.description, 'दिवाली में मां लक्ष्मी की पूजा & आरती 2 🪔');
assert.strictEqual(r[1].facebook.hashtags, '#Puja #लक्ष्मी #FB2');
assert(!/ignore|https?:/.test(JSON.stringify(r)), 'other platform / URL leaked');
assert.strictEqual(facebookFinalText(r[0].facebook), 'दिवाली में मां लक्ष्मी की पूजा & आरती 1 🪔\n\n#Puja #लक्ष्मी #FB1');
assert.strictEqual(facebookFinalText(null), '');
console.log('ALL PARSER TESTS PASSED');

