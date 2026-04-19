const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ========== UPLOAD KE 0X0.ST (GRATIS, TANPA API KEY) ==========
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Kirim ke 0x0.st
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer]), req.file.originalname);

    const response = await fetch('https://0x0.st', {
      method: 'POST',
      body: formData
    });

    const result = await response.text();
    
    if (response.ok && result.startsWith('https://')) {
      res.json({
        success: true,
        url: result.trim(),
        originalName: req.file.originalname,
        size: req.file.size
      });
    } else {
      res.status(400).json({ success: false, error: result || 'Upload failed' });
    }

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== LIST FILE (TIDAK BISA, JADI KOSONG SAJA) ==========
app.get('/api/files', (req, res) => {
  res.json({ success: true, files: [] });
});

module.exports = app;
