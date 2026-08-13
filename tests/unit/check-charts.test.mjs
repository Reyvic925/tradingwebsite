import assert from 'assert';
import fs from 'fs';

const comp = 'src/components/PositionChart.tsx';
const page = 'src/pages/GainsLosses.tsx';

try {
  assert.ok(fs.existsSync(comp), `Missing ${comp}`);
  assert.ok(fs.existsSync(page), `Missing ${page}`);
  const c = fs.readFileSync(comp, 'utf8');
  const p = fs.readFileSync(page, 'utf8');
  assert.ok(c.includes('export default'), 'PositionChart must export default');
  assert.ok(p.includes('export default'), 'GainsLosses must export default');
  console.log('CHART FILES OK');
} catch (err) {
  console.error(err);
  process.exit(2);
}
