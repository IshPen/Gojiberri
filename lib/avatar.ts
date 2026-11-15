export const AVATARS = ["🐱", "🦊", "🐼", "🐸", "🦄", "🐙", "🦁", "🐯", "🐵", "🐧", "🦉", "🐳"];

export function avatarFor(user: { name: string; avatarUrl?: string }): string {
  if (user.avatarUrl && !user.avatarUrl.includes("/")) return user.avatarUrl;
  let hash = 0;
  for (const ch of user.name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[hash % AVATARS.length];
}
