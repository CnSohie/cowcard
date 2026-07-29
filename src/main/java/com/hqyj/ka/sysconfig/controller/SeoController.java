package com.hqyj.ka.sysconfig.controller;

import com.hqyj.ka.article.entity.Article;
import com.hqyj.ka.article.repo.ArticleRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** 公开 SEO 端点:sitemap.xml / robots.txt。 */
@RestController
@RequiredArgsConstructor
public class SeoController {

    private final ConfigService configService;
    private final ArticleRepository articleRepository;

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    public String robots() {
        String base = siteUrl();
        boolean index = !"0".equals(configService.all().getOrDefault("seo.index", "1"));
        return "User-agent: *\n"
                + (index ? "Allow: /\n" : "Disallow: /\n")
                + "Sitemap: " + base + "/sitemap.xml\n";
    }

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String sitemap() {
        String base = siteUrl();
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8"?>
                <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                """);
        url(xml, base + "/", null, "1.0");
        url(xml, base + "/posts", null, "0.8");
        for (Article a : articleRepository.findByStatusOrderByPublishedAtDescIdDesc(Article.Status.PUBLISHED)) {
            String loc = base + "/posts/" + encodePathSegment(a.getSlug());
            String lastmod = a.getUpdatedAt() == null ? null : a.getUpdatedAt().toLocalDate().format(DateTimeFormatter.ISO_DATE);
            url(xml, loc, lastmod, a.isPinned() ? "0.9" : "0.7");
        }
        xml.append("</urlset>\n");
        return xml.toString();
    }

    private void url(StringBuilder xml, String loc, String lastmod, String priority) {
        xml.append("  <url>\n");
        xml.append("    <loc>").append(escape(loc)).append("</loc>\n");
        if (lastmod != null) xml.append("    <lastmod>").append(lastmod).append("</lastmod>\n");
        xml.append("    <priority>").append(priority).append("</priority>\n");
        xml.append("  </url>\n");
    }

    private String siteUrl() {
        Map<String, String> cfg = configService.all();
        String url = cfg.getOrDefault("site.url", "").trim();
        if (url.isBlank()) return "http://localhost:5173";
        return url.replaceAll("/+$", "");
    }

    private String escape(String s) {
        return s == null ? "" : s
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private String encodePathSegment(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
