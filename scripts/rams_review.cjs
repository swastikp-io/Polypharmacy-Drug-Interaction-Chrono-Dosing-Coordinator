const fs = require('fs');

async function runQuickReview(filePaths) {
  const files = filePaths.map(p => ({
    path: p.replace(/\\/g, '/'),
    content: fs.readFileSync(p, 'utf8')
  }));

  const res = await fetch('https://worker.rams.ai/mcp', {
    headers: {
      'Authorization': 'Bearer rams_c0e22aed8de36eaf6b10b01bb56e885fa094751048d39f57',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'quick_review',
        arguments: {
          via: 'rules',
          files: files
        }
      },
      id: Date.now()
    })
  });

  const raw = await res.text();
  console.log('RAMS RESPONSE RAW:\n', raw);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node scripts/rams_review.cjs <file1> <file2> ...");
} else {
  runQuickReview(args).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
