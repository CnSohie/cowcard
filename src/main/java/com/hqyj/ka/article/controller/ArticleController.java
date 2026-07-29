package com.hqyj.ka.article.controller;

import com.hqyj.ka.article.dto.ArticleDtos.ArticleCard;
import com.hqyj.ka.article.dto.ArticleDtos.ArticleDetail;
import com.hqyj.ka.article.service.ArticleService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 前台文章(permitAll)。JWT 过滤器对所有请求都跑:游客 mid=null 看试读,
 * 携会员令牌则 mid 就位,已购文章直接解锁全文。
 */
@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class ArticleController {

    private final ArticleService articleService;

    @GetMapping
    public ApiResponse<PageResult<ArticleCard>> list(@RequestParam(required = false) String category,
                                                     @RequestParam(required = false) String q,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.ok(PageResult.of(articleService.list(category, q, page, size)));
    }

    @GetMapping("/categories")
    public ApiResponse<List<String>> categories() {
        return ApiResponse.ok(articleService.categories());
    }

    @GetMapping("/{slug}")
    public ApiResponse<ArticleDetail> detail(@PathVariable String slug, HttpServletRequest http) {
        Long mid = (Long) http.getAttribute("mid");
        return ApiResponse.ok(articleService.detail(slug, mid));
    }
}
