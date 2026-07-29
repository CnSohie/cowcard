package com.hqyj.ka.order.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.order.service.PresaleVoucherService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/member/presale")
@RequiredArgsConstructor
public class PresaleController {

    private final PresaleVoucherService presaleVoucherService;

    public record RedeemRequest(@NotBlank @Size(max = 128) String token,
                                @Size(max = 128) String contact) {}

    @PostMapping("/redeem")
    public ApiResponse<PresaleVoucherService.RedeemResult> redeem(@Valid @RequestBody RedeemRequest req,
                                                                  HttpServletRequest http) {
        Long memberId = (Long) http.getAttribute("mid");
        return ApiResponse.ok(presaleVoucherService.redeem(req.token(), memberId, req.contact()));
    }

    @GetMapping("/vouchers")
    public ApiResponse<java.util.List<PresaleVoucherService.VoucherView>> vouchers(HttpServletRequest http) {
        Long memberId = (Long) http.getAttribute("mid");
        return ApiResponse.ok(presaleVoucherService.listForMember(memberId));
    }
}
