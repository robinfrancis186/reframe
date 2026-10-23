import { copyRuntime } from './desktop/runtime.mjs';
import { archiveEngine } from './desktop/archive.mjs';
import path from 'node:path';
export default {
  packagerConfig: {
    name: 'Reframe',
    executableName: 'Reframe',
    appBundleId: 'in.robinfrancis.reframe',
    asar: false,
    icon: path.resolve('desktop/Reframe.icns'),
    extendInfo: {
      NSCameraUsageDescription: 'Capture a component reference using your camera.',
      NSMicrophoneUsageDescription: 'Record a component interaction when you choose to.',
    },
    afterCopy: [
      async ({ buildPath }) =>
        copyRuntime(
          path.resolve('.desktop-runtime/reframe-runtime'),
          path.resolve(buildPath, '..', 'reframe-runtime'),
        ),
    ],
    afterPrune: [async ({ buildPath }) => archiveEngine(buildPath)],
    ignore: (file) => {
      if (!file) return false;
      const relative = file.replace(/^\//, '');
      if (
        !/^(?:desktop|dist|server|src|vendor|public|extension|node_modules)(?:\/|$)|^package(?:-lock)?\.json$/.test(
          relative,
        )
      )
        return true;
      return /(?:^|\/)(?:\.env(?:\..*)?|\.reframe|\.git|\.DS_Store|\.cache)(?:\/|$)/.test(relative);
    },
    ...(process.env.MAC_SIGN_IDENTITY
      ? {
          osxSign: { identity: process.env.MAC_SIGN_IDENTITY },
          ...(process.env.APPLE_API_KEY
            ? {
                osxNotarize: {
                  appleApiKey: process.env.APPLE_API_KEY,
                  appleApiKeyId: process.env.APPLE_API_KEY_ID,
                  appleApiIssuer: process.env.APPLE_API_ISSUER,
                },
              }
            : {}),
        }
      : {}),
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin'] }],
};
