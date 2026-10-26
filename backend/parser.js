function extractResponses(aiResponseText) {
    if (!aiResponseText || !aiResponseText.includes('Response:')) return [];

    // Split on "Response:" and discard the first chunk (prompt instructions)
    const chunks = aiResponseText.split('Response:').slice(1);
    
    // ADD 'i' for the index mapping
    return chunks.map((chunk, i) => {
        const cleanChunk = chunk.replace(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}.*?https:\/\/gemini\.google\.com[^\n]*\n?/g, '').trim();

        // 1. Try JSON Parsing first
        try {
            const jsonMatch = cleanChunk.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.instagram && parsed.facebook) {
                    // Attach the index for the video matcher
                    return { index: i + 1, ...parsed };
                }
            }
        } catch (e) { /* Fallback to Regex */ }

        // 2. Regex Fallback
        const instaRegex = /2\. INSTAGRAM REELS[\s\S]*?Caption\n(.*?)\nHashtags\n(.*?)\nOn-Screen Text/s;
        const instaMatch = cleanChunk.match(instaRegex);

        const fbRegex = /3\. FACEBOOK REELS[\s\S]*?Description\n(.*?)\nHashtags\n(.*?)\n4\./s;
        const fbMatch = cleanChunk.match(fbRegex);

        return {
            index: i + 1, // Attach the index here too
            instagram: {
                caption: instaMatch ? instaMatch[1].trim() : '',
                hashtags: instaMatch ? instaMatch[2].trim() : ''
            },
            facebook: {
                description: fbMatch ? fbMatch[1].trim() : '',
                hashtags: fbMatch ? fbMatch[2].trim() : ''
            }
        };
    });
}

const instagramFinalText = (obj) => obj ? `${obj.caption}\n\n${obj.hashtags}`.trim() : '';
const facebookFinalText = (obj) => obj ? `${obj.description}\n\n${obj.hashtags}`.trim() : '';

module.exports = { extractResponses, instagramFinalText, facebookFinalText };