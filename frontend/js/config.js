export const CONFIG = {
  API_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:7071/api'
    : 'https://wordle-api-jsaurabh.azurewebsites.net/api'
};
