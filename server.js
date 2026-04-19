const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Pastikan folder uploads ada
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Setup multer untuk upload file
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ========== ENDPOINT SCAN JARINGAN ==========
app.get('/api/scan', (req, res) => {
  // Perintah untuk melihat daftar perangkat dalam jaringan (cross-platform)
  const cmd = process.platform === 'win32' 
    ? 'arp -a' 
    : 'arp -n | grep -v incomplete || arp -a | grep -v incomplete';
  
  exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
    if (error) {
      return res.json({ success: false, error: error.message, devices: [] });
    }
    
    // Parse output arp menjadi array device
    const devices = parseArpOutput(stdout);
    res.json({ success: true, devices });
  });
});

// Fungsi parsing output arp (sederhana)
function parseArpOutput(output) {
  const lines = output.split('\n');
  const devices = [];
  
  for (const line of lines) {
    // Format: 192.168.1.1   aa:bb:cc:dd:ee:ff   dynamic
    const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]{17})/i);
    if (match) {
      devices.push({
        ip: match[1],
        mac: match[2].toUpperCase(),
        status: 'active'
      });
    }
  }
  return devices;
}

// ========== ENDPOINT UPLOAD FILE ==========
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    originalName: req.file.originalname,
    size: req.file.size
  });
});

// ========== ENDPOINT LIST FILE ==========
app.get('/api/files', (req, res) => {
  fs.readdir('./uploads', (err, files) => {
    if (err) return res.json({ success: false, files: [] });
    
    const fileList = files.map(file => ({
      name: file,
      url: `/uploads/${file}`,
      size: fs.statSync(`./uploads/${file}`).size,
      modified: fs.statSync(`./uploads/${file}`).mtime
    }));
    res.json({ success: true, files: fileList });
  });
});

// ========== ENDPOINT DELETE FILE ==========
app.delete('/api/files/:filename', (req, res) => {
  const filepath = `./uploads/${req.params.filename}`;
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
  console.log(`📱 Buka dari HP: http://[IP-KOMPUTER]:${PORT}`);
  console.log(`📁 Folder upload: ./uploads/`);
});
