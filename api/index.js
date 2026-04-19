
const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ========== TOKEN TELEGRAM LO ==========
const TELEGRAM_BOT_TOKEN = '8675408721:AAFNmUMRkfJYgDFmdLVJE1tHdFaGdiW4LX8';
const TELEGRAM_CHAT_ID = '8182530431';

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file' });
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

    if (result.ok) {
      const fileId = result.result.document.file_id;
      
      const fileInfo = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileInfo.json();
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
      
      res.json({
        success: true,
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size
      });
    } else {
      res.status(400).json({ error: 'Telegram API error' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
