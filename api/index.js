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

// ========== ENDPOINT REDIRECT (LIHAT FILE) ==========
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
          <p>ID: <code>${id}</code></p>
          <p>File mungkin sudah kadaluarsa atau server baru saja di-deploy ulang.</p>
          <a href="/">← Kembali ke halaman utama</a>
        </div>
      </body>
      </html>
    `);
  }
  
  console.log(`✅ Redirecting ${id} → ${file.telegramUrl}`);
  // Redirect ke URL Telegram
  res.redirect(file.telegramUrl);
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
