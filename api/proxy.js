const axios = require('axios');

// Konfigurasi API JasaOTP
const API_BASE = 'https://api.jasaotp.id/v1/';
const API_KEY = 'd2c16800b8aba6bafd60499727a16fa9';

// Helper function untuk fetch API
async function fetchAPI(endpoint, params = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    const response = await axios.get(url, {
      params: {
        ...params,
        api_key: API_KEY
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error.message);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Ambil parameter dari query
  const { action, ...params } = req.query;

  if (!action) {
    return res.status(400).json({
      code: 400,
      success: false,
      message: 'Parameter "action" diperlukan (balance, negara, operator, layanan, order, sms, cancel)'
    });
  }

  try {
    let endpoint = '';
    
    // Mapping action ke endpoint
    switch (action) {
      case 'balance':
        endpoint = 'balance.php';
        break;
      case 'negara':
        endpoint = 'negara.php';
        break;
      case 'operator':
        endpoint = 'operator.php';
        break;
      case 'layanan':
        endpoint = 'layanan.php';
        break;
      case 'order':
        endpoint = 'order.php';
        break;
      case 'sms':
        endpoint = 'sms.php';
        break;
      case 'cancel':
        endpoint = 'cancel.php';
        break;
      default:
        return res.status(400).json({
          code: 400,
          success: false,
          message: 'Action tidak valid. Gunakan: balance, negara, operator, layanan, order, sms, cancel'
        });
    }

    const data = await fetchAPI(endpoint, params);
    return res.status(200).json(data);
    
  } catch (error) {
    return res.status(500).json({
      code: 500,
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};
