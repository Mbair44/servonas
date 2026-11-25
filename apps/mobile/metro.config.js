/* eslint-disable @typescript-eslint/no-require-imports -- Metro config is loaded as CommonJS by Expo. */
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
