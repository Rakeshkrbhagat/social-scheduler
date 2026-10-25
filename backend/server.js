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

app.post('/api/schedule', (req, res) => {
    res.json({ message: 'Scheduling started' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
