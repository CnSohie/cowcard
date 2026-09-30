package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** EVM 收款地址统一来源:后台动态配置优先,环境变量/application.yml 作为部署兜底。 */
@Component
@RequiredArgsConstructor
public class MerchantAddressProvider {

    public static final String CONFIG_KEY = "crypto.merchant_address";

    private final ConfigService configService;
    private final AppProperties props;

    public String current() {
        String configured = configService.all().get(CONFIG_KEY);
        String address = configured == null || configured.isBlank()
                ? props.getCrypto().getMerchantAddress() : configured;
        return address == null ? "" : address.strip().toLowerCase();
    }

    public boolean valid() {
        String address = current();
        return address.matches("^0x[0-9a-f]{40}$")
                && !address.equals("0x0000000000000000000000000000000000000000");
    }
}
