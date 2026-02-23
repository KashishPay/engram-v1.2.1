import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.engram.app',
  appName: 'Engram',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#f59e0b",
      sound: "beep.wav",
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: "159586902410-fotapvsnpks68kperegilakfjjqm10ed.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;