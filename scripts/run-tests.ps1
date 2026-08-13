# Lightweight test runner for newly added unit tests
# Usage: .\scripts\run-tests.ps1

$env:ENCRYPTION_MASTER_KEY = 'test-master-key-please-change-in-prod'

$tests = @(
  'tests/unit/crypto-keys.test.mjs',
  'tests/unit/applyTick.test.mjs'
)

$exitCode = 0
foreach ($t in $tests) {
  Write-Host "Running $t"
  node $t
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
}

exit $exitCode
