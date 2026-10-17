import { useState } from 'react';
import SyncBadge from '../components/SyncBadge';
import { GitHubClient, loadSettings, saveSettings, type GitHubSettings } from '../lib/github';
import { navigate } from '../lib/router';
import { getState, syncAll, useStore } from '../lib/store';

export default function Settings() {
  const current = loadSettings();
  const [s, setS] = useState<GitHubSettings>(current ?? { owner: '', repo: 'travel-agency-data', branch: 'main', token: '', dir: 'trips' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSync = useStore((st) => st.lastSync);
  const error = useStore((st) => st.error);
  const set = (k: keyof GitHubSettings, v: string) => setS((x) => ({ ...x, [k]: v.trim() }));

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const info = await new GitHubClient(s).checkAccess();
      if (!info.canPush) throw new Error('このトークンには書き込み権限がありません（Contents: Read and write が必要）');
      saveSettings(s);
      await syncAll();
      setMsg(`接続しました${info.private ? '' : '（⚠️ 公開リポジトリです。旅行データが誰でも見られます）'}`);
    } catch (e) {
      setMsg('接続できませんでした: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" aria-label="戻る" onClick={() => navigate()}>
          ‹
        </button>
        <h1>設定</h1>
        <SyncBadge />
      </header>
      <main className="content stack">
        <div className="card form">
          <h3>GitHub 同期</h3>
          <p className="muted small">
            旅行データを GitHub のリポジトリ（推奨: 非公開）に JSON で保存し、スマホ・PC・Claude Code から同じプランを編集できます。
            トークンは <b>Fine-grained personal access token</b> で、対象リポジトリのみ・<b>Contents: Read and write</b> を許可してください。
            トークンはこの端末内にのみ保存されます。
          </p>
          <label>
            オーナー（ユーザー名）
            <input value={s.owner} onChange={(e) => set('owner', e.target.value)} autoCapitalize="off" />
          </label>
          <label>
            リポジトリ名
            <input value={s.repo} onChange={(e) => set('repo', e.target.value)} autoCapitalize="off" />
          </label>
          <div className="row gap">
            <label className="grow">
              ブランチ
              <input value={s.branch} onChange={(e) => set('branch', e.target.value)} autoCapitalize="off" />
            </label>
            <label className="grow">
              フォルダ
              <input value={s.dir} onChange={(e) => set('dir', e.target.value)} autoCapitalize="off" />
            </label>
          </div>
          <label>
            アクセストークン
            <input type="password" value={s.token} onChange={(e) => set('token', e.target.value)} autoComplete="off" placeholder="github_pat_…" />
          </label>
          <div className="row gap">
            <button className="btn primary grow" disabled={busy || !s.owner || !s.repo || !s.token} onClick={() => void connect()}>
              {busy ? '接続中…' : current ? '保存して再接続' : '接続'}
            </button>
            {current && (
              <button
                className="btn"
                onClick={() => {
                  if (!confirm('GitHub との接続を解除しますか？（端末内のデータは残ります）')) return;
                  saveSettings(null);
                  void syncAll();
                  setS({ ...s, token: '' });
                  setMsg('接続を解除しました');
                }}
              >
                解除
              </button>
            )}
          </div>
          {msg && <p className="small">{msg}</p>}
        </div>

        {current && (
          <div className="card">
            <h3>同期状態</h3>
            <p className="small">最終同期: {lastSync ? new Date(lastSync).toLocaleString('ja-JP') : '—'}</p>
            {error && <p className="small warn-text">{error}</p>}
            <p className="small muted">
              未送信: {Object.values(getState().records).filter((r) => r.dirty).length} 件
            </p>
            <button className="btn" onClick={() => void syncAll()}>
              今すぐ同期
            </button>
          </div>
        )}

        <div className="card">
          <h3>スマホでアプリとして使う</h3>
          <ul className="small">
            <li>iPhone: Safari で開き「共有」→「ホーム画面に追加」</li>
            <li>Android: Chrome のメニュー →「アプリをインストール」</li>
            <li>一度開いた旅行と地図はオフラインでも閲覧・編集でき、電波が戻ると自動で同期します。</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
