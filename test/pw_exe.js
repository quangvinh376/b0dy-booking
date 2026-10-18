/* Chromium cho Playwright: biến PW_CHROMIUM > bản cài sẵn của máy test cloud > bản Playwright tự tải (npx playwright install chromium). */
const fs = require('fs');
const CLOUD = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
module.exports = process.env.PW_CHROMIUM || (fs.existsSync(CLOUD) ? CLOUD : undefined);
