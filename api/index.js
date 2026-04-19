const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ========== KONFIGURASI TELEGRAM ==========
const TELEGRAM_BOT_TOKEN = '8675408721:AAFNmUMRkfJYgDFmdLVJE1tHdFaGdiW4LX8';
const TELEGRAM_CHAT_ID = '8182530431';

// ========== SIMPAN MAPPING FILE DI MEMORY ==========
const fileStore = new Map();

// ========== HELPER ESCAPE HTML ==========
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== CEK APAKAH FILE TEKS ==========
function isTextFile(filename) {
  const textExtensions = ['.txt', '.js', '.json', '.html', '.css', '.xml', '.md', '.py', '.java', '.c', '.cpp', '.php', '.rb', '.go', '.rs', '.sh', '.bat', '.ini', '.cfg', '.conf', '.log', '.csv'];
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return textExtensions.includes(ext);
}

// ========== AMBIL ISI FILE DARI TELEGRAM ==========
async function getFileContent(telegramUrl) {
  try {
    const response = await fetch(telegramUrl);
    if (!response.ok) return null;
    const text = await response.text();
    // Batasi preview maksimal 10.000 karakter
    if (text.length > 10000) {
      return text.substring(0, 10000) + '\n\n... (file terlalu besar, hanya 10.000 karakter pertama yang ditampilkan)';
    }
    return text;
  } catch (error) {
    console.error('Gagal ambil isi file:', error);
    return null;
  }
}

// ========== ENDPOINT UPLOAD ==========
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log('📤 Received upload request');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Kirim file ke Telegram
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('document', new Blob([req.file.buffer]), req.file.originalname);

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!result.ok) {
      return res.status(400).json({ error: 'Telegram API error: ' + result.description });
    }

    const fileId = result.result.document.file_id;
    
    const fileInfo = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileInfo.json();
    const telegramUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
    
    const randomId = crypto.randomBytes(8).toString('hex');
    
    fileStore.set(randomId, {
      telegramUrl: telegramUrl,
      name: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    });
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      url: `${baseUrl}/f/${randomId}`,
      id: randomId,
      name: req.file.originalname
    });
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ENDPOINT WEB VIEW (DENGAN PREVIEW ISI) ==========
app.get('/f/:id', async (req, res) => {
  const id = req.params.id;
  console.log(`🔍 Looking for file ID: ${id}`);
  
  const file = fileStore.get(id);
  
  if (!file) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>File Not Found</title>
        <style>
          body { font-family: system-ui; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2rem; border-radius: 1rem; text-align: center; }
          a { color: #60a5fa; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>❌ File Tidak Ditemukan</h1>
          <p>ID: <code>${escapeHtml(id)}</code></p>
          <a href="/">← Kembali</a>
        </div>
      </body>
      </html>
    `);
  }
  
  // Ambil isi file kalo dia file teks
  let fileContent = null;
  let isText = isTextFile(file.name);
  
  if (isText) {
    fileContent = await getFileContent(file.telegramUrl);
  }
  
  // Kirim halaman HTML web view dengan preview
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(file.name)} - FileShare</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: linear-gradient(135deg, #0f172a, #1e1b4b);
          font-family: system-ui, -apple-system, sans-serif;
          color: white;
          min-height: 100vh;
          padding: 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .card {
          background: rgba(15,23,42,0.8);
          backdrop-filter: blur(10px);
          border-radius: 24px;
          padding: 30px;
          border: 1px solid rgba(255,255,255,0.1);
          margin-bottom: 20px;
        }
        h1 { font-size: 1.5rem; margin-bottom: 10px; }
        .file-icon { font-size: 3rem; margin-bottom: 10px; }
        .file-name {
          background: #1e293b;
          padding: 12px;
          border-radius: 12px;
          font-family: monospace;
          word-break: break-all;
          margin: 15px 0;
        }
        .file-meta { color: #94a3b8; margin-bottom: 20px; font-size: 0.8rem; }
        .btn {
          background: #3b82f6;
          border: none;
          padding: 10px 20px;
          border-radius: 12px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin: 5px;
        }
        .btn:hover { background: #2563eb; }
        .btn-secondary { background: #334155; }
        .preview {
          background: #0f172a;
          border-radius: 16px;
          padding: 20px;
          margin-top: 20px;
          overflow-x: auto;
        }
        .preview h3 {
          margin-bottom: 15px;
          color: #60a5fa;
          font-size: 0.9rem;
        }
        pre {
          background: #020617;
          padding: 15px;
          border-radius: 12px;
          font-family: monospace;
          font-size: 0.75rem;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
          color: #e2e8f0;
          max-height: 500px;
          overflow-y: auto;
        }
        .badge {
          background: #10b981;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 0.6rem;
          margin-left: 10px;
        }
        footer {
          text-align: center;
          color: #475569;
          font-size: 0.7rem;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="file-icon">${file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : (isText ? '📝' : '📄')}</div>
          <h1>${escapeHtml(file.name)}${isText ? '<span class="badge">Preview Tersedia</span>' : ''}</h1>
          <div class="file-name">${escapeHtml(file.name)}</div>
          <div class="file-meta">
            📦 Ukuran: ${(file.size / 1024).toFixed(2)} KB<br>
            📅 Diupload: ${new Date(file.uploadedAt).toLocaleString('id-ID')}
          </div>
          <div>
            <a href="${file.telegramUrl}" class="btn" download>⬇️ Download File</a>
            <a href="/" class="btn btn-secondary">🏠 Upload Lagi</a>
          </div>
        </div>
        
        ${isText && fileContent ? `
        <div class="card">
          <div class="preview">
            <h3>📄 Preview Isi File</h3>
            <pre>${escapeHtml(fileContent)}</pre>
          </div>
        </div>
        ` : (isText && !fileContent ? `
        <div class="card">
          <div class="preview">
            <h3>⚠️ Gagal Memuat Preview</h3>
            <p style="color: #94a3b8;">Tidak bisa membaca isi file. Silakan download untuk melihat.</p>
          </div>
        </div>
        ` : '')}
        
        <footer>
          🔗 File tersimpan di Telegram | Link ini bersifat sementara
        </footer>
      </div>
    </body>
    </html>
  `);
});

// ========== ENDPOINT LIST FILE ==========
app.get('/api/files', (req, res) => {
  const files = Array.from(fileStore.entries()).map(([id, file]) => ({
    id: id,
    name: file.name,
    size: file.size,
    uploadedAt: file.uploadedAt
  }));
  res.json(files);
});

// ========== ENDPOINT DELETE FILE ==========
app.delete('/api/file/:id', (req, res) => {
  const id = req.params.id;
  const deleted = fileStore.delete(id);
  res.json({ success: deleted });
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', files: fileStore.size });
});

module.exports = app;
