import simulateHandler from './simulate.js';

export default async function handler(req, res) {
  // Vercel Cron uses GET; local/manual callers may still use POST.
  return simulateHandler(req, res);
}