package com.hqyj.ka.user.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.user.dto.UserDtos.*;
import com.hqyj.ka.user.entity.Permission;
import com.hqyj.ka.user.entity.Role;
import com.hqyj.ka.user.entity.User;
import com.hqyj.ka.user.repo.PermissionRepository;
import com.hqyj.ka.user.repo.RoleRepository;
import com.hqyj.ka.user.repo.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserAdminService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public Page<UserView> list(Pageable pageable) {
        return userRepository.findAll(pageable).map(this::toView);
    }

    @Transactional
    public UserView create(CreateUserRequest req) {
        if (userRepository.existsByUsername(req.username())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "用户名已存在");
        }
        User user = new User();
        user.setUsername(req.username());
        user.setPassword(passwordEncoder.encode(req.password()));
        user.setNickname(req.nickname());
        user.setRoles(resolveRoles(req.roleCodes()));
        return toView(userRepository.save(user));
    }

    @Transactional
    public UserView update(Long id, UpdateUserRequest req) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        boolean accessChanged = req.enabled() != null
                || (req.roleCodes() != null && !req.roleCodes().isEmpty())
                || (req.newPassword() != null && !req.newPassword().isBlank());
        if (req.nickname() != null) user.setNickname(req.nickname());
        if (req.enabled() != null) user.setEnabled(req.enabled());
        if (req.roleCodes() != null && !req.roleCodes().isEmpty()) user.setRoles(resolveRoles(req.roleCodes()));
        if (req.newPassword() != null && !req.newPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(req.newPassword()));
        }
        if (accessChanged) user.setTokenVersion(UUID.randomUUID().toString());
        return toView(user);
    }

    @Transactional(readOnly = true)
    public List<RoleView> roles() {
        return roleRepository.findAll().stream()
                .sorted(Comparator.comparing(Role::isBuiltin).reversed().thenComparing(Role::getCode))
                .map(r -> new RoleView(
                r.getId(), r.getCode(), r.getName(), r.getDescription(), r.isBuiltin(),
                r.getPermissions().stream().map(Permission::getCode).sorted().toList())).toList();
    }

    @Transactional(readOnly = true)
    public List<Permission> permissions() {
        return permissionRepository.findAll().stream()
                .sorted(Comparator.comparing(Permission::getGroupName).thenComparing(Permission::getCode))
                .toList();
    }

    @Transactional
    public RoleView saveRole(SaveRoleRequest req) {
        if ("SUPER_ADMIN".equals(req.code())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "超级管理员权限不可从界面修改");
        }
        Role role = roleRepository.findByCode(req.code()).orElseGet(Role::new);
        if (role.getId() != null && role.isBuiltin() && !"SUPER_ADMIN".equals(req.code())) {
            // 内置角色允许调整权限,但不允许改码
        }
        role.setCode(req.code());
        role.setName(req.name());
        role.setDescription(req.description());
        Set<String> requested = new HashSet<>(req.permissionCodes());
        var perms = permissionRepository.findAll().stream()
                .filter(p -> requested.contains(p.getCode()))
                .collect(Collectors.toSet());
        if (perms.size() != requested.size()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "包含不存在的权限码");
        }
        role.setPermissions(perms);
        Role saved = roleRepository.save(role);
        // 权限变更必须立即撤销所有管理员旧访问令牌,避免被移除的权限在令牌有效期内继续使用。
        userRepository.findAll().forEach(user -> user.setTokenVersion(UUID.randomUUID().toString()));
        return new RoleView(saved.getId(), saved.getCode(), saved.getName(), saved.getDescription(),
                saved.isBuiltin(), saved.getPermissions().stream().map(Permission::getCode).sorted().toList());
    }

    private HashSet<Role> resolveRoles(List<String> codes) {
        HashSet<Role> roles = new HashSet<>();
        for (String code : codes) {
            roles.add(roleRepository.findByCode(code)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "角色不存在: " + code)));
        }
        return roles;
    }

    private UserView toView(User u) {
        return new UserView(u.getId(), u.getUsername(), u.getNickname(), u.isEnabled(),
                u.getRoles().stream().map(Role::getCode).sorted().toList(),
                u.getLastLoginAt(), u.getLastLoginIp(), u.getCreatedAt());
    }
}
