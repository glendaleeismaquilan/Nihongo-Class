const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// react-native-webrtc has no web build. When the app is run in a browser (used to
// walk the screens during testing), resolve it to an empty module so the bundle
// builds; native Android/iOS builds are unaffected.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-webrtc") return { type: "empty" };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
