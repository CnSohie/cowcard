package com.hqyj.ka.member.repo;

import com.hqyj.ka.member.entity.MemberLevel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberLevelRepository extends JpaRepository<MemberLevel, Long> {
    Optional<MemberLevel> findBySlug(String slug);
    Optional<MemberLevel> findByDefaultLevelTrue();
    List<MemberLevel> findByEnabledTrueOrderBySortWeightDescIdDesc();
    List<MemberLevel> findAllByOrderBySortWeightAscIdAsc();
    long countByDefaultLevelTrueAndIdNot(Long id);
}
