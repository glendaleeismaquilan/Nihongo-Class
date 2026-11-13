// Android release builds block plain-HTTP requests (targetSdk 28+), so an app
// pointed at the laptop API (http://<LAN IP>:3000) can't reach it at all. When
// extra.apiUrl is http://, allow cleartext ONLY to that host — plus the emulator
// loopback addresses — through a network security config. An https apiUrl gets
// no cleartext exception, and every other host stays https-only.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function cleartextHosts(apiUrl) {
  if (!apiUrl) return [];
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    return [];
  }
  if (url.protocol !== "http:") return [];
  return [...new Set([url.hostname, "localhost", "127.0.0.1", "10.0.2.2"])];
}

function networkSecurityXml(hosts) {
  const domains = hosts.map((h) => `    <domain includeSubdomains="false">${h}</domain>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
${domains}
  </domain-config>
</network-security-config>
`;
}

module.exports = function withApiNetworkSecurity(config) {
  const hosts = cleartextHosts(config.extra?.apiUrl);
  if (!hosts.length) return config;

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "network_security_config.xml"), networkSecurityXml(hosts));
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });
};
