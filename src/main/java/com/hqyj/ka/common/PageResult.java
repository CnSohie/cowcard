package com.hqyj.ka.common;

import org.springframework.data.domain.Page;
import java.util.List;
import java.util.function.Function;

public record PageResult<T>(List<T> items, long total, int page, int size) {
    public static <E, T> PageResult<T> of(Page<E> p, Function<E, T> mapper) {
        return new PageResult<>(p.getContent().stream().map(mapper).toList(),
                p.getTotalElements(), p.getNumber(), p.getSize());
    }
    public static <T> PageResult<T> of(Page<T> p) {
        return new PageResult<>(p.getContent(), p.getTotalElements(), p.getNumber(), p.getSize());
    }
}
