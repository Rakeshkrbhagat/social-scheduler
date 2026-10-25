import { useState } from 'react';


import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function post(path, body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.success !== false, message: data.message || res.statusText };
  } catch (e) {
    return { ok: false, message: `Network error: ${e.message}` };
  }
}

function Dialog({ title, children, actions }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <h2>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

const initialStatus = { google: false, facebook: false, instagram: false };

// Dialog steps: drive | driveSuccess | driveFail | facebook | facebookFail | instagram | instagramFail | done | null
function App() {
  const [step, setStep] = useState(null);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [folderUrl, setFolderUrl] = useState('');
  const [fb, setFb] = useState({ pageId: '', accessToken: '' });
  const [ig, setIg] = useState({ accountId: '', accessToken: '' });

  const run = async (path, body, onOk, failStep) => {
    setLoading(true);
    const r = await post(path, body);
    setLoading(false);
    setMessage(r.message);
    if (r.ok) onOk(); else setStep(failStep);
  };

  const connectDrive = () =>
    run('/api/auth/google', { folderUrl }, () => {
      setStatus((s) => ({ ...s, google: true }));
      setStep('driveSuccess');
    }, 'driveFail');

  const connectFacebook = () =>
    run('/api/auth/facebook', fb, () => {
      setStatus((s) => ({ ...s, facebook: true }));
      setStep('instagram');
    }, 'facebookFail');

  const connectInstagram = () =>
    run('/api/auth/instagram', ig, () => {
      setStatus((s) => ({ ...s, instagram: true }));
      setStep('done');
    }, 'instagramFail');

  const logout = async () => {
    await post('/api/logout');
    setStatus(initialStatus);
    setFolderUrl('');
    setFb({ pageId: '', accessToken: '' });
    setIg({ accountId: '', accessToken: '' });
    setMessage('');
    setStep(null);
    try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
  };

  const close = () => setStep(null);
  const busy = loading ? 'Connecting…' : null;

  return (
    <div className="App">
      <header className="dashboard-header">
        <h1>Social Scheduler Dashboard</h1>
        <button onClick={logout}>Logout</button>
      </header>

      <main className="dashboard">
        <ul className="status-list">
          <li>Google Drive: {status.google ? '✅ Connected' : '❌ Not connected'}</li>
          <li>Facebook: {status.facebook ? '✅ Connected' : '❌ Not connected'}</li>
          <li>Instagram: {status.instagram ? '✅ Connected' : '❌ Not connected'}</li>
        </ul>
        <button onClick={() => setStep('drive')}>Connect Accounts</button>
      </main>

      {step === 'drive' && (
        <Dialog title="Connect Google Drive" actions={<>
          <button onClick={close}>Cancel</button>
          <button onClick={connectDrive} disabled={loading || !folderUrl}>{busy || 'Connect'}</button>
        </>}>
          <label>Google Drive folder URL
            <input type="url" value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..." />
          </label>
        </Dialog>
      )}

      {step === 'driveSuccess' && (
        <Dialog title="Google Drive Connected" actions={
          <button onClick={() => setStep('facebook')}>Continue</button>}>
          <p>{message}</p>
        </Dialog>
      )}

      {step === 'driveFail' && (
        <Dialog title="Connection Failed" actions={<>
          <button onClick={close}>Close</button>
          <button onClick={() => setStep('drive')}>Retry</button>
        </>}>
          <p>{message}</p>
        </Dialog>
      )}

      {step === 'facebook' && (
        <Dialog title="Connect Facebook" actions={<>
          <button onClick={close}>Cancel</button>
          <button onClick={connectFacebook} disabled={loading || !fb.pageId || !fb.accessToken}>{busy || 'Connect'}</button>
        </>}>
          <label>Facebook Page ID
            <input value={fb.pageId} onChange={(e) => setFb({ ...fb, pageId: e.target.value })} />
          </label>
          <label>Page Access Token
            <input type="password" value={fb.accessToken} onChange={(e) => setFb({ ...fb, accessToken: e.target.value })} />
          </label>
        </Dialog>
      )}

      {step === 'facebookFail' && (
        <Dialog title="Facebook Connection Failed" actions={<>
          <button onClick={close}>Close</button>
          <button onClick={() => setStep('facebook')}>Retry</button>
        </>}>
          <p>{message}</p>
        </Dialog>
      )}

      {step === 'instagram' && (
        <Dialog title="Connect Instagram" actions={<>
          <button onClick={close}>Cancel</button>
          <button onClick={connectInstagram} disabled={loading || !ig.accountId}>{busy || 'Connect'}</button>
        </>}>
          <p>Facebook connected successfully. Now provide your Instagram credentials.</p>
          <label>Instagram Business Account ID
            <input value={ig.accountId} onChange={(e) => setIg({ ...ig, accountId: e.target.value })} />
          </label>
          <label>Access Token (optional – defaults to Facebook token)
            <input type="password" value={ig.accessToken} onChange={(e) => setIg({ ...ig, accessToken: e.target.value })} />
          </label>
        </Dialog>
      )}

      {step === 'instagramFail' && (
        <Dialog title="Instagram Connection Failed" actions={<>
          <button onClick={close}>Close</button>
          <button onClick={() => setStep('instagram')}>Retry</button>
        </>}>
          <p>{message}</p>
        </Dialog>
      )}

      {step === 'done' && (
        <Dialog title="All Set!" actions={<button onClick={close}>Go to Dashboard</button>}>
          <p>Google Drive, Facebook and Instagram are connected.</p>
        </Dialog>
      )}
    </div>
  );
}

export default App;
