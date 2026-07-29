package com.hqyj.ka.article.service;

import com.hqyj.ka.article.dto.ArticleDtos.AdminArticleView;
import com.hqyj.ka.article.dto.ArticleDtos.ArticleCard;
import com.hqyj.ka.article.dto.ArticleDtos.ArticleDetail;
import com.hqyj.ka.article.dto.ArticleDtos.PurchaseView;
import com.hqyj.ka.article.dto.ArticleDtos.SaveArticleRequest;
import com.hqyj.ka.article.entity.Article;
import com.hqyj.ka.article.entity.ArticlePurchase;
import com.hqyj.ka.article.repo.ArticlePurchaseRepository;
import com.hqyj.ka.article.repo.ArticleRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.service.CommissionService;
import com.hqyj.ka.wallet.service.WalletService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 文章:前台浏览(试读截断)、余额购买解锁、后台撰写管理。
 * 付费分割:正文中的 <!--paywall--> 标记,前段试读、后段付费;无标记的付费文只展示摘要。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ArticleService {

    public static final String PAYWALL_MARKER = "<!--paywall-->";
    private static final Pattern SLUG_PATTERN = Pattern.compile("^[\\p{L}\\p{N}][\\p{L}\\p{N}-]{0,159}$");
    private static final char[] SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ArticleRepository articleRepository;
    private final ArticlePurchaseRepository purchaseRepository;
    private final WalletService walletService;
    private final CommissionService commissionService;

    // ---------- 前台 ----------

    @Transactional(readOnly = true)
    public Page<ArticleCard> list(String category, String q, int page, int size) {
        return articleRepository.search(Article.Status.PUBLISHED,
                blankToNull(category), blankToNull(q),
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 50)))
                .map(ArticleCard::of);
    }

    @Transactional(readOnly = true)
    public List<String> categories() {
        return articleRepository.categories(Article.Status.PUBLISHED);
    }

    /** 阅读页:memberId 可空(游客)。已发布才可见;浏览数原子 +1。 */
    @Transactional
    public ArticleDetail detail(String slug, Long memberId) {
        Article a = articleRepository.findBySlug(slug)
                .filter(x -> x.getStatus() == Article.Status.PUBLISHED)
                .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));
        articleRepository.incrementViews(a.getId());

        boolean free = a.getPrice() == null || a.getPrice().signum() <= 0;
        boolean purchased = !free && memberId != null
                && purchaseRepository.existsByMemberIdAndArticleId(memberId, a.getId());
        String md = a.getContentMd() == null ? "" : a.getContentMd();
        String content;
        boolean locked;
        if (free || purchased) {
            content = md.replace(PAYWALL_MARKER, "");
            locked = false;
        } else {
            int idx = md.indexOf(PAYWALL_MARKER);
            content = idx >= 0 ? md.substring(0, idx) : ""; // 无标记的付费文:只靠摘要吸引
            locked = true;
        }
        return new ArticleDetail(a.getId(), a.getSlug(), a.getTitle(), a.getCategory(), a.getTags(),
                a.getCoverImage(), a.getSummary(), a.getPrice(), a.isPinned(),
                a.getViews() + 1, a.getPublishedAt(), content, locked, purchased);
    }

    // ---------- 会员 ----------

    /** 余额购买:先抢唯一购买记录,再扣款;重复点击在扣钱前失败。 */
    @Transactional
    public void purchase(Long memberId, Long articleId) {
        Article a = articleRepository.findById(articleId)
                .filter(x -> x.getStatus() == Article.Status.PUBLISHED)
                .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));
        if (a.getPrice() == null || a.getPrice().signum() <= 0) {
            throw new BusinessException(ErrorCode.ARTICLE_FREE);
        }
        if (purchaseRepository.existsByMemberIdAndArticleId(memberId, articleId)) {
            throw new BusinessException(ErrorCode.ARTICLE_ALREADY_PURCHASED);
        }
        ArticlePurchase p = new ArticlePurchase();
        p.setMemberId(memberId);
        p.setArticleId(articleId);
        p.setPrice(a.getPrice());
        try {
            purchaseRepository.saveAndFlush(p);
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException(ErrorCode.ARTICLE_ALREADY_PURCHASED);
        }
        walletService.debit(memberId, a.getPrice(), WalletTxn.Type.PURCHASE,
                "ARTICLE", articleId, "购买文章《" + a.getTitle() + "》");
        articleRepository.incrementPurchaseCount(articleId);
        try {
            commissionService.onSpend(memberId, a.getPrice(), "ARTICLE", articleId, "好友购买文章");
        } catch (RuntimeException e) {
            log.warn("article commission accounting failed, articleId={}, memberId={}: {}",
                    articleId, memberId, e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public Page<PurchaseView> myPurchases(Long memberId, int page, int size) {
        Page<ArticlePurchase> purchases = purchaseRepository.findByMemberIdOrderByIdDesc(
                memberId, PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 50)));
        Set<Long> ids = purchases.getContent().stream()
                .map(ArticlePurchase::getArticleId).collect(Collectors.toSet());
        Map<Long, Article> articles = articleRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Article::getId, Function.identity()));
        return purchases.map(p -> {
            Article a = articles.get(p.getArticleId());
            return new PurchaseView(p.getId(), p.getArticleId(),
                    a != null ? a.getTitle() : "(已删除)", a != null ? a.getSlug() : null,
                    p.getPrice(), p.getCreatedAt());
        });
    }

    // ---------- 后台 ----------

    @Transactional(readOnly = true)
    public Page<AdminArticleView> adminList(String status, String q, int page, int size) {
        Article.Status st = null;
        if (status != null && !status.isBlank()) {
            st = Article.Status.valueOf(status.trim().toUpperCase());
        }
        return articleRepository.adminSearch(st, blankToNull(q),
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100)))
                .map(AdminArticleView::of);
    }

    @Transactional(readOnly = true)
    public AdminArticleView adminGet(Long id) {
        return articleRepository.findById(id).map(AdminArticleView::of)
                .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));
    }

    /** 新建/更新(id 空=新建)。slug 留空自动生成;首次转 PUBLISHED 记 publishedAt。 */
    @Transactional
    public AdminArticleView save(SaveArticleRequest req) {
        Article a = req.id() == null ? new Article()
                : articleRepository.findById(req.id())
                        .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));

        String slug = req.slug() == null ? "" : normalizeSlug(req.slug());
        if (slug.isEmpty()) {
            slug = a.getSlug() != null ? a.getSlug() : uniqueSlug(slugify(req.title()));
        } else if (!SLUG_PATTERN.matcher(slug).matches()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "slug 仅允许中文/英文字母、数字与短横线");
        }
        articleRepository.findBySlug(slug).ifPresent(existing -> {
            if (!existing.getId().equals(req.id())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "slug 已被其他文章占用");
            }
        });

        a.setSlug(slug);
        a.setTitle(req.title().trim());
        a.setCategory(trimOrNull(req.category()));
        a.setTags(trimOrNull(req.tags()));
        a.setCoverImage(trimOrNull(req.coverImage()));
        a.setSummary(trimOrNull(req.summary()));
        a.setContentMd(req.contentMd());
        a.setPrice(req.price() == null ? BigDecimal.ZERO : req.price());
        a.setPinned(req.pinned());
        Article.Status target = "PUBLISHED".equalsIgnoreCase(req.status())
                ? Article.Status.PUBLISHED : Article.Status.DRAFT;
        a.setStatus(target);
        if (target == Article.Status.PUBLISHED && a.getPublishedAt() == null) {
            a.setPublishedAt(LocalDateTime.now());
        }
        return AdminArticleView.of(articleRepository.save(a));
    }

    /** 上/下架切换。 */
    @Transactional
    public AdminArticleView toggleStatus(Long id) {
        Article a = articleRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));
        if (a.getStatus() == Article.Status.PUBLISHED) {
            a.setStatus(Article.Status.DRAFT);
        } else {
            a.setStatus(Article.Status.PUBLISHED);
            if (a.getPublishedAt() == null) a.setPublishedAt(LocalDateTime.now());
        }
        return AdminArticleView.of(a);
    }

    /** 置顶切换:前台与后台列表都会置顶优先展示。 */
    @Transactional
    public AdminArticleView togglePinned(Long id) {
        Article a = articleRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));
        a.setPinned(!a.isPinned());
        return AdminArticleView.of(a);
    }

    /** 删除:有购买记录的不许删(会员已付费,内容必须可达),请转草稿下架。 */
    @Transactional
    public void delete(Long id) {
        Article a = articleRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ARTICLE_NOT_FOUND));
        if (a.getPurchaseCount() > 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已有会员购买,不可删除;可转为草稿下架");
        }
        articleRepository.delete(a);
    }

    private String uniqueSlug(String base) {
        String clean = base == null || base.isBlank() ? generateSlug() : base;
        clean = clean.length() > 140 ? clean.substring(0, 140).replaceAll("-+$", "") : clean;
        if (!articleRepository.existsBySlug(clean)) return clean;
        for (int i = 2; i < 100; i++) {
            String slug = clean + "-" + i;
            if (!articleRepository.existsBySlug(slug)) return slug;
        }
        return generateSlug();
    }

    private String generateSlug() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder("a-");
            for (int i = 0; i < 8; i++) sb.append(SLUG_CHARS[RANDOM.nextInt(SLUG_CHARS.length)]);
            String slug = sb.toString();
            if (!articleRepository.existsBySlug(slug)) return slug;
        }
        throw new BusinessException(ErrorCode.INTERNAL_ERROR);
    }

    private static String slugify(String title) {
        String s = normalizeSlug(title);
        if (s.isBlank()) return "";
        return s.length() > 150 ? s.substring(0, 150).replaceAll("-+$", "") : s;
    }

    private static String normalizeSlug(String raw) {
        if (raw == null) return "";
        String lower = raw.trim().toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder();
        boolean dash = false;
        for (int i = 0; i < lower.length();) {
            int cp = lower.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isLetterOrDigit(cp)) {
                sb.appendCodePoint(cp);
                dash = false;
            } else if (!dash && sb.length() > 0) {
                sb.append('-');
                dash = true;
            }
        }
        while (sb.length() > 0 && sb.charAt(sb.length() - 1) == '-') sb.setLength(sb.length() - 1);
        return sb.toString();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String trimOrNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
