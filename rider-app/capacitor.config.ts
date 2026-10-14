import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cl.delaroca.repartidor",
  appName: "De la Roca Repartidor",
  webDir: "public",
  server: {
    url: "https://delaroca.gametradegg.com/repartidor",
    cleartext: false,
    allowNavigation: ["delaroca.gametradegg.com"]
  }
};

export default config;
