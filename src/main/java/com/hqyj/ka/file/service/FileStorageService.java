package com.hqyj.ka.file.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * 图片存储:本地磁盘(2C2G 单机),经 WebConfig 的 /files/** 静态映射对外服务。
 * 安全设计:
 *  - 魔数嗅探识别真实类型,不信任 Content-Type 与原始扩展名(防脚本伪装成图片)
 *  - 文件名 = UUID,服务端生成,客户端输入不进入路径(无穿越面、不可枚举)
 *  - 大小双闸:spring.servlet.multipart(容器层)+ ka.upload.max-size-mb(业务层)
 */
@Service
@RequiredArgsConstructor
public class FileStorageService {

    private final AppProperties props;

    /** 保存图片,返回可直接引用的公开 URL(/files/yyyyMM/uuid.ext)。 */
    public String storeImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "未选择文件");
        }
        int maxMb = props.getUpload().getMaxSizeMb();
        if (file.getSize() > maxMb * 1024L * 1024L) {
            throw new BusinessException(ErrorCode.UPLOAD_TOO_LARGE, "图片不能超过 " + maxMb + "MB");
        }

        byte[] head;
        try (InputStream in = file.getInputStream()) {
            head = in.readNBytes(16);
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "文件读取失败");
        }
        String ext = sniffImageExt(head);
        if (ext == null) {
            throw new BusinessException(ErrorCode.UPLOAD_TYPE);
        }

        String month = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        String name = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        Path dir = Paths.get(props.getUpload().getDir()).toAbsolutePath().normalize().resolve(month);
        try {
            Files.createDirectories(dir);
            file.transferTo(dir.resolve(name));
        } catch (IOException | IllegalStateException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件保存失败,请重试");
        }
        return "/files/" + month + "/" + name;
    }

    /** 魔数嗅探:PNG / JPEG / WEBP / GIF,其余一律拒绝。 */
    private static String sniffImageExt(byte[] h) {
        if (h.length >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return "png";
        if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) return "jpg";
        if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return "webp";
        if (h.length >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8'
                && (h[4] == '7' || h[4] == '9') && h[5] == 'a') return "gif";
        return null;
    }
}
