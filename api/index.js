const express = require('express');
const multer = require('multer');
const { put, list, del } = require('@vercel/blob');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ========== UPLOAD FILE KE VERCEl BLOB ==========
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filename = `${Date.now()}-${req.file.originalname}`;
    const blob = await put(filename, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype
    });

    res.json({
      success: true,
      url: blob.url,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== LIST FILE ==========
app.get('/api/files', async (req, res) => {
  try {
    const blobs = await list();
    const files = blobs.blobs.map(blob => ({
      name: blob.pathname,
      url: blob.url,
      size: blob.size,
      uploadedAt: blob.uploadedAt
    }));
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== DELETE FILE ==========
app.delete('/api/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    await del(filename);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app;
