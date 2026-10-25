export default {
  testDir: ".",
  testMatch: /order\.spec\.js/,
  timeout: 20_000,
  workers: 1,
  reporter: [["json", { outputFile: process.env.REPORT_FILE }]],
  use: { baseURL: process.env.BASE_URL, channel: process.env.PW_CHANNEL || "chrome", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "desktop-1440" }],
};
