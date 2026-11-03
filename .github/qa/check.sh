set -eu
npm ci
npm run build
npm install --prefix /tmp/family-qa --no-audit --no-fund @sparticuz/chromium@141.0.0 playwright-core@1.56.1
cp .github/qa/family.mjs /tmp/family-qa/
npm run preview -- --port 4173 >/tmp/family-server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:4173 >/dev/null && break || sleep 1; done
node /tmp/family-qa/family.mjs
