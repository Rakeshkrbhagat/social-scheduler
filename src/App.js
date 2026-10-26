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

const initialStatus = { google: false, facebook: false };

// Dialog steps: drive | driveSuccess | driveFail | facebook | facebookFail | done | null
function App() {
  const [step, setStep] = useState(null);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [folderUrl, setFolderUrl] = useState('');
  const [fb, setFb] = useState({ pageId: '', accessToken: '' });

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
      setStep('done');
    }, 'facebookFail');

  // [DASH-1] / [DASH-2]
  const [chatFile, setChatFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [procError, setProcError] = useState('');
  const [items, setItems] = useState([]);
  const authenticated = status.google && status.facebook;

  const getVideosAndCaptions = async () => {
    setProcessing(true);
    setProcError('');
    setItems([]);
    try {
      const fd = new FormData();
      fd.append('conversationFile', chatFile);
      const res = await fetch(`${API}/api/process`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || res.statusText);
      // hashtags are editable space-separated strings
      const tagStr = (t) => (Array.isArray(t) ? t.join(' ') : String(t ?? ''));
      setItems((data.items || []).map((it) => ({
        ...it,
        facebook: it.facebook && { ...it.facebook, hashtags: tagStr(it.facebook.hashtags) },
      })));
      setResults({});
    } catch (e) {
      setProcError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  // [SCHED-1..3]
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [results, setResults] = useState({});
  const [schedMsg, setSchedMsg] = useState(null);

  const updateItem = (i, field, value) =>
    setItems((list) => list.map((it, idx) => (idx === i ? { ...it, facebook: { ...it.facebook, [field]: value } } : it)));

  const schedule = async () => {
    setScheduling(true);
    setResults({});
    try {
      const res = await fetch(`${API}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: schedDate,
          time: schedTime,
          publishTime: Math.floor(new Date(`${schedDate}T${schedTime}`).getTime() / 1000),
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setResults(Object.fromEntries((data.results || []).map((r) => [r.videoId, r])));
      setSchedMsg({ ok: res.ok && data.success, text: data.message || res.statusText });
    } catch (e) {
      setSchedMsg({ ok: false, text: `Network error: ${e.message}` });
    } finally {
      setScheduling(false);
    }
  };

  const logout = async () => {
    await post('/api/logout');
    setChatFile(null);
    setFileKey((k) => k + 1);
    setItems([]);
    setProcError('');
    setResults({});
    setSchedDate('');
    setSchedTime('');
    setSchedMsg(null);
    setStatus(initialStatus);
    setFolderUrl('');
    setFb({ pageId: '', accessToken: '' });
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

      {authenticated && step === null ? (
        <main className="dashboard">
          <h2>Main Dashboard</h2>
          <div className="upload-row">
            <label>Gemini Chat Export (.json)
              <input key={fileKey} type="file" accept="application/json,.json"
                onChange={(e) => setChatFile(e.target.files[0] || null)} />
            </label>
            <button onClick={getVideosAndCaptions} disabled={!chatFile || processing || scheduling}>
              {processing ? 'Processing…' : 'Get Video & Captions'}
            </button>
          </div>
          {procError && <p className="error">{procError}</p>}

          {items.length > 0 && (
            <>
              <h3>Review Content</h3>
              <table className="results">
                <thead><tr><th>#</th><th>Video</th><th>Facebook Reel (description / hashtags)</th><th>Status</th></tr></thead>
                <tbody>
                  {items.map((it, i) => {
                    const r = results[it.video.id];
                    return (
                      <tr key={it.video.id}>
                        <td>{it.number ?? '–'}</td>
                        <td>{it.video.link ? <a href={it.video.link} target="_blank" rel="noreferrer">{it.video.name}</a> : it.video.name}</td>
                        <td>{it.facebook ? <>
                          <textarea rows={4} value={it.facebook.description} disabled={scheduling}
                            onChange={(e) => updateItem(i, 'description', e.target.value)} />
                          <input value={it.facebook.hashtags} disabled={scheduling}
                            onChange={(e) => updateItem(i, 'hashtags', e.target.value)} />
                        </> : <em>No matching response</em>}</td>
                        <td>{r ? (r.error ? <span className="error">{r.error}</span>
                          : (r.facebook?.success ? '✅ Scheduled' : `❌ ${r.facebook?.message || ''}`)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="schedule-row">
                <label>Date
                  <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} disabled={scheduling} />
                </label>
                <label>Time
                  <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} disabled={scheduling} />
                </label>
                <button onClick={schedule} disabled={!schedDate || !schedTime || scheduling}>
                  {scheduling ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </>
          )}
        </main>
      ) : (
        <main className="dashboard">
          <ul className="status-list">
            <li>Google Drive: {status.google ? '✅ Connected' : '❌ Not connected'}</li>
            <li>Facebook: {status.facebook ? '✅ Connected' : '❌ Not connected'}</li>
          </ul>
          <button onClick={() => setStep('drive')}>Connect Accounts</button>
        </main>
      )}

      {schedMsg && (
        <Dialog title={schedMsg.ok ? 'Scheduling Complete' : 'Scheduling Finished with Errors'}
          actions={<button onClick={() => setSchedMsg(null)}>OK</button>}>
          <p>{schedMsg.text}</p>
        </Dialog>
      )}

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

      {step === 'done' && (
        <Dialog title="All Set!" actions={<button onClick={close}>Go to Dashboard</button>}>
          <p>Google Drive and Facebook are connected.</p>
        </Dialog>
      )}
    </div>
  );
}

export default App;

