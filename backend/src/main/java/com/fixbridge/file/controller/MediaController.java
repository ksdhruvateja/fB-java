package com.fixbridge.file.controller;

import com.fixbridge.file.service.MediaService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/media")
public class MediaController {

  private final MediaService mediaService;

  public MediaController(MediaService mediaService) {
    this.mediaService = mediaService;
  }

  @PostMapping("/upload")
  public Map<String, Object> upload(@RequestBody(required = false) Map<String, Object> body) {
    return mediaService.upload(body);
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable Long id) {
    return mediaService.get(id);
  }
}
