package com.fixbridge.file.service;

import com.fixbridge.file.entity.MediaObjectEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.file.repository.MediaObjectRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class MediaService {

  private static final int MAX_CHARS = 6_000_000;

  private final MediaObjectRepository mediaObjectRepository;

  public MediaService(MediaObjectRepository mediaObjectRepository) {
    this.mediaObjectRepository = mediaObjectRepository;
  }

  @Transactional
  public Map<String, Object> upload(Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (body == null || body.get("dataUrl") == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "dataUrl is required.");
    }
    String dataUrl = String.valueOf(body.get("dataUrl"));
    if (!dataUrl.startsWith("data:")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "dataUrl must start with data:");
    }
    if (dataUrl.length() > MAX_CHARS) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Media payload too large.");
    }
    String contentType =
        body.get("contentType") != null
            ? String.valueOf(body.get("contentType"))
            : detectMime(dataUrl);
    Long jobId = null;
    if (body.get("jobId") != null) {
      try {
        jobId = Long.valueOf(String.valueOf(body.get("jobId")));
      } catch (NumberFormatException ignored) {
        jobId = null;
      }
    }

    MediaObjectEntity media = new MediaObjectEntity();
    media.setOwnerUserId(principal.getId());
    media.setJobId(jobId);
    media.setKind(body.get("kind") != null ? String.valueOf(body.get("kind")) : "upload");
    media.setContentType(contentType);
    media.setByteSize(dataUrl.length());
    media.setDataUrl(dataUrl);
    media.setStorageKey("inline:" + principal.getId() + ":" + System.currentTimeMillis());
    media = mediaObjectRepository.save(media);

    Map<String, Object> mediaDto = new LinkedHashMap<>();
    mediaDto.put("id", media.getId());
    mediaDto.put("kind", media.getKind());
    mediaDto.put("contentType", media.getContentType());
    mediaDto.put("byteSize", media.getByteSize());
    mediaDto.put("jobId", media.getJobId());
    mediaDto.put("createdAt", media.getCreatedAt() != null ? media.getCreatedAt().toString() : null);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("media", mediaDto);
    response.put("signedUrl", "/api/media/" + media.getId());
    response.put("mode", "inline");
    return response;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    MediaObjectEntity media =
        mediaObjectRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Media not found."));
    boolean allowed =
        SecurityUtils.isAdminRole(principal)
            || (media.getOwnerUserId() != null && media.getOwnerUserId().equals(principal.getId()));
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("id", media.getId());
    body.put("dataUrl", media.getDataUrl());
    body.put("contentType", media.getContentType());
    return body;
  }

  private static String detectMime(String dataUrl) {
    int semi = dataUrl.indexOf(';');
    if (dataUrl.startsWith("data:") && semi > 5) {
      return dataUrl.substring(5, semi);
    }
    return "application/octet-stream";
  }
}
