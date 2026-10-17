/** travel-agency-data を操作する Claude Code セッションへのリンク（設定で変更可） */
const KEY = 'ta.claudeLink';
export const DEFAULT_CLAUDE_LINK = 'https://claude.ai/code/session_013vp2zP9StkF1qz6DppVhZN';

export function loadClaudeLink(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_CLAUDE_LINK;
  } catch {
    return DEFAULT_CLAUDE_LINK;
  }
}

export function saveClaudeLink(url: string) {
  try {
    if (url.trim() && url.trim() !== DEFAULT_CLAUDE_LINK) localStorage.setItem(KEY, url.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* 保存できなくても既定値で動く */
  }
}
