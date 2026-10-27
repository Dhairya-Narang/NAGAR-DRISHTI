// Nagar Drishti API Endpoint Resolver
// Priority: window variable -> localStorage override -> Render auto-detect -> localhost dev -> relative proxy (/api)
(function() {
  const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('NAGAR_DRISHTI_API_URL') : null;
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isRenderStatic = typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com') && !window.location.hostname.includes('backend');

  let defaultUrl = '/api';
  if (isLocal) {
    defaultUrl = 'http://localhost:5001/api';
  } else if (isRenderStatic) {
    defaultUrl = 'https://nagar-drishti-backend.onrender.com/api';
  }

  window.NAGAR_DRISHTI_API_URL = window.NAGAR_DRISHTI_API_URL || storedUrl || defaultUrl;
})();
