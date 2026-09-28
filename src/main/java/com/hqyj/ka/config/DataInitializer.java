package com.hqyj.ka.config;

import com.hqyj.ka.payment.alipay.AlipayOfficialStrategy;
import com.hqyj.ka.payment.balance.BalancePaymentStrategy;
import com.hqyj.ka.payment.crypto.CryptoTransferStrategy;
import com.hqyj.ka.payment.crypto.CryptoWalletStrategy;
import com.hqyj.ka.payment.entity.PaymentChannel;
import com.hqyj.ka.payment.epay.EpayStrategy;
import com.hqyj.ka.payment.repo.PaymentChannelRepository;
import com.hqyj.ka.payment.stripe.StripeStrategy;
import com.hqyj.ka.user.entity.Permission;
import com.hqyj.ka.user.entity.Role;
import com.hqyj.ka.user.entity.User;
import com.hqyj.ka.user.repo.PermissionRepository;
import com.hqyj.ka.user.repo.RoleRepository;
import com.hqyj.ka.user.repo.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.core.env.Environment;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 幂等种子数据:权限点 / 内置角色 / 初始管理员 / 支付渠道占位。
 * 初始管理员密码:生产环境必须通过 KA_ADMIN_INIT_PASSWORD 注入;开发环境未设置时随机生成并打印一次。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final PermissionRepository permissionRepository;
    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PaymentChannelRepository channelRepository;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;

    private static final List<String[]> PERMISSIONS = List.of(
            new String[]{"dashboard:read", "查看概览", "概览"},
            new String[]{"product:read", "查看商品", "商品"},
            new String[]{"product:write", "编辑商品", "商品"},
            new String[]{"card:read", "查看卡密库存", "卡密"},
            new String[]{"card:write", "导入/管理卡密", "卡密"},
            new String[]{"order:read", "查看订单", "订单"},
            new String[]{"order:write", "订单操作(补单/看卡)", "订单"},
            new String[]{"payment:config", "支付渠道配置", "支付"},
            new String[]{"user:manage", "用户管理", "系统"},
            new String[]{"role:manage", "角色权限管理", "系统"},
            new String[]{"audit:read", "查看审计日志", "系统"},
            new String[]{"config:write", "站点配置", "系统"},
            new String[]{"article:read", "查看文章", "媒体"},
            new String[]{"article:write", "撰写/管理文章", "媒体"},
            new String[]{"member:manage", "会员管理", "会员"},
            new String[]{"withdraw:review", "提现审核", "会员"},
            new String[]{"risk:review", "风控审核", "风控"},
            new String[]{"support:manage", "客服工单", "客服"},
            new String[]{"coupon:read", "查看优惠券", "营销"},
            new String[]{"coupon:manage", "管理优惠券", "营销"},
            new String[]{"gift-card:read", "查看礼品卡", "财务"},
            new String[]{"gift-card:manage", "管理礼品卡", "财务"},
            new String[]{"member:read", "查看会员", "会员"},
            new String[]{"member:status", "封禁/启用会员", "会员"},
            new String[]{"member-level:manage", "会员等级管理", "会员"},
            new String[]{"wallet:freeze", "冻结/解冻会员余额", "财务"},
            new String[]{"security:manage", "安全设置", "系统"});

    private static final Map<String, List<String>> ROLE_PERMS = Map.ofEntries(
            Map.entry("SUPER_ADMIN", List.of("*")),
            Map.entry("ADMIN", List.of("dashboard:read", "product:read", "product:write", "card:read", "card:write",
                    "order:read", "order:write", "coupon:read", "coupon:manage", "article:read", "article:write",
                    "member:read", "member:status", "member-level:manage", "support:manage", "risk:review")),
            Map.entry("OPS", List.of("dashboard:read", "product:read", "product:write", "card:read", "card:write",
                    "order:read", "order:write", "coupon:read", "coupon:manage", "article:read", "article:write")),
            Map.entry("ORDER_MANAGER", List.of("dashboard:read", "order:read", "order:write", "card:read", "support:manage")),
            Map.entry("FINANCE", List.of("dashboard:read", "order:read", "payment:config", "audit:read",
                    "withdraw:review", "gift-card:read", "gift-card:manage", "member:read")),
            Map.entry("RISK", List.of("dashboard:read", "order:read", "member:read", "member:status",
                    "wallet:freeze", "risk:review", "audit:read")),
            Map.entry("SUPPORT", List.of("dashboard:read", "order:read", "member:read", "support:manage")),
            Map.entry("CONTENT", List.of("dashboard:read", "article:read", "article:write", "config:write")),
            Map.entry("SECURITY_ADMIN", List.of("dashboard:read", "user:manage", "role:manage",
                    "audit:read", "config:write", "security:manage")),
            // 旧兼容角色:保留旧权限码,同时补少量新权限,避免升级后老账号菜单消失。
            Map.entry("LEGACY_MEMBER_MANAGER", List.of("member:manage", "member:read", "member:status", "member-level:manage")));

    private static final Map<String, String> ROLE_NAMES = Map.ofEntries(
            Map.entry("SUPER_ADMIN", "超级管理员"),
            Map.entry("ADMIN", "管理员"),
            Map.entry("OPS", "运营"),
            Map.entry("ORDER_MANAGER", "订单专员"),
            Map.entry("FINANCE", "财务"),
            Map.entry("RISK", "风控"),
            Map.entry("SUPPORT", "客服"),
            Map.entry("CONTENT", "内容运营"),
            Map.entry("SECURITY_ADMIN", "安全管理员"),
            Map.entry("LEGACY_MEMBER_MANAGER", "旧版会员管理员"));

    private static final Map<String, String> ROLE_DESCRIPTIONS = Map.ofEntries(
            Map.entry("SUPER_ADMIN", "平台最高权限,用于老板或核心技术负责人,拥有全部菜单与全部敏感操作能力。"),
            Map.entry("ADMIN", "日常综合管理员,可处理商品、订单、优惠券、文章、会员状态、客服与风控,不含支付配置和系统角色配置。"),
            Map.entry("OPS", "运营岗位,负责商品、卡密、订单、优惠券和媒体内容,不接触财务钱包与后台账号权限。"),
            Map.entry("ORDER_MANAGER", "订单专员,负责查单、补单、关闭订单、查看交付记录和协助客服处理发货问题。"),
            Map.entry("FINANCE", "财务岗位,负责支付渠道、提现审核、礼品卡和对账审计,默认不具备封禁会员能力。"),
            Map.entry("RISK", "风控岗位,负责异常订单审核、会员封禁与余额冻结,所有资金冻结继续走 2FA。"),
            Map.entry("SUPPORT", "客服岗位,负责查订单、查看会员基础信息和处理工单,不允许补单、冻结余额或改配置。"),
            Map.entry("CONTENT", "内容运营,负责媒体文章与基础展示配置,不接触订单、用户资金和后台账号。"),
            Map.entry("SECURITY_ADMIN", "安全管理员,负责后台账号、角色权限、安全设置和审计查看,不参与业务发货与财务处理。"),
            Map.entry("LEGACY_MEMBER_MANAGER", "升级兼容角色,用于承接旧 member:manage 权限,建议逐步替换为新细分角色。"));

    @Override
    @Transactional
    public void run(String... args) {
        // 权限点
        Set<String> existing = permissionRepository.findAll().stream()
                .map(Permission::getCode).collect(Collectors.toSet());
        for (String[] p : PERMISSIONS) {
            if (!existing.contains(p[0])) permissionRepository.save(new Permission(p[0], p[1], p[2]));
        }
        List<Permission> allPerms = permissionRepository.findAll();

        // 内置角色
        for (var entry : ROLE_PERMS.entrySet()) {
            Role role = roleRepository.findByCode(entry.getKey()).orElseGet(() -> {
                Role r = new Role();
                r.setCode(entry.getKey());
                return r;
            });
            role.setName(ROLE_NAMES.get(entry.getKey()));
            role.setDescription(ROLE_DESCRIPTIONS.get(entry.getKey()));
            role.setBuiltin(true);
            if (role.getId() == null) {
                Set<Permission> perms = entry.getValue().contains("*") ? new HashSet<>(allPerms)
                        : allPerms.stream().filter(p -> entry.getValue().contains(p.getCode()))
                                .collect(Collectors.toSet());
                role.setPermissions(perms);
                roleRepository.save(role);
            } else if (entry.getValue().contains("*")) {
                // 超管每次启动补齐全量权限:老库升级后新增的权限点(如媒体/会员)自动到位。
                // 权限写在 JWT 里,已登录管理员需重新登录才能拿到新权限。
                Set<String> owned = role.getPermissions().stream()
                        .map(Permission::getCode).collect(Collectors.toSet());
                List<Permission> missing = allPerms.stream()
                        .filter(p -> !owned.contains(p.getCode())).toList();
                if (!missing.isEmpty()) {
                    role.getPermissions().addAll(missing);
                    roleRepository.save(role);
                    log.info("角色 {} 补齐新增权限: {}", role.getCode(),
                            missing.stream().map(Permission::getCode).collect(Collectors.joining(", ")));
                }
            } else {
                Set<String> owned = role.getPermissions().stream()
                        .map(Permission::getCode).collect(Collectors.toSet());
                List<Permission> missing = allPerms.stream()
                        .filter(p -> entry.getValue().contains(p.getCode()) && !owned.contains(p.getCode()))
                        .toList();
                if (!missing.isEmpty()) {
                    role.getPermissions().addAll(missing);
                    roleRepository.save(role);
                    log.info("角色 {} 补齐新增权限: {}", role.getCode(),
                            missing.stream().map(Permission::getCode).collect(Collectors.joining(", ")));
                }
            }
        }

        // 初始管理员
        if (userRepository.count() == 0) {
            String initPassword = System.getenv("KA_ADMIN_INIT_PASSWORD");
            if (isProduction() && (initPassword == null || initPassword.isBlank())) {
                throw new IllegalStateException("生产环境必须设置 KA_ADMIN_INIT_PASSWORD,拒绝生成并记录随机管理员密码");
            }
            boolean generated = initPassword == null || initPassword.isBlank();
            if (generated) initPassword = randomPassword();
            User admin = new User();
            admin.setUsername("admin");
            admin.setNickname("超级管理员");
            admin.setPassword(passwordEncoder.encode(initPassword));
            admin.getRoles().add(roleRepository.findByCode("SUPER_ADMIN").orElseThrow());
            userRepository.save(admin);
            if (generated) {
                log.warn("==================================================================");
                log.warn("  初始管理员已创建: admin / {}   (仅打印一次,登录后立即修改!)", initPassword);
                log.warn("==================================================================");
            } else {
                log.info("初始管理员已创建: admin(密码来自 KA_ADMIN_INIT_PASSWORD)");
            }
        }

        // 支付渠道占位(默认停用,后台配置后启用)
        seedChannel(AlipayOfficialStrategy.CODE, "支付宝", 1);
        seedChannel(EpayStrategy.CODE, "支付宝(聚合)", 2);
        seedChannel(CryptoTransferStrategy.CODE, "USDT/USDC 转账", 3);
        seedChannel(CryptoWalletStrategy.CODE, "连接钱包支付", 4);
        seedChannel(StripeStrategy.CODE, "信用卡支付", 5);
        seedChannel(BalancePaymentStrategy.CODE, "余额支付", 6, true);
    }

    private boolean isProduction() {
        for (String profile : environment.getActiveProfiles()) {
            if ("prod".equalsIgnoreCase(profile)) return true;
        }
        return false;
    }

    private void seedChannel(String code, String name, int sort) {
        seedChannel(code, name, sort, false);
    }

    private void seedChannel(String code, String name, int sort, boolean enabled) {
        if (channelRepository.findAll().stream().noneMatch(c -> c.getCode().equals(code))) {
            PaymentChannel ch = new PaymentChannel();
            ch.setCode(code);
            ch.setDisplayName(name);
            ch.setEnabled(enabled);
            ch.setSortOrder(sort);
            channelRepository.save(ch);
        }
    }

    private String randomPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder("Ka");
        for (int i = 0; i < 14; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }
}
