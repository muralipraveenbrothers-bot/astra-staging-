// Health check script for Astra services
const ports = require('../config/ports.json');
const free = ports.services.freellmapi;
const services = [
  { name: 'FreeLLMAPI', url: `http://${free.host}:${free.port}/api/ping` },
  { name: 'AstraAPI', url: 'http://127.0.0.1:3000/health' },
  { name: 'Voicebox', url: 'http://127.0.0.1:17493/health' },
];
(async () => {
  console.log('Checking service health...');
  for (const s of services) {
    try {
      const res = await fetch(s.url, { timeout: 5000 });
      const ok = res.ok;
      const txt = await res.text();
      console.log(`${s.name}: ${ok ? 'OK' : 'FAIL'} (${res.status})`);
    } catch (e) {
      console.log(`${s.name}: ERROR (${e.message})`);
    }
  }
})();
