package com.hqyj.ka.common;

import lombok.Getter;

@Getter
public enum ErrorCode {
    BAD_REQUEST(400, "请求参数有误"),
    UNAUTHORIZED(401, "未登录或登录已过期"),
    FORBIDDEN(403, "无权限执行该操作"),
    NOT_FOUND(404, "资源不存在"),
    RATE_LIMITED(429, "请求过于频繁,请稍后再试"),
    INTERNAL_ERROR(500, "系统繁忙,请稍后再试"),

    // 认证 10xx
    BAD_CREDENTIALS(1001, "用户名或密码错误"),
    ACCOUNT_LOCKED(1002, "失败次数过多,账户已临时锁定"),
    ACCOUNT_DISABLED(1003, "账户已被禁用"),
    REFRESH_INVALID(1004, "刷新令牌无效,请重新登录"),
    TOTP_REQUIRED(1005, "请输入两步验证动态码"),
    TOTP_INVALID(1006, "动态验证码错误"),
    TOTP_NOT_ENABLED(1007, "执行敏感操作前,请先在「安全设置」启用两步验证"),

    // 商品/库存 20xx
    PRODUCT_OFF_SHELF(2001, "商品不存在或已下架"),
    STOCK_NOT_ENOUGH(2002, "库存不足"),
    QUANTITY_LIMIT(2003, "超过单次购买数量限制"),
    COUPON_INVALID(2004, "优惠码无效、已过期或已用完"),
    COUPON_MIN_NOT_MET(2005, "未达到优惠码最低消费门槛"),

    // 订单 30xx
    ORDER_NOT_FOUND(3001, "订单不存在或查询凭证错误"),
    ORDER_STATE_INVALID(3002, "订单状态不允许该操作"),
    ORDER_EXPIRED(3003, "订单已超时关闭,请重新下单"),
    ORDER_PENDING_LIMIT(3004, "存在多笔未支付订单,请先完成支付或等待其自动关闭后再下单"),

    ORDER_QUERY_EXPIRED(3005, "历史查单免验证已过期,请手动验证后查询"),

    // 支付 40xx
    CHANNEL_DISABLED(4001, "该支付方式暂不可用"),
    PAY_CREATE_FAILED(4002, "支付创建失败,请稍后再试"),
    CALLBACK_VERIFY_FAILED(4003, "回调验签失败"),
    AMOUNT_MISMATCH(4004, "支付金额与订单不符"),
    TX_ALREADY_USED(4005, "该交易哈希已被使用"),
    TX_VERIFY_FAILED(4006, "链上交易验证未通过"),
    AMOUNT_ALLOCATE_FAILED(4007, "支付金额分配失败,请重试"),

    // 会员 11xx
    MEMBER_EXISTS(1101, "该邮箱已注册"),
    INVITE_CODE_INVALID(1102, "推荐码无效"),

    // 钱包/提现 50xx
    BALANCE_NOT_ENOUGH(5001, "钱包余额不足"),
    WITHDRAW_MIN(5002, "未达到最低提现金额"),
    WITHDRAW_PENDING_EXISTS(5003, "已有待审核的提现申请,请等待处理"),
    WITHDRAW_STATE(5004, "该提现申请状态不允许此操作"),
    RECHARGE_AMOUNT_INVALID(5005, "充值金额无效"),

    // 文章 60xx
    ARTICLE_NOT_FOUND(6001, "文章不存在或未发布"),
    ARTICLE_ALREADY_PURCHASED(6002, "你已购买过该文章"),
    ARTICLE_FREE(6003, "该文章为免费内容,无需购买"),

    // 上传 70xx
    UPLOAD_TYPE(7001, "仅支持 PNG / JPG / WEBP / GIF 图片"),
    UPLOAD_TOO_LARGE(7002, "图片大小超出限制"),

    // 安全校验 80xx
    CAPTCHA_INVALID(8001, "人机验证无效或已过期，请重新验证");

    private final int code;
    private final String message;
    ErrorCode(int code, String message) { this.code = code; this.message = message; }
}
