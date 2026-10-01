import { sendUserEmail } from './email.js';

export async function notifyUser(env, userId, title, body, source = 'worker') {
  try {
    await env.DB.prepare(`
      INSERT INTO notifications (user_id, title, body, read)
      VALUES (?, ?, ?, 0)
    `).bind(userId, title, body || '').run();
  } catch (error) {
    console.error(`[${source}] in-app notification failed:`, error?.message || error);
  }
  return await sendUserEmail(env, userId, { subject: title, text: body || title }, source);
}