import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { createShareGate } from './share-gate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(root, 'data');
mkdirSync(data, { recursive: true });
const statusPath = join(data, 'internet-share-status.json');
const stopPath = join(data, 'internet-share.stop');
const accessCode = randomBytes(12).toString('hex');
const executable = process.env.CLOUDFLARED_PATH || join(data, 'tools', 'cloudflared.exe');
if (!existsSync(executable)) throw Error('Download cloudflared from https://developers.cloudflare.com/tunnel/downloads/ and place it in data/tools/cloudflared.exe');
const port = Number(process.env.SHARE_PORT || 3103);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid SHARE_PORT');
await new Promise((ok, fail) => {
  const probe = net.createServer();
  probe.once('error', fail);
  probe.listen(port, '127.0.0.1', () => probe.close(ok));
});
if (existsSync(stopPath)) unlinkSync(stopPath);
const gatePort = Number(process.env.SHARE_GATE_PORT || 3104);
if (!Number.isInteger(gatePort) || gatePort < 1024 || gatePort > 65535 || gatePort === port) throw Error('Invalid SHARE_GATE_PORT');
let tunnel, app, timer, timeout, stopping = false, url = '', appStarted = false;
const gate = createShareGate({code:accessCode, origin:()=>url, upstreamPort:port});
await new Promise((ok, fail) => { gate.once('error', fail); gate.listen(gatePort, '127.0.0.1', ok); });
const status = (state, extra = {}) => writeFileSync(statusPath, JSON.stringify({ state, url, accessCode, authentication:'local-demo-code', port, gatePort, pid: process.pid, tunnelPid: tunnel?.pid, startedAt: new Date().toISOString(), ...extra }, null, 2));
function stop(reason = 'stopped') {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearTimeout(timeout);
  status('stopped', { reason });
  if (app?.connected) app.send({ command: 'stop' });
  tunnel?.kill();
  gate.close();
  gate.closeAllConnections();
  const force = setTimeout(() => { app?.kill(); process.exitCode = 0; }, 4000);
  force.unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('message', message => { if (message?.command === 'stop') stop(); });
const logPath = join(data, 'internet-tunnel.log');
async function startApp() {
  if (appStarted || stopping) return;
  appStarted = true;
  const env = { ...process.env, PORT: String(port), DATA_DIR: join(data, 'internet-demo'), PUBLIC_BASE_URL: url, COOKIE_SECURE: '1' };
  delete env.TLS_CERT_FILE;
  delete env.TLS_KEY_FILE;
  app = spawn(process.execPath, ['supervisor.mjs'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  app.stdout.on('data', chunk => process.stdout.write(chunk));
  app.stderr.on('data', chunk => process.stderr.write(chunk));
  app.on('error', error => stop(error.message));
  app.on('exit', () => { if (!stopping) stop('Application stopped'); });
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/system`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        clearTimeout(timeout);
        status('running');
        console.log('\nInternet demo: ' + url + '\nDemo access code: ' + accessCode + '\nKeep this process and computer running. Stop with Stop-Internet-Demo.cmd or Ctrl+C.');
        return;
      }
    } catch {}
    await new Promise(ok => setTimeout(ok, 500));
  }
  if (!stopping) stop('Application did not become ready');
}
let output = '';
tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${gatePort}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
status('starting');
const onTunnelOutput = chunk => {
  appendFileSync(logPath, chunk);
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-20000);
  const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i);
  if (match && !url) { url = match[0]; startApp().catch(error => stop(error.message)); }
};
tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('error', error => stop(error.message));
tunnel.on('exit', () => { if (!stopping) stop('Tunnel stopped'); });
timeout = setTimeout(() => stop('Tunnel startup timed out'), 120000);
timer = setInterval(() => { if (existsSync(stopPath)) { unlinkSync(stopPath); stop(); } }, 1000);
