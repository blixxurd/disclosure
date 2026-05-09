import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sizeOfFile(path: string): number {
  return statSync(path).size;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Spawn a command, capture stdout/stderr, never throws — caller decides
// what a non-zero exit code means. ENOENT (missing binary) returns code 127.
export function runCmd(
  cmd: string,
  args: string[],
  opts: { input?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (r: RunResult) => {
      if (settled) return;
      settled = true;
      resolvePromise(r);
    };
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    const timer =
      opts.timeoutMs !== undefined
        ? setTimeout(() => {
            killedByTimeout = true;
            child.kill('SIGKILL');
          }, opts.timeoutMs)
        : null;
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      settle({
        code: e.code === 'ENOENT' ? 127 : -1,
        stdout: '',
        stderr: `${cmd}: ${e.message}`,
      });
    });
    child.stdout?.on('data', (b) => (stdout += b.toString()));
    child.stderr?.on('data', (b) => (stderr += b.toString()));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      settle({
        code: killedByTimeout ? 124 : (code ?? -1),
        stdout,
        stderr,
      });
    });
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    } else {
      child.stdin?.end();
    }
  });
}
