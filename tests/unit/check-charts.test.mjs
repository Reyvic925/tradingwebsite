import assert from 'assert';
import fs from 'fs';

const comp = 'src/components/PositionChart.tsx';

try {
  assert.ok(fs.existsSync(comp), `Missing ${comp}`);
  const c = fs.readFileSync(comp, 'utf8');
  assert.ok(c.includes('export default'), 'PositionChart must export default');
  console.log('CHART FILES OK');
} catch (err) {
  console.error(err);
  process.exit(2);
}
