package com.hqyj.ka.article.controller;

import com.hqyj.ka.article.dto.ArticleDtos.AdminArticleView;
import com.hqyj.ka.article.dto.ArticleDtos.SaveArticleRequest;
import com.hqyj.ka.article.service.ArticleService;
import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** 后台文章管理(article:read / article:write)。 */
@RestController
@RequestMapping("/api/admin/articles")
@RequiredArgsConstructor
public class AdminArticleController {

    private final ArticleService articleService;
    private final AuditService auditService;

    @GetMapping
    @PreAuthorize("hasAuthority('article:read')")
    public ApiResponse<PageResult<AdminArticleView>> list(@RequestParam(required = false) String status,
                                                          @RequestParam(required = false) String q,
                                                          @RequestParam(defaultValue = "0") int page,
                                                          @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(PageResult.of(articleService.adminList(status, q, page, size)));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('article:read')")
    public ApiResponse<AdminArticleView> get(@PathVariable Long id) {
        return ApiResponse.ok(articleService.adminGet(id));
    }

    /** 新建/保存(id 空=新建)。 */
    @PostMapping
    @PreAuthorize("hasAuthority('article:write')")
    public ApiResponse<AdminArticleView> save(@Valid @RequestBody SaveArticleRequest req,
                                              HttpServletRequest http) {
        AdminArticleView saved = articleService.save(req);
        auditService.record(String.valueOf(http.getAttribute("uname")),
                req.id() == null ? "ARTICLE_CREATE" : "ARTICLE_UPDATE",
                "article:" + saved.id(), RateLimitFilter.clientIp(http), saved.title());
        return ApiResponse.ok(saved);
    }

    /** 上/下架切换。 */
    @PostMapping("/{id}/toggle")
    @PreAuthorize("hasAuthority('article:write')")
    public ApiResponse<AdminArticleView> toggle(@PathVariable Long id, HttpServletRequest http) {
        AdminArticleView view = articleService.toggleStatus(id);
        auditService.record(String.valueOf(http.getAttribute("uname")), "ARTICLE_TOGGLE",
                "article:" + id, RateLimitFilter.clientIp(http), view.status());
        return ApiResponse.ok(view);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('article:write')")
    public ApiResponse<Void> delete(@PathVariable Long id, HttpServletRequest http) {
        articleService.delete(id);
        auditService.record(String.valueOf(http.getAttribute("uname")), "ARTICLE_DELETE",
                "article:" + id, RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }
}
