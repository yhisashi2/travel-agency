import { syncAll, useStore } from '../lib/store';

const LABEL = {
  local: { text: '端末のみ', cls: 'muted' },
  idle: { text: '同期済み', cls: 'ok' },
  syncing: { text: '同期中…', cls: 'muted' },
  offline: { text: 'オフライン', cls: 'warn' },
  error: { text: '同期エラー', cls: 'err' },
} as const;

export default function SyncBadge() {
  const sync = useStore((s) => s.sync);
  const error = useStore((s) => s.error);
  const dirty = useStore((s) => Object.values(s.records).some((r) => r.dirty) || !!s.places?.dirty);
  const l = LABEL[sync];
  const text = sync === 'idle' && dirty ? '未送信あり' : l.text;
  return (
    <button className={`badge ${l.cls}`} title={error ?? ''} onClick={() => void syncAll()}>
      {sync === 'syncing' ? '⟳' : sync === 'idle' && !dirty ? '✓' : '●'} {text}
    </button>
  );
}
