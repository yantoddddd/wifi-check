const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3000;

// Buat folder uploads kalo belum ada
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Setup multer
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

// ========== 1. SCAN PENGGUNA WIFI ==========
app.get('/api/scan', (req, res) => {
  // Dapetin IP lokal server (buat nentuin range jaringan)
  const networkInfo = getLocalNetwork();
  
  // Perintah scan ARP (cross-platform)
  let cmd = '';
  if (process.platform === 'win32') {
    cmd = 'arp -a';
  } else {
    cmd = 'arp -n | grep -v incomplete || arp -a | grep -v incomplete';
  }
  
  exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
    if (error) {
      return res.json({ success: false, error: error.message, devices: [] });
    }
    
    const devices = parseArpOutput(stdout);
    res.json({ 
      success: true, 
      devices,
      serverIp: networkInfo.ip,
      serverMac: networkInfo.mac
    });
  });
});

// Fungsi dapetin IP & MAC server
function getLocalNetwork() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return {
          ip: iface.address,
          mac: iface.mac,
          interface: name
        };
      }
    }
  }
  return { ip: 'unknown', mac: 'unknown' };
}

// Parsing output ARP
function parseArpOutput(output) {
  const lines = output.split('\n');
  const devices = [];
  
  for (const line of lines) {
    // Format: 192.168.1.1   aa:bb:cc:dd:ee:ff   dynamic
    const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]{17})/i);
    if (match && !match[1].startsWith('224.') && !match[1].startsWith('239.')) {
      devices.push({
        ip: match[1],
        mac: match[2].toUpperCase(),
        status: 'active'
      });
    }
  }
  return devices;
}

// ========== 2. TRANSFER FILE ==========
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

app.get('/api/files', (req, res) => {
  fs.readdir('./uploads', (err, files) => {
    if (err) return res.json({ success: false, files: [] });
    
    const fileList = files.map(file => {
      const stat = fs.statSync(`./uploads/${file}`);
      return {
        name: file,
        url: `/uploads/${file}`,
        size: stat.size,
        modified: stat.mtime
      };
    });
    res.json({ success: true, files: fileList });
  });
});

app.delete('/api/files/:filename', (req, res) => {
  const filepath = `./uploads/${req.params.filename}`;
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  const network = getLocalNetwork();
  console.log(`
✅ Server berjalan di:
   http://localhost:${PORT}
   http://${network.ip}:${PORT}
   
📱 Buka dari HP/device lain dalam WiFi yang sama:
   http://${network.ip}:${PORT}
   
📁 Folder upload: ./uploads/
  `);
});
