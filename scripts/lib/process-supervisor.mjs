import { execFile, spawn } from 'node:child_process';
import { Socket } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function windowsPortOwner(port) {
  const query = `$c=Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if($null -eq $c){exit 0}; $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; [pscustomobject]@{pid=$c.OwningProcess;command=$p.CommandLine}|ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', query], { encoding: 'utf8' });
    return stdout.trim() ? JSON.parse(stdout) : null;
  } catch {
    return null;
  }
}

export async function inspectPort(host, port) {
  const occupied = await new Promise((resolve) => {
    const socket = new Socket();
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(400);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
  if (!occupied) return { occupied: false, host, port, pid: null, command: null };
  const owner = process.platform === 'win32' ? await windowsPortOwner(port) : null;
  return { occupied: true, host, port, pid: owner?.pid ?? null, command: owner?.command ?? null };
}

export async function waitForHttp(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`SERVICE_NOT_READY:${url}`, { cause: lastError });
}

export async function terminateOwnedChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']).catch(() => undefined);
  } else {
    child.kill('SIGTERM');
  }
}

export async function runSupervised(specs) {
  for (const spec of specs) {
    const state = await inspectPort(spec.host, spec.port);
    if (state.occupied) {
      throw new Error(`PORT_IN_USE:${spec.port}:PID=${state.pid ?? 'unknown'}:COMMAND=${state.command ?? 'unknown'}`);
    }
  }
  const children = [];
  const stop = async () => Promise.all(children.map(terminateOwnedChild));
  try {
    for (const spec of specs) {
      const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, stdio: 'inherit' });
      children.push(child);
      child.once('exit', (code) => { if (code !== 0) void stop(); });
      await waitForHttp(spec.readyUrl);
    }
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
    await Promise.race(children.map((child) => new Promise((resolve) => child.once('exit', resolve))));
  } finally {
    await stop();
  }
}
