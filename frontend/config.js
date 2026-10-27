// Nagar Drishti API Endpoint Resolver
// Priority: query param (?backend=...) -> window variable -> localStorage -> Render auto-detect -> localhost dev -> relative proxy (/api)
(function() {
  let paramUrl = null;
  if (typeof window !== 'undefined' && window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const backendParam = params.get('backend') || params.get('api');
      if (backendParam) {
        paramUrl = backendParam.replace(/\/+$/, '');
        if (!paramUrl.endsWith('/api') && !paramUrl.includes('/api/')) {
          paramUrl += '/api';
        }
        localStorage.setItem('NAGAR_DRISHTI_API_URL', paramUrl);
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  }

  const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('NAGAR_DRISHTI_API_URL') : null;
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isRenderStatic = typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com') && !window.location.hostname.includes('backend');

  let defaultUrl = '/api';
  if (isLocal) {
    defaultUrl = 'http://localhost:5001/api';
  } else if (isRenderStatic) {
    defaultUrl = 'https://nagar-drishti-backend-9odx.onrender.com/api';
  }

  window.NAGAR_DRISHTI_API_URL = window.NAGAR_DRISHTI_API_URL || paramUrl || storedUrl || defaultUrl;
})();
