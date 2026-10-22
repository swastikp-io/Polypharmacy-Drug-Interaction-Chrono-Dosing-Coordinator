import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

let cachedProjectRoot: string | null = null;

/**
 * Robustly finds the Polypharmacy Coordinator project root directory across:
 * - Direct tsx execution in dev (`tsx src/server/index.ts`)
 * - Production compiled server (`node dist/server/index.js`)
 * - Bundled MCP server executable (`node mcp-server/dist/index.js`)
 * - External execution where working directory is arbitrary (e.g. C:\WINDOWS\system32)
 * - Vitest test runners in subdirectories
 */
export function getProjectRoot(): string {
  if (cachedProjectRoot) {
    return cachedProjectRoot;
  }

  // 1. Explicit environment variable override
  if (process.env.POLYPHARMACY_ROOT && fs.existsSync(process.env.POLYPHARMACY_ROOT)) {
    cachedProjectRoot = path.resolve(process.env.POLYPHARMACY_ROOT);
    return cachedProjectRoot;
  }

  // Helper to check if a directory is our project root
  const isProjectRoot = (dir: string): boolean => {
    try {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        if (pkg.name === 'polypharmacy-coordinator') {
          return true;
        }
      }
    } catch {
      // ignore
    }
    // Also check for signature directory structure
    if (
      fs.existsSync(path.join(dir, 'src', 'server')) &&
      fs.existsSync(path.join(dir, 'data'))
    ) {
      return true;
    }
    return false;
  };

  const walkUp = (startDir: string): string | null => {
    let current = path.resolve(startDir);
    while (true) {
      if (isProjectRoot(current)) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return null;
  };

  // 2. Check process.cwd() first if it's already the project root
  const cwd = process.cwd();
  if (isProjectRoot(cwd)) {
    cachedProjectRoot = cwd;
    return cachedProjectRoot;
  }

  // 3. Walk upwards from current module's file location
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const foundFromMeta = walkUp(path.dirname(currentFile));
    if (foundFromMeta) {
      cachedProjectRoot = foundFromMeta;
      return cachedProjectRoot;
    }
  } catch {
    // ignore
  }

  // 4. Walk upwards from process.argv[1] (the entry script path)
  if (process.argv[1]) {
    try {
      const entryDir = path.dirname(path.resolve(process.argv[1]));
      const foundFromEntry = walkUp(entryDir);
      if (foundFromEntry) {
        cachedProjectRoot = foundFromEntry;
        return cachedProjectRoot;
      }
    } catch {
      // ignore
    }
  }

  // 5. Fallback to process.cwd()
  cachedProjectRoot = cwd;
  return cachedProjectRoot;
}

export function getDataDir(): string {
  const root = getProjectRoot();
  return path.resolve(root, 'data');
}

export function getUploadsDir(): string {
  return path.resolve(getDataDir(), 'uploads');
}

export function getTempUploadsDir(): string {
  return path.resolve(getUploadsDir(), 'temp');
}

export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  if (process.env.NODE_ENV === 'test') {
    return ':memory:';
  }
  return path.resolve(getDataDir(), 'polypharmacy.db');
}

export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (err: any) {
      // If permission error and directory doesn't exist, rethrow with clear error
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Failed to create directory at "${dirPath}": ${err?.message || err}`);
      }
    }
  }
}
