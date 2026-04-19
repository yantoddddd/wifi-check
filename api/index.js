const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const TELEGRAM_BOT_TOKEN = '8675408721:AAFNmUMRkfJYgDFmdLVJE1tHdFaGdiW4LX8';
const TELEGRAM_CHAT_ID = '8182530431';

// ========== SIMPAN MAPPING FILE DI MEMORY ==========
const fileStore = new Map(); // key: randomId, value: {telegramUrl, name, size}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file' });
    }

    // Kirim ke Telegram
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('document', new Blob([req.file.buffer]), req.file.originalname);

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.ok) {
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
      
      // Kirim balik link pake domain web lo
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        success: true,
        url: `${baseUrl}/f/${randomId}`,
        id: randomId
      });
    } else {
      res.status(400).json({ error: 'Telegram API error' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== ENDPOINT REDIRECT ==========
app.get('/f/:id', (req, res) => {
  const file = fileStore.get(req.params.id);
  if (!file) {
    return res.status(404).send('File not found');
  }
  // Redirect ke URL Telegram
  res.redirect(file.telegramUrl);
});

// ========== LIST FILE ==========
app.get('/api/files', (req, res) => {
  const files = Array.from(fileStore.entries()).map(([id, file]) => ({
    id: id,
    name: file.name,
    size: file.size,
    uploadedAt: file.uploadedAt
  }));
  res.json(files);
});

module.exports = app;
