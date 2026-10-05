// 安全响应头（不依赖 helmet）：同源资源、禁止被嵌套、HTTPS 下开启 HSTS。对 SSE 无影响。
// 可选环境变量：CSP_CONNECT_SRC（前后端分离时追加 API 域名，空格分隔）
function securityHeaders(req, res, next) {
  const connect = ["'self'", ...(process.env.CSP_CONNECT_SRC || '').split(/\s+/).filter(Boolean)].join(' ');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (req.secure) csp.push('upgrade-insecure-requests');
  res.set({
    'Content-Security-Policy': csp.join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}
export { securityHeaders };
