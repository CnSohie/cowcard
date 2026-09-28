package com.hqyj.ka.catalog.repo;

import com.hqyj.ka.catalog.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CategoryRepository extends JpaRepository<Category, Long> {
    List<Category> findByVisibleTrueOrderBySortOrderAscIdAsc();
    List<Category> findAllByOrderBySortOrderAscIdAsc();
}
