package com.hqyj.ka.security;

import com.hqyj.ka.user.entity.User;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/** 认证主体:权限 = 角色码(ROLE_x)+ 细粒度权限码,支持 @PreAuthorize("hasAuthority('card:write')")。 */
@Getter
public class LoginUser implements UserDetails {

    private final Long id;
    private final String username;
    private final String password;
    private final boolean enabled;
    private final boolean locked;
    private final List<SimpleGrantedAuthority> authorities;

    public LoginUser(User user, List<String> permissionCodes) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.password = user.getPassword();
        this.enabled = user.isEnabled();
        this.locked = user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now());
        this.authorities = permissionCodes.stream().map(SimpleGrantedAuthority::new).toList();
    }

    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
    @Override public String getPassword() { return password; }
    @Override public String getUsername() { return username; }
    @Override public boolean isAccountNonLocked() { return !locked; }
    @Override public boolean isEnabled() { return enabled; }
}
