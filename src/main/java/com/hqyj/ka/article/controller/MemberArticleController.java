package com.hqyj.ka.article.controller;

import com.hqyj.ka.article.dto.ArticleDtos.PurchaseView;
import com.hqyj.ka.article.service.ArticleService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 会员文章操作(购买/已购列表)。 */
@RestController
@RequestMapping("/api/member/articles")
@RequiredArgsConstructor
public class MemberArticleController {

    private final ArticleService articleService;

    /** 余额购买解锁付费内容。 */
    @PostMapping("/{id}/purchase")
    public ApiResponse<Void> purchase(@PathVariable Long id, HttpServletRequest http) {
        Long mid = (Long) http.getAttribute("mid");
        articleService.purchase(mid, id);
        return ApiResponse.ok();
    }

    @GetMapping
    public ApiResponse<PageResult<PurchaseView>> myPurchases(HttpServletRequest http,
                                                             @RequestParam(defaultValue = "0") int page,
                                                             @RequestParam(defaultValue = "10") int size) {
        Long mid = (Long) http.getAttribute("mid");
        return ApiResponse.ok(PageResult.of(articleService.myPurchases(mid, page, size)));
    }
}
