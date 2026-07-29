package com.hqyj.ka.member.repo;

import com.hqyj.ka.member.entity.Member;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmail(String email);

    Optional<Member> findByInviteCode(String inviteCode);

    boolean existsByEmail(String email);

    boolean existsByInviteCode(String inviteCode);

    long countByInviterId(Long inviterId);

    long countByEnabled(boolean enabled);

    Page<Member> findByEmailContainingIgnoreCaseOrNicknameContainingIgnoreCase(
            String email, String nickname, Pageable pageable);
}
