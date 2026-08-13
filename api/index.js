const { parse } = require('url');
const path = require('path');

module.exports = async (req, res) => {
  const url = parse(req.url || '').pathname || '/';
  const parts = url.split('/').filter(Boolean); // e.g. ['/api','ticker'] or ['ticker'] => ['api','ticker'] or ['ticker']

  // If Vercel passes the full path, the first segment may be 'api'. Remove it so we route by the handler name.
  if (parts[0] === 'api') parts.shift();

  const name = parts[0] || 'landing';
  const handlerPath = path.join(__dirname, '..', 'api-handlers', `${name}.js`);

  try {
    const handlerModule = require(handlerPath);
    const fn = handlerModule && (handlerModule.default || handlerModule.handler || handlerModule);
    if (typeof fn === 'function') {
      return fn(req, res);
    }

    res.statusCode = 500;
    return res.end(`Handler for ${name} is not a function`);
  } catch (err) {
    // If handler not found, return 404
    if (err && err.code === 'MODULE_NOT_FOUND') {
      res.statusCode = 404;
      return res.end('Not found');
    }
    // For other errors, log and return 500
    console.error(err);
    res.statusCode = 500;
    return res.end('Internal Server Error');
  }
};
