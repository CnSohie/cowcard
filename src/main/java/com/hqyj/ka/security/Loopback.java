package com.hqyj.ka.security;

/**
 * 判断 TCP 对端是不是本机回环地址。只认字面量,不做 DNS。
 * 不解析 X-Forwarded-For:伪造该头不能把公网请求伪装成本机。
 */
public final class Loopback {

    private Loopback() {}

    public static boolean matches(String ip) {
        if (ip == null || ip.isBlank()) return false;
        String host = ip.trim();
        if (host.startsWith("[")) {
            int end = host.indexOf(']');
            if (end > 1) host = host.substring(1, end);
        }
        int zone = host.indexOf('%');
        if (zone > 0) host = host.substring(0, zone);
        if (host.regionMatches(true, 0, "::ffff:", 0, 7)) {
            return matches(host.substring(7));
        }
        if ("::1".equals(host) || "0:0:0:0:0:0:0:1".equals(host)) return true;
        if (!host.startsWith("127.")) return false;
        String[] parts = host.split("\\.");
        if (parts.length != 4) return false;
        try {
            for (String part : parts) {
                int n = Integer.parseInt(part);
                if (n < 0 || n > 255) return false;
            }
        } catch (NumberFormatException e) {
            return false;
        }
        return true;
    }
}
