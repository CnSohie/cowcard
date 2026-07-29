package com.hqyj.ka.user.repo;

import com.hqyj.ka.user.entity.Permission;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PermissionRepository extends JpaRepository<Permission, Long> {
}
