// Verifies Meta Graph API access using PAGE_ACCESS_TOKEN + INSTAGRAM_ACCOUNT_ID (no App ID/Secret).
// Usage: npm run verify:meta
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PAGE_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID, FACEBOOK_PAGE_ID } = process.env;

(async () => {
    const missing = ['PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID', 'FACEBOOK_PAGE_ID'].filter((k) => !process.env[k]);
    if (missing.length) {
        console.error(`Missing in backend/.env: ${missing.join(', ')}`);
        process.exit(1);
    }
    try {
        const response = await axios.get(
            `https://graph.facebook.com/v18.0/${INSTAGRAM_ACCOUNT_ID}`,
            { params: { fields: 'id,username,name', access_token: PAGE_ACCESS_TOKEN } }
        );
        console.log('Instagram:', response.data);
        console.log(`✅ Connected as @${response.data.username}`);

        const page = await axios.get(`https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}`, {
            params: { fields: 'id,name,instagram_business_account', access_token: PAGE_ACCESS_TOKEN },
        });
        console.log('Facebook Page:', page.data);
        if (page.data.instagram_business_account?.id !== INSTAGRAM_ACCOUNT_ID) {
            console.warn('⚠️  INSTAGRAM_ACCOUNT_ID is not the account linked to FACEBOOK_PAGE_ID.');
        }
    } catch (err) {
        console.error('❌ Graph API error:', err.response?.data?.error || err.message);
        process.exit(1);
    }
})();

