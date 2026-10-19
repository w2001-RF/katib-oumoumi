// Metro bundles the shared core of the web app (../js/core) along with the
// mobile sources: the same validation, templates and catalog queries run on
// both platforms (and in the Telegram bot).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../js/core')];

module.exports = config;
