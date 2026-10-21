export default {
  async redirects() {
    return [
      { source: "/old-pricing", destination: "/pricing", permanent: true },
      { source: "/:locale(en|fr)?/docs", destination: "/help", permanent: true },
      // only for visitors without a session cookie: the page is still rendered for everyone else
      { source: "/dashboard/settings", has: [{ type: "cookie", key: "guest" }], destination: "/sign-up", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/blog/:slug", destination: "https://blog.acme.com/:slug" }];
  },
};
