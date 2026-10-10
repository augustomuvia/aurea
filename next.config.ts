import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Comprovativos de pagamento até 4 MB (o limite real é validado na ação).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Página do e-book: fora dos motores de pesquisa.
      { source: "/ebook", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
      { source: "/ebook/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
    ];
  },
};

export default nextConfig;
