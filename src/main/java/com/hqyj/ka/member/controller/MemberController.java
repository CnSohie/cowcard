package com.hqyj.ka.member.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.member.dto.MemberDtos.MemberView;
import com.hqyj.ka.member.repo.MemberLevelRepository;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.order.dto.OrderDtos.OrderView;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.wallet.entity.WalletAccount;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.repo.WalletAccountRepository;
import com.hqyj.ka.wallet.repo.WalletTxnRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/** 会员中心(KIND_MEMBER 硬隔离)。 */
@RestController
@RequestMapping("/api/member")
@RequiredArgsConstructor
public class MemberController {

    private final MemberRepository memberRepository;
    private final MemberLevelRepository levelRepository;
    private final WalletAccountRepository accountRepository;
    private final WalletTxnRepository txnRepository;
    private final OrderService orderService;

    /** 我的资料 + 钱包概况 + 推广数据(一次拉齐,省往返)。 */
    @GetMapping("/me")
    public ApiResponse<Map<String, Object>> me(HttpServletRequest http) {
        Long mid = (Long) http.getAttribute("mid");
        var member = memberRepository.findById(mid)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        WalletAccount account = accountRepository.findByMemberId(mid).orElse(null);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("member", MemberView.of(member));
        data.put("level", member.getLevelId() == null ? null : levelRepository.findById(member.getLevelId())
                .map(level -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", level.getId());
                    item.put("name", level.getName());
                    item.put("icon", level.getIcon());
                    item.put("discountRate", level.getDiscountRate());
                    item.put("rechargeThreshold", level.getRechargeThreshold());
                    item.put("spendThreshold", level.getSpendThreshold());
                    return item;
                }).orElse(null));
        data.put("balance", account != null ? account.getBalance() : BigDecimal.ZERO);
        data.put("frozen", account != null ? account.getFrozen() : BigDecimal.ZERO);
        data.put("invitedCount", memberRepository.countByInviterId(mid));
        data.put("commissionTotal", txnRepository.sumByType(mid, WalletTxn.Type.COMMISSION));
        return ApiResponse.ok(data);
    }

    /** 我的订单(含充值单;已交付商品单带卡密)。 */
    @GetMapping("/orders")
    public ApiResponse<PageResult<OrderView>> orders(HttpServletRequest http,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "10") int size) {
        Long mid = (Long) http.getAttribute("mid");
        return ApiResponse.ok(PageResult.of(orderService.listByMember(mid, page, size)));
    }
}
