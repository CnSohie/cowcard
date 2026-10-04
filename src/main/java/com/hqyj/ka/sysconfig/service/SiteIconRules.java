package com.hqyj.ka.sysconfig.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;

import java.util.regex.Pattern;

/** 站点图标只接受本站上传结果。留空表示使用内置图标。 */
public final class SiteIconRules {

    public static final String KEY = "site.icon";
    private static final Pattern UPLOADED = Pattern.compile("^/files/[A-Za-z0-9][A-Za-z0-9._/-]{0,180}$");

    private SiteIconRules() {}

    public static String normalize(String value) {
        if (value == null) return "";
        String icon = value.trim();
        if (icon.isEmpty()) return "";
        if (icon.contains("..") || !UPLOADED.matcher(icon).matches()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "站点图标只能使用本站上传的图片");
        }
        return icon;
    }
}
