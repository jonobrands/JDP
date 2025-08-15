require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Log storage status
console.log('Starting server with in-memory storage');
console.log('Database functionality has been disabled');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ---------------------------------------------------------------------------
// Snapshot storage (file-backed)
// ---------------------------------------------------------------------------
const { randomUUID } = require('crypto');
const SNAP_DIR = path.join(__dirname, '../../data/snapshots');
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
ensureDir(SNAP_DIR);

function listSnapshots() {
  ensureDir(SNAP_DIR);
  const files = fs.readdirSync(SNAP_DIR).filter(f => f.endsWith('.json'));
  const items = [];
  for (const f of files) {
    try {
      const full = path.join(SNAP_DIR, f);
      const text = fs.readFileSync(full, 'utf8');
      const snap = JSON.parse(text);
      items.push({
        id: snap.id || path.basename(f, '.json'),
        name: snap.name || path.basename(f, '.json'),
        createdAt: snap.createdAt || new Date(fs.statSync(full).mtimeMs).toISOString(),
        createdBy: snap.createdBy || 'unknown',
        appVersion: snap.appVersion,
        schemaVersion: snap.schemaVersion,
        sizeBytes: Buffer.byteLength(text, 'utf8'),
      });
    } catch (_) { /* ignore bad file */ }
  }
  // newest first
  items.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

// UID Registry storage (file-backed)
const STORE_FILE = path.join(__dirname, '../../uids.json');
function loadMap() {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}
function saveMap(obj) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(obj || {}, null, 2), 'utf8');
}

// Helper: resolve UIDs for rows (same logic as /uids/resolve)
function resolveRows(rows) {
  if (!Array.isArray(rows)) return rows || [];
  const uidRegex = /\[(UID-[^\]]+?)\]/i; // e.g., [UID-0001-MAST]
  const extract = (s) => {
    if (!s || typeof s !== 'string') return '';
    const m = s.match(uidRegex);
    return m ? m[1] : '';
  };
  const normalize = (s) => (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const registry = loadMap() || {};
  return rows.map((r) => {
    const row = { ...r };
    const hasPair = row.mast_uid || row.MAST_UID || row.master_uid || row.MASTER_UID || row.pair_uid || row.pairUID || row.uid || row.UID || row.id;

    // 1) Try tokens embedded in strings
    if (!hasPair) {
      const fromClient = extract(row.client);
      const fromCare = extract(row.caregiver);
      const mastToken = [fromClient, fromCare].find(t => /-MAST$/i.test(t));
      if (mastToken) {
        row.mast_uid = mastToken;
      } else {
        if (fromClient) row.client_mast_uid = fromClient;
        if (fromCare) row.caregiver_mast_uid = fromCare;
      }
    }

    // 2) Use registry map by normalized names
    try {
      const cKey = `client:${normalize(row.client)}`;
      const gKey = `caregiver:${normalize(row.caregiver)}`;
      const regClient = registry[cKey];
      const regCare = registry[gKey];
      if (regClient && !row.clientUID) {
        row.clientUID = regClient;
        if (/^-?uid-.*-mast$/i.test(regClient) || /UID-.*-MAST$/i.test(regClient)) {
          row.client_mast_uid = regClient;
        }
      }
      if (regCare && !row.caregiverUID) {
        row.caregiverUID = regCare;
        if (/^-?uid-.*-mast$/i.test(regCare) || /UID-.*-MAST$/i.test(regCare)) {
          row.caregiver_mast_uid = regCare;
        }
      }
    } catch (_) {
      // ignore registry errors
    }

    return row;
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes - Disabled database-dependent routes
app.use('/api/auth', (req, res) => {
  res.status(503).json({ 
    status: 'error', 
    message: 'Authentication is currently disabled' 
  });
});

app.use('/api/cases', (req, res) => {
  res.status(503).json({ 
    status: 'error', 
    message: 'Case management is currently disabled' 
  });
});

app.use('/api/sessions', (req, res) => {
  res.status(503).json({ 
    status: 'error', 
    message: 'Session management is currently disabled' 
  });
});

// ---------------------------------------------------------------------------
// Snapshot CRUD API
// ---------------------------------------------------------------------------
app.get('/api/snapshots', (req, res) => {
  try {
    const items = listSnapshots();
    res.json({ snapshots: items });
  } catch (e) {
    console.error('List snapshots error:', e);
    res.status(500).json({ error: 'list_failed' });
  }
});

app.post('/api/snapshots', (req, res) => {
  try {
    const body = req.body || {};
    const incoming = body.snapshot || body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'invalid_snapshot' });
    }
    ensureDir(SNAP_DIR);
    const id = (incoming.id && String(incoming.id)) || randomUUID();
    const name = body.name || incoming.name || id;
    const final = { ...incoming, id, name };
    const file = path.join(SNAP_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(final, null, 2), 'utf8');
    res.json({ ok: true, id });
  } catch (e) {
    console.error('Save snapshot error:', e);
    res.status(500).json({ error: 'save_failed' });
  }
});

app.get('/api/snapshots/:id', (req, res) => {
  try {
    const id = req.params.id;
    const file = path.join(SNAP_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json(snap);
  } catch (e) {
    console.error('Get snapshot error:', e);
    res.status(500).json({ error: 'get_failed' });
  }
});

app.delete('/api/snapshots/:id', (req, res) => {
  try {
    const id = req.params.id;
    const file = path.join(SNAP_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
    fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete snapshot error:', e);
    res.status(500).json({ error: 'delete_failed' });
  }
});

// UID Registry endpoints
app.get('/uids', (req, res) => {
  res.json(loadMap());
});

app.post('/uids', (req, res) => {
  const body = req.body;
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body must be a JSON object (the map).' });
  }
  saveMap(body || {});
  res.sendStatus(200);
});

// Resolve UIDs for incoming rows
app.post('/uids/resolve', (req, res) => {
  try {
    const { rows } = req.body || {};
    const resolved = resolveRows(rows || []);
    return res.json(resolved);
  } catch (e) {
    console.error('UID resolve error:', e);
    return res.status(500).json({ error: 'resolve_failed', message: String((e && e.message) || e) });
  }
});

// Corrections (stub) to satisfy legacy frontend calls
app.get('/corrections', (req, res) => {
  return res.json([]);
});
app.post('/corrections', (req, res) => {
  return res.json({ ok: true });
});

// Root and health endpoints for convenience
app.get('/', (req, res) => {
  res.type('application/json').send({ status: 'ok', service: 'CaseConWeb backend', time: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// JOVIE Processing Endpoint
app.post('/process_jovie', express.json(), (req, res) => {
  try {
    const { jovie_text } = req.body;
    
    if (!jovie_text) {
      return res.status(400).json({ error: 'No JOVIE text provided' });
    }

    const lines = jovie_text.split('\n').map(line => line.trim());
    const rows = [];
    let currentEntry = null;
    let currentDate = "";
    let entryLine = 0;

    // Helper to finalize the current entry
    const finalizeEntry = () => {
      if (currentEntry && currentEntry.client) {
        // Only add if we have at least client and caregiver
        if (currentEntry.caregiver) {
          rows.push(currentEntry);
        }
      }
      currentEntry = null;
      entryLine = 0;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines at the start
      if (!line && !currentEntry && rows.length === 0) continue;
      
      // Check for date line (e.g., "Mon, Aug, 11th")
      if (line.match(/^[A-Za-z]+,\s+[A-Za-z]+,\s*\d+[a-z]{2}$/)) {
        finalizeEntry();
        currentDate = line;
        continue;
      }

      // If line is empty, finalize current entry
      if (!line) {
        finalizeEntry();
        continue;
      }

      // Start a new entry
      if (!currentEntry) {
        currentEntry = {
          client: line,
          date: currentDate,
          timeRange: "",
          type: "",
          status: ""
        };
        entryLine = 1;
      } 
      // Process entry lines
      else {
        if (entryLine === 1) {
          // Caregiver name (second line)
          currentEntry.caregiver = line;
          entryLine++;
        } else if (entryLine === 2) {
          // Time range (third line)
          currentEntry.timeRange = line;
          entryLine++;
        } else if (entryLine === 3) {
          // Type (fourth line)
          currentEntry.type = line;
          entryLine++;
          
          // Check if next line is a status (single word)
          if (i + 1 < lines.length && lines[i + 1] && 
              !lines[i + 1].match(/^[A-Za-z]+,\s+[A-Za-z]+,\s*\d+[a-z]{2}$/) &&
              lines[i + 1].split(' ').length <= 2) {
            currentEntry.status = lines[++i];
          }
          
          // Finalize this entry
          finalizeEntry();
        }
      }
    }

    // Add the last entry if it exists
    finalizeEntry();

    // Enrich with UIDs and sort rows by client name
    const enriched = resolveRows(rows);
    enriched.sort((a, b) => a.client.localeCompare(b.client));

    res.json({
      success: true,
      rows: enriched,
      count: enriched.length,
      date: currentDate || new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error processing JOVIE:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process JOVIE data',
      details: error.message
    });
  }
});

// BUCA Processing Endpoint - Matches legacy format
app.post('/process_buca', express.json(), (req, res) => {
  try {
    const { buca_text } = req.body;
    
    if (!buca_text) {
      return res.status(400).json({
        success: false,
        error: 'No BUCA text provided'
      });
    }

    const lines = buca_text.split('\n').map(line => line.trim());
    const rows = [];
    const invalidLines = [];

    // Helper function to clean strings
    const cleanString = (str) => {
      if (!str) return '';
      return str.replace(/\s+/g, ' ').trim();
    };

    // Check if line matches expected BUCA format
    const isValidBucaFormat = (line) => {
      // Expected format: ClientName00X-XXXX-XXXXDate: MM/DD/YYYY ESTCaregiver: Name
      const pattern = /^.+?(?:00[\w-]+|CAS-\d{8}-[\w-]+)Date: \d{1,2}\/\d{1,2}\/\d{4}\s*ESTCaregiver: .+$/;
      return pattern.test(line);
    };

    // Parse a single BUCA line
    const parseBucaLegacyLine = (line, lineNum) => {
      if (!line) {
        return {
          isValid: false,
          errors: ['Empty line']
        };
      }

      if (!isValidBucaFormat(line)) {
        return {
          isValid: false,
          errors: ['Invalid BUCA format']
        };
      }

      // Extract components
      let clientName = '';
      let caseNumber = '';
      let date = '';
      let caregiver = '';

      // Extract case number (starts with 00 or CAS)
      const caseMatch = line.match(/((?:00|CAS)[^\s]+)/);
      if (caseMatch) {
        caseNumber = cleanString(caseMatch[1]);
        // Client name is everything before the case number
        clientName = cleanString(line.substring(0, caseMatch.index));
      }

      // Extract date
      const dateMatch = line.match(/Date: (\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) {
        date = dateMatch[1];
      }

      // Extract caregiver (after "Caregiver:")
      const cgMatch = line.match(/Caregiver:\s*(.+?)(?=\s*$)/i);
      if (cgMatch) {
        caregiver = cleanString(cgMatch[1]);
      }

      return {
        isValid: true,
        data: {
          client: clientName,
          caseNumber,
          date,
          caregiver,
          raw: line,
          lineNumber: lineNum + 1 // 1-based line numbers
        }
      };
    };

    // Process each line
    lines.forEach((line, index) => {
      if (!line) return; // Skip empty lines

      const result = parseBucaLegacyLine(line, index);
      if (result.isValid) {
        rows.push(result.data);
      } else {
        invalidLines.push({
          line: index + 1,
          content: line,
          errors: result.errors
        });
      }
    });

    // Enrich with UIDs and sort rows by client name
    const enriched = resolveRows(rows);
    enriched.sort((a, b) => a.client.localeCompare(b.client));

    return res.json({
      success: true,
      rows: enriched,
      count: enriched.length,
      invalidLines,
      hasErrors: invalidLines.length > 0
    });
    
  } catch (error) {
    console.error('Error processing BUCA data:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process BUCA data',
      error: error.message
    });
  }
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('API endpoints are running with limited functionality');
});

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(`Port ${PORT} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`Port ${PORT} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Handle graceful shutdown
const shutdown = () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server has been stopped');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
