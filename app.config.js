const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

const googleServicesFile = path.join(__dirname, 'google-services.json');
const expo = { ...appJson.expo };

if (fs.existsSync(googleServicesFile)) {
  expo.android = {
    ...expo.android,
    googleServicesFile: './google-services.json',
  };
}

module.exports = expo;
