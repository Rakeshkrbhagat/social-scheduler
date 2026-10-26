const { extractResponses, facebookFinalText } = require('./parser');
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
const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const isJson = path.extname(file.originalname).toLowerCase() === '.json'
            || /json/i.test(file.mimetype || '');
        cb(isJson ? null : new Error('Only Gemini chat export .json files are accepted.'), isJson);
    },
});

// In-memory session state (single-user app). Publishing is Facebook-only.
const initialSession = () => ({
    googleDrive: { connected: false, folderId: null, folderUrl: null },
    facebook: { connected: false, pageId: null, accessToken: null },
    config: {},
    uploadedFiles: [],
});
let session = initialSession();

const GRAPH = 'https://graph.facebook.com/v19.0';

// ---------- Google OAuth2 ----------
const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

const assertGoogleConfigured = () => {
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Google OAuth is not configured. Missing: ${missing.join(', ')}`);
};
const googleErr = (err) => err.response?.data?.error?.message || err.response?.data?.error_description || err.message;

function extractFolderId(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/)
        || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

// [AUTH-1] Google Drive connection
app.post('/api/auth/google', async (req, res) => {
    const folderId = extractFolderId(req.body?.folderUrl);
    if (!folderId) return res.status(400).json({ success: false, message: 'Invalid Google Drive folder URL.' });
    try {
        assertGoogleConfigured();
        const { data } = await drive.files.get({ fileId: folderId, fields: 'id,name,mimeType', supportsAllDrives: true });
        if (data.mimeType !== 'application/vnd.google-apps.folder') throw new Error('The URL does not point to a folder.');
        session.googleDrive = { connected: true, folderId, folderUrl: req.body.folderUrl };
        res.json({ success: true, message: 'Google Drive connected', folderId });
    } catch (err) {
        res.status(400).json({ success: false, message: `Could not access folder: ${googleErr(err)}` });
    }
});

// [AUTH-2] Facebook
app.post('/api/auth/facebook', async (req, res) => {
    if (!session.googleDrive.connected) return res.status(400).json({ success: false, message: 'Connect Google Drive first.' });
    const { pageId, accessToken } = req.body || {};
    if (!pageId || !accessToken) return res.status(400).json({ success: false, message: 'Page ID and access token are required.' });
    try {
        await axios.get(`${GRAPH}/${encodeURIComponent(pageId)}`, { params: { fields: 'id,name', access_token: accessToken } });
        session.facebook = { connected: true, pageId, accessToken };
        res.json({ success: true, message: 'Facebook connected' });
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        res.status(401).json({ success: false, message: `Facebook authentication failed: ${msg}` });
    }
});

app.get('/api/session', (req, res) => {
    res.json({
        googleDrive: { connected: session.googleDrive.connected, folderUrl: session.googleDrive.folderUrl },
        facebook: { connected: session.facebook.connected },
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

app.post('/api/upload-json', (req, res) => upload.single('conversationFile')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (req.file) session.uploadedFiles.push(req.file.path);
    res.json({ message: 'File uploaded and parsing started' });
}));

// ---------- [DASH-2] Content extraction & mapping ----------
async function listDriveVideos(folderId) {
    assertGoogleConfigured();
    const files = [];
    let pageToken;
    do {
        const { data } = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
            fields: 'nextPageToken, files(id,name,mimeType,webViewLink,thumbnailLink)',
            pageSize: 1000,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageToken,
        });
        files.push(...(data.files || []));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
}

// Number at the end of the file name: "R-NEW-12.mp4" -> 12
const videoNumber = (name) => {
    const m = path.parse(name).name.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
};

app.post('/api/process', (req, res, next) => upload.single('conversationFile')(req, res, (err) => (
    err ? res.status(400).json({ success: false, message: err.message }) : next()
)), async (req, res) => {
    const file = req.file;
    try {
        if (!session.googleDrive.connected) throw new Error('Connect Google Drive first.');
        if (!file) throw new Error('Please upload the Gemini chat export (.json).');
        session.uploadedFiles.push(file.path);

        const fileContent = await fs.promises.readFile(file.path, 'utf8');
        let data;
        try {
            data = JSON.parse(fileContent.replace(/^\uFEFF/, ''));
        } catch {
            throw new Error('Uploaded file is not valid JSON.');
        }
        if (!Array.isArray(data?.chat)) throw new Error('JSON export has no "chat" array.');

        const videos = await listDriveVideos(session.googleDrive.folderId);
        const responses = extractResponses(data);
        if (!responses.length) throw new Error('No Facebook content found in the chat export.');

        const byNumber = new Map(responses.map((r) => [r.index, r]));
        const items = videos
            .map((v) => ({ video: v, number: videoNumber(v.name) }))
            .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
            .map(({ video, number }) => ({
                number,
                video: { id: video.id, name: video.name, link: video.webViewLink },
                facebook: byNumber.get(number)?.facebook || null,
            }));

        session.config.mappings = items;
        res.json({ success: true, message: `Found ${videos.length} video(s) and ${responses.length} response(s).`, items });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ---------- [SCHED-3] Sequential Facebook publishing ----------
const graphErr = (err) => err.response?.data?.error?.message || err.message;

// Stream video from Google Drive (bypasses virus-scan warning pages)
app.get('/api/video/:id', async (req, res) => {
    try {
        const response = await drive.files.get(
            { fileId: req.params.id, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' }
        );
        res.setHeader('Content-Type', 'video/mp4');
        response.data.pipe(res);
    } catch (err) {
        console.error('Streaming error:', err.message);
        res.status(500).send('Error streaming video');
    }
});

// Public URL of this server's proxy route (must be reachable by Meta's servers)
function driveDownloadUrl(req, fileId) {
    const host = req.get('host');
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}/api/video/${fileId}`;
}

// Facebook Reels: start -> hosted upload -> finish (scheduled via scheduled_publish_time)
async function uploadFacebookReel({ videoUrl, description, publishTime }) {
    const { pageId, accessToken } = session.facebook;
    const { data: start } = await axios.post(`${GRAPH}/${pageId}/video_reels`, null, {
        params: { upload_phase: 'start', access_token: accessToken },
    });
    await axios.post(start.upload_url || `https://rupload.facebook.com/video-upload/v19.0/${start.video_id}`, null, {
        headers: { Authorization: `OAuth ${accessToken}`, file_url: videoUrl },
    });
    const { data: finish } = await axios.post(`${GRAPH}/${pageId}/video_reels`, null, {
        params: {
            upload_phase: 'finish',
            video_id: start.video_id,
            video_state: 'SCHEDULED',
            scheduled_publish_time: publishTime,
            description,
            access_token: accessToken,
        },
    });
    if (finish.success === false) throw new Error('Facebook did not accept the reel.');
    return start.video_id;
}

app.post('/api/schedule', async (req, res) => {
    const { date, time, items } = req.body || {};
    const publishTime = Number.isInteger(req.body?.publishTime)
        ? req.body.publishTime
        : Math.floor(new Date(`${date}T${time}`).getTime() / 1000);
    try {
        if (!session.facebook.connected) throw new Error('Connect Facebook first.');
        assertGoogleConfigured();
        if (!date || !time) throw new Error('Date and time are required.');
        if (!Array.isArray(items) || !items.length) throw new Error('No videos to schedule.');
        if (Number.isNaN(publishTime)) throw new Error('Invalid date/time.');
        const now = Date.now() / 1000;
        if (publishTime < now + (10 * 60) || publishTime > now + (29 * 24 * 3600)) {
            throw new Error('Scheduled time must be between 10 minutes and 29 days from now.');
        }
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }

    const results = [];
    for (const item of items) { // strictly one video at a time
        const r = { videoId: item.video.id, name: item.video.name, facebook: null };
        if (!item.facebook) {
            r.error = 'No matching chat response for this video; skipped.';
            results.push(r);
            continue;
        }
        try {
            const id = await uploadFacebookReel({
                videoUrl: driveDownloadUrl(req, item.video.id),
                publishTime,
                description: facebookFinalText(item.facebook),
            });
            r.facebook = { success: true, id };
        } catch (e) { r.facebook = { success: false, message: graphErr(e) }; }
        results.push(r);
    }

    const ok = results.filter((r) => r.facebook?.success).length;
    session.config.lastSchedule = { date, time, results };
    res.json({
        success: ok === results.length,
        message: ok === results.length
            ? `All ${ok} video(s) scheduled on Facebook for ${date} ${time}.`
            : `${ok} of ${results.length} video(s) scheduled. See details below.`,
        results,
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
