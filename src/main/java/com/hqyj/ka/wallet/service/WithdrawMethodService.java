package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/** 管理员启用的提现方式及其服务端校验。渠道编码永远不接受自由文本。 */
@Service
@RequiredArgsConstructor
public class WithdrawMethodService {
    public static final String CONFIG_KEY = "wallet.withdraw_methods";
    private static final String DEFAULT_METHODS = "ALIPAY,BANK";
    private static final Set<String> SUPPORTED = Set.of("ALIPAY", "BANK", "USDT_TRC20", "USDT_BEP20");
    private static final Pattern PHONE = Pattern.compile("^1[3-9]\\d{9}$");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]{1,190}$");
    private static final Pattern NAME = Pattern.compile("^[\\p{L}· .'-]{2,50}$");
    private static final Pattern BANK_CARD = Pattern.compile("^\\d{12,19}$");
    private static final Pattern TRON = Pattern.compile("^T[1-9A-HJ-NP-Za-km-z]{33}$");
    private static final Pattern EVM = Pattern.compile("^0x[0-9a-fA-F]{40}$");

    private final ConfigService configService;

    public record MethodView(String code, String label, String accountLabel, String accountPlaceholder,
                             boolean accountNameRequired, boolean bankNameRequired, String warning,
                             BigDecimal feeRate, BigDecimal feeFixed) {}

    public record Normalized(String code, String account, String accountName, String bankName) {}
    public record FeeQuote(BigDecimal requestAmount, BigDecimal feeAmount, BigDecimal netAmount) {}

    public List<MethodView> enabledMethods() {
        Map<String, String> config = configService.all();
        return parseEnabled(config.getOrDefault(CONFIG_KEY, DEFAULT_METHODS)).stream()
                .map(code -> view(code, config)).toList();
    }

    public void validateConfig(String raw) {
        if (raw == null || raw.isBlank()) return; // 允许管理员关闭提现入口
        for (String code : raw.split(",")) {
            String normalized = code.trim().toUpperCase(Locale.ROOT);
            if (!SUPPORTED.contains(normalized)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "不支持的提现方式: " + normalized);
            }
        }
    }

    public void validateFeeConfig(Map<String, String> config) {
        for (String code : SUPPORTED) {
            BigDecimal rate = decimal(config.get(rateKey(code)));
            BigDecimal fixed = decimal(config.get(fixedKey(code)));
            if (rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0 || rate.scale() > 4) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, code + " 提现手续费比例必须在 0–100% 之间");
            }
            if (fixed.signum() < 0 || fixed.scale() > 2 || fixed.compareTo(BigDecimal.valueOf(1_000_000)) > 0) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, code + " 固定提现手续费格式不正确");
            }
        }
    }

    public FeeQuote feeQuote(String code, BigDecimal requestAmount) {
        Map<String, String> config = configService.all();
        BigDecimal amount = requestAmount.setScale(2, RoundingMode.HALF_UP);
        BigDecimal fee = amount.multiply(decimal(config.get(rateKey(code))))
                .divide(BigDecimal.valueOf(100), 8, RoundingMode.HALF_UP)
                .add(decimal(config.get(fixedKey(code)))).setScale(2, RoundingMode.HALF_UP);
        if (fee.compareTo(amount) >= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "提现手续费不能大于或等于提现金额");
        }
        return new FeeQuote(amount, fee, amount.subtract(fee));
    }

    public Normalized validate(String channel, String account, String accountName, String bankName) {
        String code = channel == null ? "" : channel.trim().toUpperCase(Locale.ROOT);
        if (!parseEnabled(configService.all().getOrDefault(CONFIG_KEY, DEFAULT_METHODS)).contains(code)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "该提现方式未开放或已停用");
        }
        String acct = clean(account, 128, "收款账号");
        String name = optional(accountName, 50);
        String bank = optional(bankName, 80);
        switch (code) {
            case "ALIPAY" -> {
                if (!PHONE.matcher(acct).matches() && !EMAIL.matcher(acct).matches()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "支付宝账号必须是有效手机号或邮箱");
                }
                requireName(name);
            }
            case "BANK" -> {
                String digits = acct.replace(" ", "");
                if (!BANK_CARD.matcher(digits).matches() || !luhn(digits)) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "银行卡号格式或校验位不正确");
                }
                acct = digits;
                requireName(name);
                if (bank == null || bank.length() < 2) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写开户银行名称");
                }
            }
            case "USDT_TRC20" -> {
                if (!TRON.matcher(acct).matches()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "TRC20 地址格式不正确,必须以 T 开头");
                }
                name = null; bank = null;
            }
            case "USDT_BEP20" -> {
                if (!EVM.matcher(acct).matches()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "BEP20 地址格式不正确,必须是 0x 开头的 42 位地址");
                }
                name = null; bank = null;
            }
            default -> throw new BusinessException(ErrorCode.BAD_REQUEST, "不支持的提现方式");
        }
        return new Normalized(code, acct, name, bank);
    }

    private List<String> parseEnabled(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return Arrays.stream(raw.split(",")).map(String::trim).map(s -> s.toUpperCase(Locale.ROOT))
                .filter(SUPPORTED::contains).distinct().toList();
    }

    private MethodView view(String code, Map<String, String> config) {
        BigDecimal rate = decimal(config.get(rateKey(code)));
        BigDecimal fixed = decimal(config.get(fixedKey(code)));
        return switch (code) {
            case "ALIPAY" -> new MethodView(code, "支付宝", "支付宝账号", "手机号或邮箱", true, false, "姓名必须与支付宝实名一致", rate, fixed);
            case "BANK" -> new MethodView(code, "银行卡", "银行卡号", "12–19 位银行卡号", true, true, "仅支持本人银行卡,姓名需与持卡人一致", rate, fixed);
            case "USDT_TRC20" -> new MethodView(code, "USDT · TRC20", "TRC20 地址", "T 开头的 TRON 地址", false, false, "只可填写 TRC20 地址,网络错误可能无法找回", rate, fixed);
            case "USDT_BEP20" -> new MethodView(code, "USDT · BEP20", "BEP20 地址", "0x 开头的 BSC 地址", false, false, "只可填写 BSC(BEP20)地址,不要填写交易所充值备注", rate, fixed);
            default -> throw new IllegalArgumentException(code);
        };
    }

    private String rateKey(String code) { return "wallet.withdraw_fee_rate." + code; }
    private String fixedKey(String code) { return "wallet.withdraw_fee_fixed." + code; }
    private BigDecimal decimal(String value) {
        if (value == null || value.isBlank()) return BigDecimal.ZERO;
        try { return new BigDecimal(value.trim()); }
        catch (NumberFormatException e) { throw new BusinessException(ErrorCode.BAD_REQUEST, "提现手续费必须是数字"); }
    }

    private String clean(String value, int max, String field) {
        String result = value == null ? "" : value.trim();
        if (result.isBlank() || result.length() > max) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, field + "格式不正确");
        }
        return result;
    }

    private String optional(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new BusinessException(ErrorCode.BAD_REQUEST, "收款信息过长");
        return result;
    }

    private void requireName(String name) {
        if (name == null || !NAME.matcher(name).matches()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写与收款账户一致的真实姓名");
        }
    }

    private boolean luhn(String digits) {
        int sum = 0; boolean doubleIt = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int n = digits.charAt(i) - '0';
            if (doubleIt && (n *= 2) > 9) n -= 9;
            sum += n; doubleIt = !doubleIt;
        }
        return sum % 10 == 0;
    }
}
