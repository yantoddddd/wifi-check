const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== KONFIGURASI TELEGRAM ==========
const TELEGRAM_BOT_TOKEN = '8622926718:AAFgjPx774euFGn3NFdekbMfF9NyJgBNUWs';
const TELEGRAM_CHAT_ID = '-5260518165';

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

// ========== CEK TIPE FILE ==========
function getFileType(filename) {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  
  const imageExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];
  const videoExt = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
  const audioExt = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
  const pdfExt = ['.pdf'];
  const textExt = ['.txt', '.js', '.json', '.html', '.css', '.xml', '.md', '.py', '.java', '.c', '.cpp', '.php', '.rb', '.go', '.rs', '.sh', '.bat', '.ini', '.cfg', '.conf', '.log', '.csv'];
  
  if (imageExt.includes(ext)) return 'image';
  if (videoExt.includes(ext)) return 'video';
  if (audioExt.includes(ext)) return 'audio';
  if (pdfExt.includes(ext)) return 'pdf';
  if (textExt.includes(ext)) return 'text';
  return 'other';
}

// ========== AMBIL ISI FILE TEKS ==========
async function getTextContent(telegramUrl) {
  try {
    const response = await fetch(telegramUrl);
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 50000) {
      return text.substring(0, 50000) + '\n\n... (file terlalu besar, hanya 50.000 karakter pertama yang ditampilkan)';
    }
    return text;
  } catch (error) {
    console.error('Gagal ambil isi file teks:', error);
    return null;
  }
}

// ========== AMBIL BASE64 UNTUK GAMBAR ==========
async function getImageBase64(telegramUrl) {
  try {
    const response = await fetch(telegramUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Gagal ambil gambar:', error);
    return null;
  }
}

// ========== ENDPOINT UPLOAD DARI WEB ==========
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log('Upload dari web');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

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
      uploadedAt: new Date().toISOString(),
      mimeType: req.file.mimetype
    });
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      url: `${baseUrl}/f/${randomId}`,
      id: randomId,
      name: req.file.originalname
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== WEBHOOK TELEGRAM ==========
app.post(`/bot${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  console.log('Webhook Telegram:', req.body);
  
  try {
    const message = req.body.message;
    if (!message) {
      return res.sendStatus(200);
    }
    
    const chatId = message.chat.id;
    const text = message.text || '';
    
    if (text === '/start') {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Kirim file (gambar, video, dokumen) ke bot ini, nanti akan saya kasih link download.'
        })
      });
      return res.sendStatus(200);
    }
    
    // Kalo user kirim file/document
    if (message.document || message.video || message.photo || message.audio) {
      let fileId = null;
      let fileName = 'file';
      let mimeType = 'application/octet-stream';
      
      if (message.document) {
        fileId = message.document.file_id;
        fileName = message.document.file_name || 'document';
        mimeType = message.document.mime_type || 'application/octet-stream';
      } else if (message.video) {
        fileId = message.video.file_id;
        fileName = message.video.file_name || 'video.mp4';
        mimeType = message.video.mime_type || 'video/mp4';
      } else if (message.photo) {
        fileId = message.photo[message.photo.length - 1].file_id;
        fileName = 'photo.jpg';
        mimeType = 'image/jpeg';
      } else if (message.audio) {
        fileId = message.audio.file_id;
        fileName = message.audio.file_name || 'audio.mp3';
        mimeType = message.audio.mime_type || 'audio/mpeg';
      }
      
      // Dapatkan URL file dari Telegram
      const fileInfo = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileInfo.json();
      const telegramUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
      
      // Dapatkan ukuran file (opsional, pake HEAD request)
      let fileSize = 0;
      try {
        const headRes = await fetch(telegramUrl, { method: 'HEAD' });
        fileSize = parseInt(headRes.headers.get('content-length') || '0');
      } catch (e) {}
      
      const randomId = crypto.randomBytes(8).toString('hex');
      const baseUrl = `https://${req.get('host')}`;
      
      fileStore.set(randomId, {
        telegramUrl: telegramUrl,
        name: fileName,
        size: fileSize,
        uploadedAt: new Date().toISOString(),
        mimeType: mimeType
      });
      
      const shortUrl = `${baseUrl}/f/${randomId}`;
      
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `File berhasil diupload!\n\nLink: ${shortUrl}\n\nNama: ${fileName}\nUkuran: ${(fileSize/1024).toFixed(2)} KB`
        })
      });
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(200);
  }
});

// ========== ENDPOINT WEB VIEW (PREVIEW TANPA VIDEO) ==========
app.get('/f/:id', async (req, res) => {
  const id = req.params.id;
  console.log(`Looking for file ID: ${id}`);
  
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
          <h1>File Tidak Ditemukan</h1>
          <p>ID: <code>${escapeHtml(id)}</code></p>
          <a href="/">Kembali</a>
        </div>
      </body>
      </html>
    `);
  }
  
  const fileType = getFileType(file.name);
  
  // Preview: video TIDAK ditampilkan, yang lain tetap
  let previewHtml = '';
  
  if (fileType === 'text') {
    const content = await getTextContent(file.telegramUrl);
    if (content) {
      previewHtml = `<pre>${escapeHtml(content)}</pre>`;
    }
  } else if (fileType === 'image') {
    const base64 = await getImageBase64(file.telegramUrl);
    if (base64) {
      previewHtml = `<img src="${base64}" alt="preview">`;
    }
  } else if (fileType === 'audio') {
    previewHtml = `<audio controls src="${file.telegramUrl}"></audio>`;
  } else if (fileType === 'pdf') {
    previewHtml = `<iframe src="${file.telegramUrl}"></iframe>`;
  } else if (fileType === 'video') {
    // VIDEO: PREVIEW DIHAPUS, cuma pesan
    previewHtml = `<div style="color:#64748b; text-align:center;"><i class="fas fa-film" style="font-size:2rem; margin-bottom:10px; display:block;"></i> Preview video tidak tersedia. Silakan download untuk melihat.</div>`;
  } else {
    previewHtml = `<div style="color:#64748b; text-align:center;"><i class="fas fa-file" style="font-size:2rem; margin-bottom:10px; display:block;"></i> Preview tidak tersedia untuk file ini</div>`;
  }
  
  let fileIcon = 'fa-file';
  if (fileType === 'image') fileIcon = 'fa-image';
  else if (fileType === 'video') fileIcon = 'fa-film';
  else if (fileType === 'audio') fileIcon = 'fa-music';
  else if (fileType === 'pdf') fileIcon = 'fa-file-pdf';
  else if (fileType === 'text') fileIcon = 'fa-file-code';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(file.name)} - FileShare</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: linear-gradient(135deg, #0f172a, #1e1b4b);
          font-family: system-ui, -apple-system, sans-serif;
          color: white;
          min-height: 100vh;
          padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: rgba(15,23,42,0.8);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          margin-bottom: 20px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .file-info {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.9rem;
          color: #e2e8f0;
          word-break: break-all;
        }
        .file-info i { color: #60a5fa; font-size: 1rem; }
        .download-btn {
          background: #3b82f6;
          border: none;
          padding: 8px 16px;
          border-radius: 10px;
          color: white;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          transition: 0.2s;
        }
        .download-btn:hover { background: #2563eb; }
        .preview-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 60vh;
          background: rgba(0,0,0,0.3);
          border-radius: 20px;
          padding: 30px;
        }
        .preview-content { max-width: 100%; text-align: center; }
        pre {
          background: #020617;
          padding: 20px;
          border-radius: 16px;
          font-family: monospace;
          font-size: 0.75rem;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
          color: #e2e8f0;
          max-height: 500px;
          overflow-y: auto;
          text-align: left;
          max-width: 100%;
        }
        img, audio, iframe {
          max-width: 100%;
          max-height: 70vh;
          border-radius: 12px;
        }
        iframe { width: 100%; height: 70vh; border: none; }
        .meta {
          text-align: center;
          color: #64748b;
          font-size: 0.7rem;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="file-info">
            <i class="fas ${fileIcon}"></i>
            <span>${escapeHtml(file.name)}</span>
            <span style="font-size:0.7rem; color:#64748b;">${(file.size / 1024).toFixed(2)} KB</span>
          </div>
          <a href="${file.telegramUrl}" class="download-btn" download>
            <i class="fas fa-download"></i> Download
          </a>
        </div>
        
        <div class="preview-container">
          <div class="preview-content">
            ${previewHtml}
          </div>
        </div>
        
        <div class="meta">
          <i class="far fa-clock"></i> ${new Date(file.uploadedAt).toLocaleString('id-ID')}
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

// ========== SETUP WEBHOOK TELEGRAM ==========
app.get('/api/setwebhook', async (req, res) => {
  const baseUrl = `https://${req.get('host')}`;
  const webhookUrl = `${baseUrl}/bot${TELEGRAM_BOT_TOKEN}`;
  
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
  const result = await response.json();
  
  res.json(result);
});

module.exports = app;
