// Verifies Meta Graph API access to the Facebook Page using PAGE_ACCESS_TOKEN + FACEBOOK_PAGE_ID.
// Usage: npm run verify:meta
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ID } = process.env;

(async () => {
    const missing = ['PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'].filter((k) => !process.env[k]);
    if (missing.length) {
        console.error(`Missing in backend/.env: ${missing.join(', ')}`);
        process.exit(1);
    }
    try {
        const page = await axios.get(`https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}`, {
            params: { fields: 'id,name', access_token: PAGE_ACCESS_TOKEN },
        });
        console.log('Facebook Page:', page.data);
        console.log(`✅ Connected to Page "${page.data.name}"`);
    } catch (err) {
        console.error('❌ Graph API error:', err.response?.data?.error || err.message);
        process.exit(1);
    }
})();

