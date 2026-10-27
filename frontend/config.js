window.NAGAR_DRISHTI_API_URL =
  window.NAGAR_DRISHTI_API_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5001/api'
    : '/api');
