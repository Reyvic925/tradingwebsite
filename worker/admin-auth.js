import { getAuthenticatedUser } from './auth.js';

export async function getD1Admin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return null;

  const allowedEmails = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedEmails.includes(String(user.email || '').trim().toLowerCase())) return null;

  const profile = await env.DB.prepare('SELECT role FROM profiles WHERE user_id = ?')
    .bind(user.id).first();
  return profile?.role === 'admin' ? user : null;
}