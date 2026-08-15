import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Repo git dipakai sebagai "database" state (posisi) antara proses bot interaktif dan
// GitHub Actions — masing-masing jalan di lingkungan terpisah, jadi perubahan harus
// di-commit & push supaya keduanya melihat state yang sama. Gagal push tidak boleh
// menjatuhkan proses utama (mis. tidak ada kredensial git di suatu environment).
export async function commitAndPush(relativeFilePath, message) {
  try {
    await execFileAsync('git', ['add', relativeFilePath]);

    const { stdout: statusOutput } = await execFileAsync('git', [
      'status',
      '--porcelain',
      '--',
      relativeFilePath,
    ]);

    if (!statusOutput.trim()) {
      return { committed: false, reason: 'no-changes' };
    }

    await execFileAsync('git', ['commit', '-m', message]);
    await execFileAsync('git', ['push']);
    return { committed: true };
  } catch (error) {
    console.error(`[gitSync] Gagal commit/push ${relativeFilePath}:`, error.message);
    return { committed: false, reason: error.message };
  }
}
