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
const fileStore = new Map(); // key: randomId, value: {telegramUrl, name, size, uploadedAt}

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

// ========== ENDPOINT UPLOAD ==========
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log('📤 Received upload request');
  
  try {
    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📁 File: ${req.file.originalname}, Size: ${req.file.size} bytes`);

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
      console.log('❌ Telegram API error:', result);
      return res.status(400).json({ error: 'Telegram API error: ' + result.description });
    }

    console.log('✅ File sent to Telegram');

    const fileId = result.result.document.file_id;
    
    // Dapetin URL asli dari Telegram
    const fileInfo = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileInfo.json();
    const telegramUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
    
    // Bikin ID acak buat link
    const randomId = crypto.randomBytes(8).toString('hex');
    
    // Simpan mapping
    fileStore.set(randomId, {
      telegramUrl: telegramUrl,
      name: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    });
    
    console.log(`📦 File stored with ID: ${randomId}`);
    console.log(`📊 Total files in store: ${fileStore.size}`);
    
    // Kirim balik link pake domain web lo
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

// ========== ENDPOINT WEB VIEW (BUKAN REDIRECT) ==========
app.get('/f/:id', (req, res) => {
  const id = req.params.id;
  console.log(`🔍 Looking for file ID: ${id}`);
  console.log(`📦 Current fileStore size: ${fileStore.size}`);
  
  // Log semua ID yang ada (buat debugging)
  if (fileStore.size > 0) {
    console.log('📋 Available IDs:', Array.from(fileStore.keys()).join(', '));
  }
  
  const file = fileStore.get(id);
  
  if (!file) {
    console.log(`❌ File ID ${id} not found`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>File Not Found - FileShare</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: linear-gradient(135deg, #0f172a, #1e1b4b);
            font-family: system-ui, -apple-system, sans-serif;
            color: white;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }
          .card {
            background: rgba(15,23,42,0.8);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
          }
          .file-icon { font-size: 4rem; margin-bottom: 20px; }
          h1 { margin-bottom: 10px; }
          code {
            background: #1e293b;
            padding: 4px 8px;
            border-radius: 8px;
            font-family: monospace;
          }
          a {
            color: #60a5fa;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
          }
          .btn {
            background: #3b82f6;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            color: white;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
          }
          .btn:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="file-icon">❌</div>
          <h1>File Tidak Ditemukan</h1>
          <p>ID: <code>${escapeHtml(id)}</code></p>
          <p>File mungkin sudah kadaluarsa atau server baru saja di-deploy ulang.</p>
          <a href="/" class="btn">← Kembali ke Halaman Utama</a>
        </div>
      </body>
      </html>
    `);
  }
  
  console.log(`✅ Serving web view for ${id} → ${file.telegramUrl}`);
  
  // Kirim halaman HTML web view
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
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .card {
          background: rgba(15,23,42,0.8);
          backdrop-filter: blur(10px);
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
          border: 1px solid rgba(255,255,255,0.1);
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .file-icon {
          font-size: 4rem;
          margin-bottom: 20px;
        }
        h2 {
          margin-bottom: 10px;
          font-size: 1.5rem;
        }
        .file-name {
          font-size: 1rem;
          font-weight: 500;
          word-break: break-all;
          background: #1e293b;
          padding: 12px;
          border-radius: 12px;
          margin: 20px 0;
          font-family: monospace;
        }
        .file-meta {
          color: #94a3b8;
          margin-bottom: 30px;
          font-size: 0.8rem;
          line-height: 1.6;
        }
        .btn-group {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn {
          background: #3b82f6;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          color: white;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .btn:hover {
          background: #2563eb;
          transform: translateY(-1px);
        }
        .btn-secondary {
          background: #334155;
        }
        .btn-secondary:hover {
          background: #475569;
        }
        .footer {
          margin-top: 30px;
          font-size: 0.65rem;
          color: #475569;
        }
        .footer a {
          color: #64748b;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="file-icon">
          ${file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : '📄'}
        </div>
        <h2>File Siap Didownload</h2>
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-meta">
          📦 Ukuran: ${(file.size / 1024).toFixed(2)} KB<br>
          📅 Diupload: ${new Date(file.uploadedAt).toLocaleString('id-ID')}
        </div>
        <div class="btn-group">
          <a href="${file.telegramUrl}" class="btn" download>
            ⬇️ Download File
          </a>
          <a href="/" class="btn btn-secondary">
            🏠 Upload Lagi
          </a>
        </div>
        <div class="footer">
          🔗 Link ini bersifat sementara dan akan kadaluarsa jika server di-deploy ulang
        </div>
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
  console.log(`📋 Returning ${files.length} files`);
  res.json(files);
});

// ========== ENDPOINT DELETE FILE ==========
app.delete('/api/file/:id', (req, res) => {
  const id = req.params.id;
  const deleted = fileStore.delete(id);
  console.log(`🗑️ Delete ${id}: ${deleted ? 'success' : 'not found'}`);
  res.json({ success: deleted });
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    files: fileStore.size,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
