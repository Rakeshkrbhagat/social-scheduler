const express = require('express');


const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

// In-memory session state (single-user app)
const initialSession = () => ({
    googleDrive: { connected: false, folderId: null, folderUrl: null },
    facebook: { connected: false, pageId: null, accessToken: null },
    instagram: { connected: false, accountId: null, accessToken: null },
    config: {},
    uploadedFiles: [],
});
let session = initialSession();

const GRAPH = 'https://graph.facebook.com/v19.0';

function extractFolderId(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/)
        || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

// [AUTH-1] Google Drive connection
app.post('/api/auth/google', async (req, res) => {
    const { folderUrl } = req.body || {};
    const folderId = extractFolderId(folderUrl);
    if (!folderId) {
        return res.status(400).json({ success: false, message: 'Invalid Google Drive folder URL.' });
    }
    try {
        if (process.env.GOOGLE_API_KEY) {
            const drive = google.drive({ version: 'v3', auth: process.env.GOOGLE_API_KEY });
            const { data } = await drive.files.get({ fileId: folderId, fields: 'id,name,mimeType' });
            if (data.mimeType !== 'application/vnd.google-apps.folder') {
                throw new Error('The URL does not point to a folder.');
            }
        }
        session.googleDrive = { connected: true, folderId, folderUrl };
        res.json({ success: true, message: 'Google Drive connected', folderId });
    } catch (err) {
        res.status(400).json({ success: false, message: `Could not access folder: ${err.message}` });
    }
});

// [AUTH-2] Facebook
app.post('/api/auth/facebook', async (req, res) => {
    if (!session.googleDrive.connected) {
        return res.status(400).json({ success: false, message: 'Connect Google Drive first.' });
    }
    const { pageId, accessToken } = req.body || {};
    if (!pageId || !accessToken) {
        return res.status(400).json({ success: false, message: 'Page ID and access token are required.' });
    }
    try {
        await axios.get(`${GRAPH}/${encodeURIComponent(pageId)}`, { params: { fields: 'id,name', access_token: accessToken } });
        session.facebook = { connected: true, pageId, accessToken };
        res.json({ success: true, message: 'Facebook connected' });
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        res.status(401).json({ success: false, message: `Facebook authentication failed: ${msg}` });
    }
});

// [AUTH-2] Instagram
app.post('/api/auth/instagram', async (req, res) => {
    if (!session.facebook.connected) {
        return res.status(400).json({ success: false, message: 'Connect Facebook first.' });
    }
    const { accountId, accessToken } = req.body || {};
    const token = accessToken || session.facebook.accessToken;
    if (!accountId) {
        return res.status(400).json({ success: false, message: 'Instagram Business Account ID is required.' });
    }
    try {
        await axios.get(`${GRAPH}/${encodeURIComponent(accountId)}`, { params: { fields: 'id,username', access_token: token } });
        session.instagram = { connected: true, accountId, accessToken: token };
        res.json({ success: true, message: 'Instagram connected' });
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        res.status(401).json({ success: false, message: `Instagram authentication failed: ${msg}` });
    }
});

app.get('/api/session', (req, res) => {
    res.json({
        googleDrive: { connected: session.googleDrive.connected, folderUrl: session.googleDrive.folderUrl },
        facebook: { connected: session.facebook.connected },
        instagram: { connected: session.instagram.connected },
        uploadedFiles: session.uploadedFiles.length,
    });
});

// [AUTH-3] Logout: clear session, config and uploaded files
app.post('/api/logout', async (req, res) => {
    try {
        const entries = await fs.promises.readdir(UPLOAD_DIR);
        await Promise.all(entries.map((f) => fs.promises.rm(path.join(UPLOAD_DIR, f), { recursive: true, force: true })));
        session = initialSession();
        res.json({ success: true, message: 'Logged out and all data cleared.' });
    } catch (err) {
        res.status(500).json({ success: false, message: `Logout cleanup failed: ${err.message}` });
    }
});

app.post('/api/upload-pdf', upload.single('conversationFile'), (req, res) => {
    if (req.file) session.uploadedFiles.push(req.file.path);
    res.json({ message: 'File uploaded and parsing started' });
});

// ---------- [DASH-2] Content extraction & mapping ----------
async function pdfToText(buffer) {
    const mod = require('pdf-parse');
    if (mod.PDFParse) { // pdf-parse v2
        const parser = new mod.PDFParse({ data: buffer });
        try { return (await parser.getText()).text; } finally { await parser.destroy?.(); }
    }
    return (await (mod.default || mod)(buffer)).text; // pdf-parse v1
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const hashtagsOf = (s) => Array.from(new Set((s || '').match(/#[\p{L}\p{N}_]+/gu) || []));

// Text after a label (e.g. "Caption:") up to the next "Hashtags" label, with hashtags stripped.
function fieldText(section, labelRe) {
    const m = section.match(labelRe);
    let body = m ? section.slice(m.index + m[0].length) : section.replace(/^[^\n]*\n?/, '');
    body = body.split(/hashtags?\s*:?/i)[0];
    return clean(body.replace(/#[\p{L}\p{N}_]+/gu, ''));
}

// Each "response" in the PDF contains an Instagram Reels block followed by a Facebook Reels block.
function extractResponses(text) {
    const igRe = /instagram\s+reels?/gi;
    const starts = [];
    let m;
    while ((m = igRe.exec(text))) starts.push(m.index);
    return starts.map((start, i) => {
        const block = text.slice(start, starts[i + 1] ?? text.length);
        const fbIdx = block.search(/facebook\s+reels?/i);
        const igPart = fbIdx >= 0 ? block.slice(0, fbIdx) : block;
        const fbPart = fbIdx >= 0 ? block.slice(fbIdx) : '';
        return {
            index: i + 1,
            instagram: { caption: fieldText(igPart, /caption\s*:?/i), hashtags: hashtagsOf(igPart) },
            facebook: { description: fieldText(fbPart, /description\s*:?/i), hashtags: hashtagsOf(fbPart) },
        };
    });
}

async function listDriveVideos(folderId) {
    if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not configured on the server.');
    const drive = google.drive({ version: 'v3', auth: process.env.GOOGLE_API_KEY });
    const files = [];
    let pageToken;
    do {
        const { data } = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
            fields: 'nextPageToken, files(id,name,mimeType,webViewLink,thumbnailLink)',
            pageSize: 1000,
            pageToken,
        });
        files.push(...(data.files || []));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
}

// Number at the end of the file name (without extension): "R-YT-12.mp4" -> 12
const videoNumber = (name) => {
    const m = path.parse(name).name.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
};

app.post('/api/process', upload.single('conversationFile'), async (req, res) => {
    const file = req.file;
    try {
        if (!session.googleDrive.connected) throw new Error('Connect Google Drive first.');
        if (!file) throw new Error('Please upload the Conversation PDF.');
        session.uploadedFiles.push(file.path);
        if (file.mimetype !== 'application/pdf' && !/\.pdf$/i.test(file.originalname)) {
            throw new Error('Uploaded file must be a PDF.');
        }

        const [videos, text] = await Promise.all([
            listDriveVideos(session.googleDrive.folderId),
            fs.promises.readFile(file.path).then(pdfToText),
        ]);
        const responses = extractResponses(text);
        if (!responses.length) throw new Error('No "Instagram Reels" content found in the PDF.');

        const byNumber = new Map(responses.map((r) => [r.index, r]));
        const items = videos
            .map((v) => ({ video: v, number: videoNumber(v.name) }))
            .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
            .map(({ video, number }) => ({
                number,
                video: { id: video.id, name: video.name, link: video.webViewLink },
                instagram: byNumber.get(number)?.instagram || null,
                facebook: byNumber.get(number)?.facebook || null,
            }));

        session.config.mappings = items;
        res.json({ success: true, message: `Found ${videos.length} video(s) and ${responses.length} response(s).`, items });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.post('/api/schedule', (req, res) => {
    res.json({ message: 'Scheduling started' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
