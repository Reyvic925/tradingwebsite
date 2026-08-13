import { parse, pathToFileURL } from 'url';
import path from 'path';

export default async function handler(req, res) {
  const urlPath = parse(req.url || '').pathname || '/';
  const parts = urlPath.split('/').filter(Boolean); // e.g. ['api','ticker'] or ['ticker']

  if (parts[0] === 'api') parts.shift();

  const name = parts[0] || 'landing';
  const handlerPath = path.join(process.cwd(), 'api-handlers', `${name}.js`);

  try {
    const moduleUrl = pathToFileURL(handlerPath).href;
    const handlerModule = await import(moduleUrl);
    const fn = handlerModule?.default || handlerModule?.handler || handlerModule;
    if (typeof fn === 'function') {
      return fn(req, res);
    }

    res.statusCode = 500;
    return res.end(`Handler for ${name} is not a function`);
  } catch (err) {
    // Module not found errors differ between Node versions; check message/code
    const msg = String(err?.message || '');
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(msg) || /not find/.test(msg)) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    console.error(err);
    res.statusCode = 500;
    return res.end('Internal Server Error');
  }
}
