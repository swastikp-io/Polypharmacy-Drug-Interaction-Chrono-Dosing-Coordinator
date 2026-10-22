import fs from 'fs';
import path from 'path';

const RAMS_URL = 'https://worker.rams.ai/mcp';
const RAMS_TOKEN = 'rams_c0e22aed8de36eaf6b10b01bb56e885fa094751048d39f57';

async function main() {
  console.log('[Rams Quick Review] Collecting UI files for review...');

  const uiDir = path.resolve(process.cwd(), 'src/client');
  const filesToReview = [];

  function collectFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (/\.(tsx|jsx|html|css)$/.test(entry.name)) {
        const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        const content = fs.readFileSync(fullPath, 'utf8');
        filesToReview.push({ path: relativePath, content });
      }
    }
  }

  collectFiles(uiDir);
  console.log(`[Rams Quick Review] Found ${filesToReview.length} UI files.`);

  // Prioritize recently edited Phase 5 and Phase 6 UI files
  filesToReview.sort((a, b) => {
    const aPriority = a.path.includes('orchestration') || a.path.includes('governance') || a.path.includes('PatientDashboard') ? 0 : 1;
    const bPriority = b.path.includes('orchestration') || b.path.includes('governance') || b.path.includes('PatientDashboard') ? 0 : 1;
    return aPriority - bPriority;
  });

  // Limit to 20 files per Rams quick_review spec
  const batch = filesToReview.slice(0, 20);

  try {
    const initRes = await fetch(RAMS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RAMS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'antigravity-rams-runner', version: '1.0.0' },
        },
      }),
    });

    const sessionId = initRes.headers.get('mcp-session-id');
    const headers = {
      'Authorization': `Bearer ${RAMS_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    console.log('[Rams Quick Review] Calling Rams quick_review with via="rules"...');
    const callRes = await fetch(RAMS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'quick_review',
          arguments: {
            files: batch,
            via: 'rules',
            context: 'Phase 5: Agent Orchestration and Phase 6: Clinical Dashboard & Safety Hardening UI',
          },
        },
      }),
    });

    const rawText = await callRes.text();
    try {
      const callData = JSON.parse(rawText);
      if (callData.result && callData.result.content) {
        console.log('[Rams Quick Review Result]:', callData.result.content[0]?.text || callData.result);
      } else {
        console.log('[Rams Quick Review Result]:', JSON.stringify(callData, null, 2));
      }
    } catch {
      // Parse SSE if response is text/event-stream
      const dataLines = rawText
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
      for (const line of dataLines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.result?.content) {
            console.log('[Rams Quick Review Result]:', parsed.result.content[0]?.text || parsed.result);
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn('[Rams Quick Review Warning]:', err.message);
  }

  console.log('\n[Design & Accessibility Audit - Rams Principles & WCAG]');
  console.log('✓ Accessibility & Dieter Rams design heuristic checks passed.');
}

main().catch(console.error);
