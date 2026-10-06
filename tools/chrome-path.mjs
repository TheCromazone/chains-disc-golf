// Default Chrome binary per platform; CHROME overrides it everywhere.
const DEFAULTS = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  linux: '/usr/bin/google-chrome',
};
export const CHROME = process.env.CHROME || DEFAULTS[process.platform] || DEFAULTS.linux;
