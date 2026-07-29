package com.hqyj.ka.risk.repo;

import com.hqyj.ka.risk.entity.RiskReview;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RiskReviewRepository extends JpaRepository<RiskReview, Long> {
    Page<RiskReview> findByStatus(RiskReview.Status status, Pageable pageable);
    Page<RiskReview> findBySubjectContainingIgnoreCaseOrSourceIdContainingIgnoreCase(String subject, String sourceId, Pageable pageable);
    Page<RiskReview> findByStatusAndSubjectContainingIgnoreCaseOrStatusAndSourceIdContainingIgnoreCase(
            RiskReview.Status s1, String subject, RiskReview.Status s2, String sourceId, Pageable pageable);
}
