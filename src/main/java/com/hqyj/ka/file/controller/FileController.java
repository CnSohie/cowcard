package com.hqyj.ka.file.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.file.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/** 管理端图片上传(商品封面 / 文章配图),返回可直接引用的 /files/** URL。 */
@RestController
@RequestMapping("/api/admin/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService storage;

    @PostMapping
    @PreAuthorize("hasAnyAuthority('product:write','article:write')")
    public ApiResponse<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.ok(Map.of("url", storage.storeImage(file)));
    }
}
