package com.hqyj.ka.payment.crypto;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.hqyj.ka.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigInteger;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 极简 EVM JSON-RPC 客户端(RestClient 直连,不引入 web3j —— 2C2G 省 40MB+ 依赖与堆占用)。
 * 多 RPC 端点故障切换;超时 5s,失败换下一个。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChainRpcClient {

    /** keccak256("Transfer(address,address,uint256)") */
    public static final String TRANSFER_TOPIC =
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    // Spring Boot 4 默认 Jackson 3(包名 tools.jackson),自动装配 JsonMapper Bean
    private final JsonMapper jsonMapper;
    private final RestClient restClient = RestClient.builder()
            .requestFactory(clientHttpRequestFactory())
            .build();

    public record TransferLog(String contract, String txHash, long blockNumber, String from, String to, BigInteger value) {}

    public long latestBlock(AppProperties.Chain chain) {
        JsonNode result = call(chain, "eth_blockNumber", List.of());
        return hexToLong(result.asText());
    }

    /** 扫描 [from,to] 区间内、目标代币合约、收款人为商户地址的 Transfer 事件。 */
    public List<TransferLog> transferLogsTo(AppProperties.Chain chain, List<String> contracts,
                                            String toAddress, long fromBlock, long toBlock) {
        // 注意:topics 第二位是 null 通配符(不限转出方)。List.of 不允许 null 元素(会抛无消息 NPE),
        // 必须用 Arrays.asList —— 2026-07 曾因此导致扫链任务每轮崩溃、转账永远无法入账。
        Map<String, Object> filter = Map.of(
                "fromBlock", toHex(fromBlock),
                "toBlock", toHex(toBlock),
                "address", contracts,
                "topics", Arrays.asList(TRANSFER_TOPIC, null, List.of(addressTopic(toAddress))));
        JsonNode logs = call(chain, "eth_getLogs", List.of(filter));
        List<TransferLog> out = new ArrayList<>();
        for (JsonNode log : logs) {
            if (log.path("removed").asBoolean(false)) continue;
            out.add(new TransferLog(
                    log.path("address").asText().toLowerCase(),
                    log.path("transactionHash").asText().toLowerCase(),
                    hexToLong(log.path("blockNumber").asText()),
                    topicToAddress(log.path("topics").path(1).asText()),
                    topicToAddress(log.path("topics").path(2).asText()),
                    hexToBigInt(log.path("data").asText())));
        }
        return out;
    }

    public JsonNode transactionReceipt(AppProperties.Chain chain, String txHash) {
        return call(chain, "eth_getTransactionReceipt", List.of(txHash));
    }

    /** 多端点故障切换调用。 */
    JsonNode call(AppProperties.Chain chain, String method, List<Object> params) {
        RuntimeException last = null;
        for (String url : chain.getRpcUrls()) {
            try {
                Map<String, Object> body = Map.of("jsonrpc", "2.0", "id", 1, "method", method, "params", params);
                String resp = restClient.post().uri(url)
                        .header("Content-Type", "application/json")
                        .body(jsonMapper.writeValueAsString(body))
                        .retrieve().body(String.class);
                JsonNode node = jsonMapper.readTree(resp);
                if (node.has("error") && !node.path("error").isNull()) {
                    throw new IllegalStateException("rpc error: " + node.path("error").toString());
                }
                return node.path("result");
            } catch (Exception e) {
                last = new IllegalStateException("rpc " + url + " failed: " + e.getMessage(), e);
                log.warn("rpc endpoint failed, trying next. chain={} url={} err={}", chain.getCode(), url, e.getMessage());
            }
        }
        throw last == null ? new IllegalStateException("no rpc url configured for " + chain.getCode()) : last;
    }

    private static org.springframework.http.client.SimpleClientHttpRequestFactory clientHttpRequestFactory() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(8));
        return factory;
    }

    public static String addressTopic(String address) {
        String clean = address.toLowerCase().replaceFirst("^0x", "");
        return "0x" + "0".repeat(64 - clean.length()) + clean;
    }

    public static String topicToAddress(String topic) {
        if (topic == null || topic.length() < 42) return "";
        return "0x" + topic.substring(topic.length() - 40).toLowerCase();
    }

    public static long hexToLong(String hex) {
        return Long.parseLong(hex.replaceFirst("^0x", ""), 16);
    }

    public static BigInteger hexToBigInt(String hex) {
        String clean = hex.replaceFirst("^0x", "");
        return clean.isEmpty() ? BigInteger.ZERO : new BigInteger(clean, 16);
    }

    public static String toHex(long value) {
        return "0x" + Long.toHexString(value);
    }
}
