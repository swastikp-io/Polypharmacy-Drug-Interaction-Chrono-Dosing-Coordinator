import crypto from 'crypto';

/**
 * Sanitizes tool input object by stripping out raw image/binary buffers, base64 data,
 * and sensitive raw prescription contents before generating an audit hash or log record.
 */
export function sanitizeToolInput(toolName: string, input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object') {
    return { value: input ?? null };
  }

  const obj = input as Record<string, any>;
  const sanitized: Record<string, any> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;

    // Check if buffer or base64 data
    if (Buffer.isBuffer(val)) {
      sanitized[key] = '[REDACTED_BINARY_BUFFER]';
      continue;
    }

    if (typeof val === 'string') {
      // Check for base64 data URIs or very long encoded strings
      if (val.startsWith('data:') || (val.length > 500 && /^[A-Za-z0-9+/=]+$/.test(val))) {
        sanitized[key] = '[REDACTED_BASE64_DATA]';
        continue;
      }

      // Check for raw image file paths: retain only the sanitized filename
      if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
        sanitized[key] = val.split(/[\\/]/).pop() || '[FILE_PATH]';
        continue;
      }

      // Redact potential PII fields
      if (['ssn', 'password', 'token', 'secret'].includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED_CREDENTIAL]';
        continue;
      }

      sanitized[key] = val;
    } else if (Array.isArray(val)) {
      sanitized[key] = val.map((item) => {
        if (typeof item === 'object' && item !== null) {
          // If candidate order, strip raw images if any
          const copy = { ...item };
          if (copy.fileBuffer) delete copy.fileBuffer;
          if (copy.imageData) copy.imageData = '[REDACTED]';
          return copy;
        }
        return item;
      });
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeToolInput(toolName, val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Generates a deterministic SHA-256 hash of the sanitized input.
 * Keys are recursively sorted to guarantee the same hash regardless of object key order.
 */
export function computeSanitizedInputHash(toolName: string, input: unknown): string {
  const sanitized = sanitizeToolInput(toolName, input);
  const canonicalJson = stableStringify(sanitized);

  return crypto.createHash('sha256').update(`${toolName}:${canonicalJson}`).digest('hex');
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return '{' + entries.join(',') + '}';
}
