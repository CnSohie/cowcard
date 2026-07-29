package com.hqyj.ka.payment.crypto.repo;

import com.hqyj.ka.payment.crypto.entity.ChainCursor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChainCursorRepository extends JpaRepository<ChainCursor, String> {
}
